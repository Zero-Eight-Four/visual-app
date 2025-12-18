import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname, join, extname, basename } from 'path';
import { readdir, writeFile, mkdir, rm, readFile, rename, copyFile, stat, access } from 'fs/promises';
import { createReadStream, createWriteStream, statSync, constants } from 'fs';
import http from 'http';
import https from 'https';
import { getRocketMQBridge } from './rocketmqBridge.js';
import { ScheduleManager } from './scheduleManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;
const TARGET_API = 'http://8.148.247.53:8000';
const mqBridgePromise = getRocketMQBridge();

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

app.use(express.json());

// Serve static files for maps
app.use('/maps', express.static(join(__dirname, '../maps')));

// 优化的流式处理：使用固定大小缓冲区，避免内存溢出
async function processMultipartStream(req, res, processor) {
    return new Promise((resolve) => {
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
            res.status(400).json({ success: false, error: 'Invalid content type' });
            resolve();
            return;
        }

        const boundary = contentType.split('boundary=')[1]?.trim();
        if (!boundary) {
            res.status(400).json({ success: false, error: 'No boundary found' });
            resolve();
            return;
        }

        const tempDir = join(__dirname, '../temp');
        const tempFilePath = join(tempDir, `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`);

        mkdir(tempDir, { recursive: true }).catch(() => { });

        const writeStream = createWriteStream(tempFilePath);
        let totalSize = 0;
        const MAX_SIZE = 512 * 1024 * 1024; // 512MB
        let writeError = null;
        let writePromise = Promise.resolve();
        let isDraining = false;

        req.on('data', (chunk) => {
            if (writeError) return;

            totalSize += chunk.length;
            if (totalSize > MAX_SIZE) {
                req.destroy();
                writeStream.destroy();
                res.status(413).json({ success: false, error: 'File too large (max 512MB)' });
                resolve();
                return;
            }

            if (!writeStream.write(chunk)) {
                if (!isDraining) {
                    isDraining = true;
                    writePromise = new Promise((resolveDrain) => {
                        writeStream.once('drain', () => {
                            isDraining = false;
                            resolveDrain();
                        });
                    });
                }
            }
        });

        req.on('end', async () => {
            try {
                await writePromise;
                writeStream.end();
                await new Promise((resolveWrite, rejectWrite) => {
                    writeStream.on('finish', resolveWrite);
                    writeStream.on('error', rejectWrite);
                });

                const fileStats = statSync(tempFilePath);
                if (fileStats.size > MAX_SIZE) {
                    await rm(tempFilePath, { force: true });
                    res.status(413).json({ success: false, error: 'File too large (max 512MB)' });
                    resolve();
                    return;
                }

                const SMALL_FILE_THRESHOLD = 10 * 1024 * 1024;
                let buffer;
                if (fileStats.size < SMALL_FILE_THRESHOLD) {
                    buffer = await readFile(tempFilePath);
                } else {
                    buffer = await readFile(tempFilePath);
                }

                const boundaryMarker = `--${boundary}`;
                const boundaryBuffer = Buffer.from(boundaryMarker);
                const parts = [];
                let searchIndex = 0;
                const boundaries = [];
                while (true) {
                    const index = buffer.indexOf(boundaryBuffer, searchIndex);
                    if (index === -1) break;
                    boundaries.push(index);
                    searchIndex = index + boundaryBuffer.length;
                }

                for (let i = 0; i < boundaries.length - 1; i++) {
                    const start = boundaries[i] + boundaryBuffer.length;
                    const end = boundaries[i + 1];
                    let partStart = start;
                    if (buffer[partStart] === 0x0d && buffer[partStart + 1] === 0x0a) partStart += 2;
                    let partEnd = end;
                    if (partEnd >= 2 && buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) partEnd -= 2;
                    if (partEnd > partStart) parts.push(buffer.subarray(partStart, partEnd));
                }

                buffer = null;
                const fields = {};
                const files = [];

                for (const part of parts) {
                    const headerEndMarker = Buffer.from('\r\n\r\n');
                    const headerEnd = part.indexOf(headerEndMarker);
                    if (headerEnd > 0) {
                        const header = part.toString('utf8', 0, headerEnd);
                        const dataStart = headerEnd + 4;
                        let dataEnd = part.length;
                        if (dataEnd >= 2 && part[dataEnd - 2] === 0x0d && part[dataEnd - 1] === 0x0a) dataEnd -= 2;
                        const data = part.subarray(dataStart, dataEnd);
                        const fieldNameMatch = header.match(/name="([^"]+)"/);
                        if (fieldNameMatch) {
                            const fieldName = fieldNameMatch[1];
                            if (header.includes('filename=')) {
                                const filenameMatch = header.match(/filename="([^"]+)"/) || header.match(/filename=([^\r\n]+)/);
                                if (filenameMatch) {
                                    files.push({
                                        fieldName,
                                        filename: filenameMatch[1].trim(),
                                        data: Buffer.from(data)
                                    });
                                }
                            } else {
                                fields[fieldName] = data.toString('utf8').trim();
                            }
                        }
                    }
                }

                parts.length = 0;
                await rm(tempFilePath, { force: true });

                try {
                    const result = await processor(fields, files);
                    if (result && !result.success) res.status(400);
                    res.json(result);
                } catch (processorError) {
                    console.error('Processor error:', processorError);
                    res.status(500).json({ success: false, error: processorError.message || 'Processing failed' });
                }
                resolve();
            } catch (error) {
                console.error('Multipart processing error:', error);
                try { await rm(tempFilePath, { force: true }); } catch (e) { }
                if (!res.headersSent) res.status(500).json({ success: false, error: error.message || 'Processing failed' });
                resolve();
            }
        });

        writeStream.on('error', (error) => {
            writeError = error;
            req.destroy();
        });

        req.on('error', async (error) => {
            writeStream.destroy();
            try { await rm(tempFilePath, { force: true }); } catch (e) { }
            if (!res.headersSent) res.status(500).json({ success: false, error: 'Request error' });
            resolve();
        });
    });
}

// Middleware for JSON body parsing (for non-multipart requests)
app.use(express.json());

// Serve static files
app.use(express.static(join(__dirname, '../dist')));

// Maps Directory Listing
app.use('/maps', async (req, res, next) => {
    if (req.path.startsWith('/api')) return next(); // Skip API routes

    try {
        const mapsDir = join(__dirname, '../maps');
        const urlPath = req.path === '/' ? '' : req.path;

        if (urlPath === '' || urlPath === '/') {
            const entries = await readdir(mapsDir, { withFileTypes: true });
            const folders = entries.filter(e => e.isDirectory());
            const html = `<html><body><h1>Maps Directory</h1><ul>${folders.map(f => `<li><a href="/maps/${f.name}/">${f.name}/</a></li>`).join('')}</ul></body></html>`;
            return res.send(html);
        }

        const filePath = join(mapsDir, urlPath.replace(/^\//, ''));
        try {
            const stats = statSync(filePath);
            if (stats.isFile()) {
                return res.sendFile(filePath);
            }
            if (stats.isDirectory()) {
                const entries = await readdir(filePath, { withFileTypes: true });
                const html = `<html><body><h1>Directory: ${urlPath}</h1><ul>${entries.map(e => `<li><a href="${e.name}${e.isDirectory() ? '/' : ''}">${e.name}${e.isDirectory() ? '/' : ''}</a></li>`).join('')}</ul></body></html>`;
                return res.send(html);
            }
            next();
        } catch (e) {
            next();
        }
    } catch (e) {
        next();
    }
});

// 404 for missing map files (prevent SPA fallback)
app.use('/maps', (req, res) => {
    res.status(404).send('File not found');
});

// API Routes
app.post('/api/maps/upload', async (req, res) => {
    await processMultipartStream(req, res, async (fields, files) => {
        const mapsDir = join(__dirname, '../maps');
        let fileName = '', fileData = null, folderName = fields.folderName || '';
        for (const file of files) {
            if (file.fieldName === 'file') {
                fileName = file.filename;
                fileData = file.data;
                break;
            }
        }
        if (!fileName || !fileData) throw new Error('No file provided');
        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!safeFileName.endsWith('.pgm')) throw new Error('Only .pgm files are allowed');

        let filePath;
        if (folderName && folderName.trim()) {
            const targetDir = join(mapsDir, folderName.trim().replace(/[^a-zA-Z0-9._-]/g, '_'), 'map');
            await mkdir(targetDir, { recursive: true });
            filePath = join(targetDir, safeFileName);
        } else {
            filePath = join(mapsDir, safeFileName);
        }
        await writeFile(filePath, fileData);
        return { success: true, fileName: safeFileName };
    });
});

app.get('/api/maps/list', async (req, res) => {
    try {
        const mapsDir = join(__dirname, '../maps');
        const entries = await readdir(mapsDir, { withFileTypes: true });
        const folders = entries.filter(e => e.isDirectory()).map(e => e.name);
        res.json({ success: true, folders });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

app.get('/api/maps/files', async (req, res) => {
    try {
        const folderName = req.query.folder;
        const subDir = req.query.subDir || '';
        if (!folderName) return res.status(400).json({ success: false, error: 'Missing folder parameter' });

        const targetDir = join(__dirname, '../maps', folderName, subDir);
        try {
            const entries = await readdir(targetDir, { withFileTypes: true });
            const files = entries.filter(e => e.isFile()).map(e => ({
                name: e.name,
                url: `/maps/${folderName}/${subDir ? subDir + '/' : ''}${e.name}`
            }));
            res.json({ success: true, files });
        } catch (err) {
            res.json({ success: true, files: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

app.post('/api/maps/update-config', async (req, res) => {
    try {
        const { folderName, config } = req.body;
        if (!folderName || !config) return res.status(400).json({ success: false, error: 'Missing required fields' });

        const mapsDir = join(__dirname, '../maps');
        const mapFolderPath = join(mapsDir, folderName);
        const configPath = join(mapFolderPath, 'config.json');

        // Read existing config to merge
        let existingConfig = {};
        try {
            const data = await readFile(configPath, 'utf-8');
            existingConfig = JSON.parse(data);
        } catch (e) {
            // Ignore if file doesn't exist
        }

        const newConfig = { ...existingConfig, ...config };
        await writeFile(configPath, JSON.stringify(newConfig, null, 2));
        res.json({ success: true, config: newConfig });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

app.delete('/api/maps/delete', async (req, res) => {
    try {
        const folderName = req.query.folderName;
        if (!folderName || folderName.includes('..')) return res.status(400).json({ success: false, error: 'Invalid folder name' });
        const targetDir = join(__dirname, '../maps', folderName);
        await rm(targetDir, { recursive: true, force: true });
        res.json({ success: true, message: 'Map folder deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

app.post('/api/maps/upload-folder', async (req, res) => {
    await processMultipartStream(req, res, async (fields, files) => {
        const mapsDir = join(__dirname, '../maps');
        const folderName = fields.folderName || '';
        const mapName = fields.mapName || '';
        const description = fields.description || '';
        const fileItems = files.filter(f => f.fieldName === 'files');

        if (!folderName || !mapName || fileItems.length === 0) return { success: false, error: 'Missing required fields' };

        const mapFolderPath = join(mapsDir, folderName);
        await mkdir(mapFolderPath, { recursive: true });

        for (const file of fileItems) {
            const filePath = join(mapFolderPath, file.filename);
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, file.data);
        }

        await writeFile(join(mapFolderPath, 'config.json'), JSON.stringify({ name: mapName, description }, null, 2));
        return { success: true, folderName, mapName };
    });
});

app.post('/api/maps/save', async (req, res) => {
    await processMultipartStream(req, res, async (fields, files) => {
        const mapsDir = join(__dirname, '../maps');
        const folderName = fields.folderName || '';
        const mapName = fields.mapName || '';
        const description = fields.description || '';
        const fileItems = files.filter(f => f.fieldName === 'files');

        if (!folderName || !mapName || fileItems.length === 0) return { success: false, error: 'Missing required fields' };

        const mapFolderPath = join(mapsDir, folderName);
        await mkdir(mapFolderPath, { recursive: true });

        for (const file of fileItems) {
            const ext = extname(file.filename).toLowerCase();
            const fileNameOnly = basename(file.filename);
            let targetPath;

            if (['.pgm', '.yaml', '.yml', '.pcd'].includes(ext)) {
                targetPath = join(mapFolderPath, 'map', fileNameOnly);
            } else if (ext === '.json' && fileNameOnly !== 'config.json') {
                targetPath = join(mapFolderPath, 'queue', fileNameOnly);
            } else {
                if (fileNameOnly === 'config.json') {
                    targetPath = join(mapFolderPath, fileNameOnly);
                } else {
                    targetPath = join(mapFolderPath, 'map', fileNameOnly);
                }
            }

            await mkdir(dirname(targetPath), { recursive: true });
            await writeFile(targetPath, file.data);
        }

        if (fields.filesToCopy) {
            try {
                const filesToCopy = JSON.parse(fields.filesToCopy);
                for (const fileInfo of filesToCopy) {
                    try {
                        const sourcePath = join(mapsDir, fileInfo.path);
                        const targetPath = join(mapFolderPath, fileInfo.targetPath);
                        await mkdir(dirname(targetPath), { recursive: true });
                        await copyFile(sourcePath, targetPath);
                    } catch (e) { console.error(`Error copying file ${fileInfo.path}:`, e); }
                }
            } catch (e) { console.error('Error parsing filesToCopy:', e); }
        }

        await writeFile(join(mapFolderPath, 'config.json'), JSON.stringify({ name: mapName, description }, null, 2));
        return { success: true, folderName, mapName };
    });
});

app.post('/api/maps/save-new-map', async (req, res) => {
    await processMultipartStream(req, res, async (fields, files) => {
        const mapsDir = join(__dirname, '../maps');
        const folderName = fields.folderName || '';
        const mapName = fields.mapName || '';
        const description = fields.description || '';
        const fileItems = files.filter(f => f.fieldName === 'files');

        if (!folderName || !mapName) return { success: false, error: 'Missing required fields' };

        const mapFolderPath = join(mapsDir, folderName);
        await mkdir(mapFolderPath, { recursive: true });

        for (const file of fileItems) {
            const filePath = join(mapFolderPath, file.filename);
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, file.data);
        }

        if (fields.filesToCopy) {
            try {
                const filesToCopy = JSON.parse(fields.filesToCopy);
                for (const fileInfo of filesToCopy) {
                    try {
                        const sourcePath = join(mapsDir, fileInfo.path);
                        const targetPath = join(mapFolderPath, fileInfo.targetPath);
                        await mkdir(dirname(targetPath), { recursive: true });
                        await copyFile(sourcePath, targetPath);
                    } catch (e) { console.error(e); }
                }
            } catch (e) { }
        }

        await writeFile(join(mapFolderPath, 'config.json'), JSON.stringify({ name: mapName, description }, null, 2));
        return { success: true, folderName, mapName };
    });
});

app.post('/api/videos/upload', async (req, res) => {
    await processMultipartStream(req, res, async (fields, files) => {
        const videosDir = join(__dirname, '../videos');
        let fileName = '', fileData = null;
        for (const file of files) {
            if (file.fieldName === 'video') {
                fileName = file.filename;
                fileData = file.data;
                break;
            }
        }
        if (!fileName || !fileData) throw new Error('No video file provided');
        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!safeFileName.endsWith('.webm')) throw new Error('Only .webm files allowed');

        const now = new Date();
        const dateFolder = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const dateDir = join(videosDir, dateFolder);
        await mkdir(dateDir, { recursive: true });

        await writeFile(join(dateDir, safeFileName), fileData);
        return { success: true, fileName: safeFileName, folder: dateFolder };
    });
});

app.get('/api/videos/list', async (req, res) => {
    try {
        const videosDir = join(__dirname, '../videos');
        await mkdir(videosDir, { recursive: true });
        const entries = await readdir(videosDir, { withFileTypes: true });
        const dates = [];
        const videosMap = {};

        for (const entry of entries) {
            if (entry.isDirectory() && /^\d{8}$/.test(entry.name)) {
                const folderPath = join(videosDir, entry.name);
                const videoEntries = await readdir(folderPath, { withFileTypes: true });
                const videos = [];
                const dateStr = entry.name;
                const formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;

                for (const ve of videoEntries) {
                    if (ve.isFile() && (ve.name.endsWith('.webm') || ve.name.endsWith('.mp4'))) {
                        const stats = statSync(join(folderPath, ve.name));
                        videos.push({
                            name: ve.name,
                            path: join(folderPath, ve.name),
                            size: stats.size,
                            modified: stats.mtime.getTime() / 1000
                        });
                    }
                }
                if (videos.length > 0) {
                    dates.push(formattedDate);
                    videosMap[formattedDate] = videos;
                }
            }
        }
        dates.sort((a, b) => b.localeCompare(a));
        res.json({ dates, videos: videosMap });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

app.delete('/api/videos/delete', async (req, res) => {
    try {
        const { fileName, folder } = req.body;
        if (!fileName || fileName.includes('..')) return res.status(400).json({ success: false, error: 'Invalid file name' });
        if (folder && (folder.includes('..') || !/^\d{8}$/.test(folder))) return res.status(400).json({ success: false, error: 'Invalid folder' });

        const videosDir = join(__dirname, '../videos');
        const filePath = folder ? join(videosDir, folder, fileName) : join(videosDir, fileName);
        await rm(filePath);
        res.json({ success: true, message: 'Video deleted' });
    } catch (error) {
        res.status(404).json({ success: false, error: 'File not found' });
    }
});

app.get('/api/videos/download', async (req, res) => {
    try {
        const videosDir = join(__dirname, '../videos');
        const fileName = req.query.fileName;
        const folder = req.query.folder;

        if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
            return res.status(400).json({ success: false, error: 'Invalid file name' });
        }

        if (folder && (folder.includes('..') || folder.includes('/') || folder.includes('\\') || !/^\d{8}$/.test(folder))) {
            return res.status(400).json({ success: false, error: 'Invalid folder name' });
        }

        const filePath = folder ? join(videosDir, folder, decodeURIComponent(fileName)) : join(videosDir, decodeURIComponent(fileName));

        try {
            const stats = statSync(filePath);
            if (!stats.isFile()) {
                return res.status(404).json({ success: false, error: 'File not found' });
            }

            res.setHeader('Content-Type', 'video/webm');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            res.setHeader('Content-Length', stats.size);

            const readStream = createReadStream(filePath);
            readStream.pipe(res);
        } catch (error) {
            res.status(404).json({ success: false, error: 'File not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

app.post('/api/videos/rename', async (req, res) => {
    try {
        const { oldName, newName, folder } = req.body;
        if (!oldName || !newName || oldName.includes('..') || newName.includes('..')) return res.status(400).json({ success: false, error: 'Invalid names' });

        const videosDir = join(__dirname, '../videos');
        const safeNewName = newName.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!safeNewName.endsWith('.webm')) return res.status(400).json({ success: false, error: 'Must end with .webm' });

        const oldPath = folder ? join(videosDir, folder, oldName) : join(videosDir, oldName);
        const newPath = folder ? join(videosDir, folder, safeNewName) : join(videosDir, safeNewName);

        await rename(oldPath, newPath);
        res.json({ success: true, newName: safeNewName });
    } catch (error) {
        res.status(404).json({ success: false, error: 'File not found' });
    }
});

app.delete('/api/local/reports/delete', async (req, res) => {
    try {
        const fileName = req.query.fileName;
        if (!fileName || fileName.includes('..')) return res.status(400).json({ success: false, error: 'Invalid file name' });

        const reportsDir = '/home/sll/Qwen/backend/results/reports';
        const filePath = join(reportsDir, fileName);

        await access(filePath, constants.W_OK);
        await rm(filePath);
        res.json({ success: true, message: 'Report deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
    }
});

app.post('/api/maps/download-from-robot', async (req, res) => {
    let mapNameForCleanup = null;
    try {
        let requestData;
        if (req.body && (req.body.robotUrl || req.body.files)) {
            requestData = req.body;
        } else {
            let body = '';
            await new Promise((resolve, reject) => {
                req.on('data', (chunk) => { body += chunk.toString(); });
                req.on('end', () => resolve());
                req.on('error', reject);
            });
            if (body) {
                requestData = JSON.parse(body);
            }
        }

        if (!requestData) {
            res.status(400).json({ success: false, error: 'Empty request body' });
            return;
        }

        const { robotUrl, files, mapName, description, folderName } = requestData;
        const targetFolderName = folderName || mapName;
        if (targetFolderName) mapNameForCleanup = targetFolderName;

        if (!robotUrl || !files || !Array.isArray(files) || files.length === 0 || !mapName) {
            res.status(400).json({ success: false, error: 'Invalid request: robotUrl, mapName and files array required' });
            return;
        }

        const robotUrlObj = new URL(robotUrl);
        const robotHost = robotUrlObj.hostname;
        const robotPort = parseInt(robotUrlObj.port || '8080', 10);
        const apiPrefix = '/api/files';

        try {
            const healthCheck = await new Promise((resolve) => {
                const healthReq = http.get({
                    hostname: robotHost,
                    port: robotPort,
                    path: `${apiPrefix}/health`,
                    timeout: 5000
                }, (healthRes) => {
                    let data = '';
                    healthRes.on('data', (chunk) => { data += chunk.toString(); });
                    healthRes.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            resolve(result.success === true);
                        } catch {
                            resolve(false);
                        }
                    });
                });
                healthReq.on('error', () => resolve(false));
                healthReq.on('timeout', () => {
                    healthReq.destroy();
                    resolve(false);
                });
            });

            if (!healthCheck) {
                res.status(500).json({ success: false, error: 'Robot file service not responding to health check' });
                return;
            }
        } catch (error) {
            res.status(500).json({ success: false, error: `Cannot connect to robot file service: ${String(error)}` });
            return;
        }

        const mapsDir = join(__dirname, '../maps');
        const targetFolderPath = join(mapsDir, targetFolderName);
        await mkdir(targetFolderPath, { recursive: true });

        let totalSize = 0;
        for (const file of files) {
            totalSize += (file.fileSize || file.size || 0);
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        res.write(`data: ${JSON.stringify({ type: 'init', totalSize, totalFiles: files.length })}\n\n`);

        let downloadedSize = 0;

        for (const file of files) {
            const remotePath = file.remotePath || file.path;
            const fileName = file.fileName || file.name;
            const fileSize = file.fileSize || file.size || 0;

            if (!fileName || !remotePath) {
                console.error('Invalid file info:', file);
                res.write(`data: ${JSON.stringify({
                    type: 'fileError',
                    fileName: fileName || 'unknown',
                    error: 'Missing file name or path'
                })}\n\n`);
                continue;
            }

            const ext = extname(fileName).toLowerCase();
            let targetFilePath;

            if (['.pgm', '.yaml', '.yml', '.pcd'].includes(ext)) {
                targetFilePath = join(targetFolderPath, 'map', fileName);
            } else if (ext === '.json' && fileName !== 'config.json') {
                targetFilePath = join(targetFolderPath, 'queue', fileName);
            } else {
                if (fileName === 'config.json') {
                    targetFilePath = join(targetFolderPath, fileName);
                } else {
                    targetFilePath = join(targetFolderPath, 'map', fileName);
                }
            }

            await mkdir(dirname(targetFilePath), { recursive: true });

            res.write(`data: ${JSON.stringify({
                type: 'fileStart',
                fileName,
                fileSize
            })}\n\n`);

            let resumeFrom = 0;
            try {
                const existingStats = statSync(targetFilePath);
                if (existingStats.isFile() && existingStats.size > 0 && existingStats.size < fileSize) {
                    resumeFrom = existingStats.size;
                }
            } catch (e) {
                resumeFrom = 0;
            }

            await new Promise((resolveFile, rejectFile) => {
                const downloadOptions = {
                    hostname: robotHost,
                    port: robotPort,
                    path: `${apiPrefix}/download?path=${encodeURIComponent(remotePath)}&_t=${Date.now()}`,
                    timeout: 10 * 60 * 1000,
                    method: 'GET'
                };

                if (resumeFrom > 0 && fileSize > 0) {
                    downloadOptions.headers = {
                        'Range': `bytes=${resumeFrom}-${fileSize - 1}`
                    };
                }

                const downloadReq = http.request(downloadOptions, (downloadRes) => {
                    if (downloadRes.statusCode !== 200 && downloadRes.statusCode !== 206) {
                        rejectFile(new Error(`HTTP ${downloadRes.statusCode}`));
                        return;
                    }

                    const writeStream = resumeFrom > 0
                        ? createWriteStream(targetFilePath, { flags: 'a' })
                        : createWriteStream(targetFilePath);

                    let receivedBytes = resumeFrom;
                    let lastUpdateTime = Date.now();
                    const contentLength = downloadRes.headers['content-length'];
                    const expectedSize = contentLength ? parseInt(contentLength, 10) : (fileSize - resumeFrom);

                    if (downloadRes.statusCode === 206) {
                        downloadedSize += resumeFrom;
                    }

                    downloadRes.on('data', (chunk) => {
                        receivedBytes += chunk.length;
                        downloadedSize += chunk.length;

                        const now = Date.now();
                        if (now - lastUpdateTime > 500 || receivedBytes >= (resumeFrom + expectedSize)) {
                            const overallProgress = totalSize > 0 ? Math.min(100, (downloadedSize / totalSize) * 100) : 0;
                            res.write(`data: ${JSON.stringify({
                                type: 'progress',
                                fileName,
                                fileSize,
                                downloadedSize,
                                totalSize,
                                progress: overallProgress
                            })}\n\n`);
                            lastUpdateTime = now;
                        }
                    });

                    downloadRes.on('end', () => {
                        writeStream.end();
                        res.write(`data: ${JSON.stringify({
                            type: 'fileComplete',
                            fileName,
                            downloadedSize,
                            totalSize,
                            progress: totalSize > 0 ? Math.min(100, (downloadedSize / totalSize) * 100) : 100
                        })}\n\n`);
                        resolveFile();
                    });

                    downloadRes.on('error', (error) => {
                        writeStream.destroy();
                        rejectFile(error);
                    });

                    downloadRes.pipe(writeStream);

                    writeStream.on('error', (error) => {
                        downloadRes.destroy();
                        rejectFile(error);
                    });
                });

                downloadReq.on('error', (err) => {
                    const errorCode = err.code || '';
                    let errorMsg = 'Download failed';
                    if (errorCode === 'ECONNREFUSED') {
                        errorMsg = `Connection refused (${robotHost}:${robotPort})`;
                    } else if (errorCode === 'ETIMEDOUT' || errorCode === 'TIMEOUT') {
                        errorMsg = `Connection timeout (${robotHost}:${robotPort})`;
                    } else if (errorCode === 'ENOTFOUND') {
                        errorMsg = `Hostname not found (${robotHost})`;
                    } else {
                        errorMsg = `Download error: ${err.message || errorCode}`;
                    }
                    rejectFile(new Error(errorMsg));
                });

                downloadReq.on('timeout', () => {
                    downloadReq.destroy();
                    rejectFile(new Error('Timeout'));
                });

                downloadReq.end();
            }).catch(error => {
                console.error(`Download failed for ${fileName}:`, error);
                res.write(`data: ${JSON.stringify({
                    type: 'fileError',
                    fileName,
                    error: error.message
                })}\n\n`);
            });
        }

        if (mapName) {
            const configPath = join(targetFolderPath, 'config.json');
            await writeFile(configPath, JSON.stringify({
                name: mapName,
                description: description || '',
                createTime: new Date().toISOString()
            }, null, 2));
        }

        res.write(`data: ${JSON.stringify({
            type: 'complete',
            downloadedSize,
            totalSize,
            progress: 100
        })}\n\n`);
        res.end();

    } catch (error) {
        console.error('Download error:', error);
        if (mapNameForCleanup) {
            try {
                const mapsDir = join(__dirname, '../maps');
                await rm(join(mapsDir, mapNameForCleanup), { recursive: true, force: true });
            } catch (e) { console.error('Cleanup error:', e); }
        }

        if (!res.headersSent) {
            res.status(500).json({ success: false, error: String(error) });
        } else {
            res.end();
        }
    }
});

// 通用：从机器狗指定文件夹下载到服务器 image 目录
app.post('/api/images/download-from-robot', async (req, res) => {
    try {
        // 兼容未启用 express.json 的情况
        let requestData = req.body
        if (!requestData || !requestData.robotUrl) {
            let body = ''
            await new Promise((resolve, reject) => {
                req.on('data', (chunk) => { body += chunk.toString() })
                req.on('end', () => resolve())
                req.on('error', reject)
            })
            if (body) {
                requestData = JSON.parse(body)
            }
        }

        const { robotUrl, folderPath, targetName } = requestData || {}
        if (!robotUrl || !folderPath) {
            res.status(400).json({ success: false, error: 'robotUrl 和 folderPath 不能为空' })
            return
        }

        const normalizedRemote = folderPath.replace(/^\/+/, '')

        // 本地保存目录名：优先使用传入的 targetName，否则使用远端路径的最后一段
        const safeTargetName = (targetName || basename(normalizedRemote) || 'downloaded')
            .replace(/[^a-zA-Z0-9._-]/g, '_')

        const imageRoot = join(__dirname, '../image')
        const targetFolder = join(imageRoot, safeTargetName)

        // 路径安全检查，避免路径穿越
        if (!targetFolder.startsWith(imageRoot)) {
            res.status(400).json({ success: false, error: '非法的文件夹路径' })
            return
        }

        await mkdir(targetFolder, { recursive: true })

        const robot = new URL(robotUrl)
        const protocolModule = robot.protocol === 'https:' ? https : http
        const robotHost = robot.hostname
        const robotPort = parseInt(robot.port || '8080', 10)
        const apiPrefix = '/api/files'

        // 健康检查
        const healthOk = await new Promise((resolve) => {
            const healthReq = protocolModule.get({
                hostname: robotHost,
                port: robotPort,
                path: `${apiPrefix}/health`,
                timeout: 5000
            }, (healthRes) => {
                let data = ''
                healthRes.on('data', (chunk) => { data += chunk.toString() })
                healthRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(data || '{}')
                        resolve(parsed.success === true)
                    } catch {
                        resolve(false)
                    }
                })
            })
            healthReq.on('error', () => resolve(false))
            healthReq.on('timeout', () => { healthReq.destroy(); resolve(false) })
        })

        if (!healthOk) {
            res.status(500).json({ success: false, error: '无法连接到机器狗文件服务' })
            return
        }

        const requestJson = (path) => new Promise((resolve, reject) => {
            const reqOptions = {
                hostname: robotHost,
                port: robotPort,
                path,
                timeout: 15000
            }
            const jsonReq = protocolModule.get(reqOptions, (jsonRes) => {
                let data = ''
                jsonRes.on('data', (chunk) => { data += chunk.toString() })
                jsonRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(data || '{}')
                        resolve(parsed)
                    } catch (error) {
                        reject(new Error(`解析响应失败: ${String(error)}`))
                    }
                })
            })
            jsonReq.on('error', (err) => reject(err))
            jsonReq.on('timeout', () => { jsonReq.destroy(); reject(new Error('请求超时')) })
        })

        const downloadFile = (remotePath, localPath) => new Promise((resolve, reject) => {
            const downloadReq = protocolModule.get({
                hostname: robotHost,
                port: robotPort,
                path: `${apiPrefix}/download?path=${encodeURIComponent(remotePath)}&_t=${Date.now()}`,
                timeout: 10 * 60 * 1000
            }, (downloadRes) => {
                if (downloadRes.statusCode !== 200 && downloadRes.statusCode !== 206) {
                    reject(new Error(`HTTP ${downloadRes.statusCode}`))
                    return
                }

                const writeStream = createWriteStream(localPath)
                downloadRes.pipe(writeStream)

                downloadRes.on('error', reject)
                writeStream.on('error', reject)
                writeStream.on('finish', () => resolve())
            })

            downloadReq.on('error', reject)
            downloadReq.on('timeout', () => { downloadReq.destroy(); reject(new Error('下载超时')) })
        })

        const walkFolder = async (remotePath, localBase) => {
            const listResult = await requestJson(`${apiPrefix}/list?path=${encodeURIComponent(remotePath)}`)
            const items = listResult?.items || []

            for (const item of items) {
                const remoteChild = `${remotePath}/${item.name}`
                const localChild = join(localBase, item.name)

                if (item.type === 'directory') {
                    await mkdir(localChild, { recursive: true })
                    await walkFolder(remoteChild, localChild)
                } else {
                    await mkdir(dirname(localChild), { recursive: true })
                    await downloadFile(remoteChild, localChild)
                }
            }
        }

        await walkFolder(normalizedRemote, targetFolder)

        res.json({ success: true, target: targetFolder })
    } catch (error) {
        console.error('下载文件夹失败:', error)
        res.status(500).json({ success: false, error: String(error) })
    }
})

// RocketMQ: publish message
app.post('/api/mq/publish', async (req, res) => {
    try {
        const mq = await mqBridgePromise
        if (!mq?.enabled) {
            res.status(503).json({ success: false, error: 'RocketMQ 未启用或客户端不可用' });
            return;
        }

        let body = req.body
        if (!body || body.message === undefined) {
            let raw = ''
            await new Promise((resolve, reject) => {
                req.on('data', chunk => { raw += chunk.toString(); })
                req.on('end', resolve)
                req.on('error', reject)
            })
            if (raw) {
                try {
                    body = JSON.parse(raw)
                } catch {
                    body = { message: raw }
                }
            }
        }

        const { message, topic } = body || {}
        if (message === undefined || message === null) {
            res.status(400).json({ success: false, error: 'message 不能为空' });
            return;
        }

        const result = await mq.sendMessage(message, topic)
        res.json({ success: true, ...result })
    } catch (error) {
        console.error('MQ publish error:', error)
        res.status(500).json({ success: false, error: String(error) })
    }
})

// RocketMQ: SSE stream for consumer messages
const mqSseClients = new Set();

app.get('/api/mq/stream', async (req, res) => {
    try {
        const mq = await mqBridgePromise
        if (!mq?.enabled) {
            res.status(503).json({ success: false, error: 'RocketMQ 未启用或客户端不可用' });
            return;
        }

        // Start consumer loop once
        await mq.ensureConsumer()

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
        })
        res.write(': connected\n\n')

        const push = (msg) => {
            res.write(`data: ${JSON.stringify(msg)}\n\n`)
        }

        mqSseClients.add(push)
        const unsubscribe = mq.addListener(push)

        req.on('close', () => {
            mqSseClients.delete(push)
            unsubscribe()
        })
    } catch (error) {
        console.error('MQ stream error:', error)
        res.status(500).end()
    }
})

app.post('/api/maps/send-to-robot', async (req, res) => {
    try {
        // Use req.body if available (parsed by express.json()), otherwise read stream
        let requestData;
        if (req.body && (req.body.robotUrl || req.body.files)) {
            requestData = req.body;
        } else {
            let body = '';
            await new Promise((resolve, reject) => {
                req.on('data', (chunk) => { body += chunk.toString(); });
                req.on('end', () => resolve());
                req.on('error', reject);
            });
            if (body) {
                requestData = JSON.parse(body);
            }
        }

        if (!requestData) {
            res.status(400).json({ success: false, error: 'Empty request body' });
            return;
        }

        const { robotUrl, files, destinationPath } = requestData;

        if (!robotUrl || !files || !Array.isArray(files) || files.length === 0) {
            res.status(400).json({ success: false, error: 'Invalid request: robotUrl and files array required' });
            return;
        }

        // Parse robot URL
        const robotUrlObj = new URL(robotUrl);
        const robotHost = robotUrlObj.hostname;
        const robotPort = parseInt(robotUrlObj.port || '8080', 10);
        const apiPrefix = '/api/files';

        // Check robot health
        try {
            const healthCheck = await new Promise((resolve) => {
                const healthReq = http.get({
                    hostname: robotHost,
                    port: robotPort,
                    path: `${apiPrefix}/health`,
                    timeout: 5000
                }, (healthRes) => {
                    let data = '';
                    healthRes.on('data', (chunk) => { data += chunk.toString(); });
                    healthRes.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            resolve(result.success === true);
                        } catch {
                            resolve(false);
                        }
                    });
                });
                healthReq.on('error', () => resolve(false));
                healthReq.on('timeout', () => {
                    healthReq.destroy();
                    resolve(false);
                });
            });

            if (!healthCheck) {
                res.status(500).json({ success: false, error: 'Robot file service not responding to health check' });
                return;
            }
        } catch (error) {
            res.status(500).json({ success: false, error: `Cannot connect to robot file service: ${String(error)}` });
            return;
        }

        const mapsDir = join(__dirname, '../maps');
        const results = [];

        // 1. Calculate total size
        let totalFileSize = 0;
        const fileInfoList = [];

        for (const fileInfo of files) {
            const { localPath, fileName, destinationPath: fileDestinationPath } = fileInfo;
            const targetPath = fileDestinationPath || destinationPath || 'map';
            const filePath = join(mapsDir, localPath.replace(/^\/maps\//, ''));

            try {
                const stats = statSync(filePath);
                if (stats.isFile()) {
                    totalFileSize += stats.size;
                    fileInfoList.push({
                        localPath,
                        fileName,
                        destinationPath: targetPath,
                        filePath,
                        size: stats.size
                    });
                }
            } catch (error) {
                // Skip if file not found
            }
        }

        // 2. Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        res.write(`data: ${JSON.stringify({ type: 'init', totalSize: totalFileSize, totalFiles: fileInfoList.length })}\n\n`);        // 3. Stream upload each file
        let uploadedSize = 0;
        for (let i = 0; i < fileInfoList.length; i++) {
            const fileInfo = fileInfoList[i];
            const { fileName, destinationPath: targetPath, filePath, size: fileSize } = fileInfo;

            try {
                res.write(`data: ${JSON.stringify({
                    type: 'fileStart',
                    fileName,
                    fileIndex: i + 1,
                    totalFiles: fileInfoList.length,
                    fileSize
                })}\n\n`);

                const boundary = `----formdata-${Date.now()}-${Math.random().toString(36)}`;
                const mimeType = 'application/octet-stream';

                const header = `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
                    `Content-Type: ${mimeType}\r\n\r\n`;
                const footer = `\r\n--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="destination"\r\n\r\n` +
                    `${targetPath}\r\n` +
                    `--${boundary}--\r\n`;

                const headerSize = Buffer.byteLength(header);
                const footerSize = Buffer.byteLength(footer);
                const totalRequestSize = headerSize + fileSize + footerSize;

                await new Promise((resolve) => {
                    let waitProgressInterval = null;
                    let progressCheckInterval = null;
                    let responseReceived = false;
                    let initialBytesWritten = 0;
                    let lastReportedSentBytes = 0;

                    const options = {
                        hostname: robotHost,
                        port: robotPort,
                        path: `${apiPrefix}/upload`,
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${boundary}`,
                            'Content-Length': totalRequestSize.toString()
                        }
                    };

                    const httpReq = http.request(options, (httpRes) => {
                        let responseData = '';

                        if (httpRes.statusCode && (httpRes.statusCode < 200 || httpRes.statusCode >= 300)) {
                            responseReceived = true;
                            if (progressCheckInterval) clearInterval(progressCheckInterval);
                            results.push({
                                file: fileName,
                                success: false,
                                error: `HTTP ${httpRes.statusCode}: ${httpRes.statusMessage || 'Upload failed'}`,
                                size: fileSize
                            });
                            resolve();
                            return;
                        }

                        httpRes.on('data', (chunk) => { responseData += chunk.toString(); });
                        httpRes.on('end', () => {
                            responseReceived = true;
                            if (progressCheckInterval) clearInterval(progressCheckInterval);

                            try {
                                const result = JSON.parse(responseData);
                                if (result.success) {
                                    results.push({ file: fileName, success: true, size: fileSize });
                                    uploadedSize += fileSize;
                                    const finalProgress = totalFileSize > 0 ? Math.min(100, Math.round((uploadedSize / totalFileSize) * 100)) : 100;
                                    res.write(`data: ${JSON.stringify({
                                        type: 'fileComplete',
                                        fileName,
                                        uploadedSize,
                                        totalSize: totalFileSize,
                                        progress: finalProgress
                                    })}\n\n`);
                                } else {
                                    results.push({
                                        file: fileName,
                                        success: false,
                                        error: result.message || 'Upload failed',
                                        size: fileSize
                                    });
                                    res.write(`data: ${JSON.stringify({
                                        type: 'fileError',
                                        fileName,
                                        error: result.message || 'Upload failed'
                                    })}\n\n`);
                                }
                            } catch (e) {
                                results.push({
                                    file: fileName,
                                    success: false,
                                    error: `Invalid response: ${String(e)}`,
                                    size: fileSize
                                });
                                res.write(`data: ${JSON.stringify({
                                    type: 'fileError',
                                    fileName,
                                    error: 'Invalid response from server'
                                })}\n\n`);
                            }
                            resolve();
                        });

                        httpRes.on('error', (error) => {
                            responseReceived = true;
                            if (progressCheckInterval) clearInterval(progressCheckInterval);
                            results.push({
                                file: fileName,
                                success: false,
                                error: error.message || 'Network error',
                                size: fileSize
                            });
                            res.write(`data: ${JSON.stringify({
                                type: 'fileError',
                                fileName,
                                error: error.message || 'Network error'
                            })}\n\n`);
                            resolve();
                        });
                    });

                    httpReq.on('error', (error) => {
                        responseReceived = true;
                        if (progressCheckInterval) clearInterval(progressCheckInterval);
                        results.push({ file: fileName, success: false, error: error.message, size: fileSize });
                        resolve();
                    });

                    httpReq.on('socket', (socket) => {
                        initialBytesWritten = socket.bytesWritten || 0;
                    });

                    httpReq.write(Buffer.from(header));

                    const fileStream = createReadStream(filePath, { highWaterMark: 10 * 1024 * 1024 });

                    progressCheckInterval = setInterval(() => {
                        if (responseReceived) {
                            if (progressCheckInterval) clearInterval(progressCheckInterval);
                            return;
                        }

                        const socket = httpReq.socket;
                        if (socket && socket.bytesWritten !== undefined) {
                            const currentBytesWritten = socket.bytesWritten;
                            const totalSent = currentBytesWritten - initialBytesWritten;
                            const fileContentSent = Math.max(0, totalSent - headerSize);
                            const actualSentBytes = Math.max(fileContentSent, lastReportedSentBytes);

                            if (actualSentBytes > lastReportedSentBytes) {
                                lastReportedSentBytes = actualSentBytes;
                                const currentSentSize = uploadedSize + Math.min(actualSentBytes, fileSize);
                                const expectedTotalBytes = headerSize + fileSize + footerSize;
                                let overallProgress = 0;
                                if (totalFileSize > 0) {
                                    if (totalSent >= expectedTotalBytes) {
                                        overallProgress = Math.min(98, Math.round((currentSentSize / totalFileSize) * 100));
                                    } else {
                                        overallProgress = Math.min(97, Math.round((currentSentSize / totalFileSize) * 100));
                                    }
                                }

                                res.write(`data: ${JSON.stringify({
                                    type: 'progress',
                                    fileName,
                                    sentBytes: Math.min(actualSentBytes, fileSize),
                                    fileSize,
                                    uploadedSize: currentSentSize,
                                    totalSize: totalFileSize,
                                    progress: overallProgress
                                })}\n\n`);
                            }
                        }
                    }, 200);

                    fileStream.on('data', (chunk) => {
                        if (!httpReq.write(chunk)) {
                            fileStream.pause();
                        }
                    });

                    httpReq.on('drain', () => {
                        fileStream.resume();
                    });

                    fileStream.on('end', () => {
                        httpReq.write(Buffer.from(footer));
                        httpReq.end();
                    });

                    fileStream.on('error', (error) => {
                        responseReceived = true;
                        if (progressCheckInterval) clearInterval(progressCheckInterval);
                        results.push({ file: fileName, success: false, error: error.message, size: fileSize });
                        httpReq.destroy();
                        resolve();
                    });
                });

            } catch (error) {
                results.push({
                    file: fileName,
                    success: false,
                    error: String(error),
                    size: fileSize
                });
            }
        }

        try {
            res.write(`data: ${JSON.stringify({ type: 'complete', results, uploadedSize, totalSize: totalFileSize })}\n\n`);
            res.end();
        } catch (writeError) {
            console.error('Error writing final response:', writeError);
        }

    } catch (error) {
        console.error('Error processing request:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: String(error) });
        } else {
            res.end();
        }
    }
});

// --- Schedule Manager Integration ---

async function fileExists(path) {
    try { await access(path); return true; } catch { return false; }
}

async function dirExists(path) {
    try { const s = await stat(path); return s.isDirectory(); } catch { return false; }
}

async function uploadFileToRobot(host, port, filePath, fileName, destinationPath) {
    return new Promise((resolve, reject) => {
        const fileSize = statSync(filePath).size;
        const boundary = `----formdata-${Date.now()}-${Math.random().toString(36)}`;

        const header = `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`;
        const footer = `\r\n--${boundary}\r\n` +
            `Content-Disposition: form-data; name="destination"\r\n\r\n` +
            `${destinationPath}\r\n` +
            `--${boundary}--\r\n`;

        const options = {
            hostname: host,
            port: port,
            path: '/api/files/upload',
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(header) + fileSize + Buffer.byteLength(footer)
            }
        };

        const req = http.request(options, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
            } else {
                reject(new Error(`HTTP ${res.statusCode}`));
            }
        });

        req.on('error', reject);

        req.write(header);
        const fileStream = createReadStream(filePath);
        fileStream.pipe(req, { end: false });
        fileStream.on('end', () => {
            req.write(footer);
            req.end();
        });
    });
}

async function sendMapToRobotFunc(robotIp, folderName, mapName) {
    const mapsDir = join(__dirname, '../maps');
    const mapFolderPath = join(mapsDir, folderName);

    const filesToSend = [];

    try {
        // 1. config.json
        if (await fileExists(join(mapFolderPath, 'config.json'))) {
            filesToSend.push({
                filePath: join(mapFolderPath, 'config.json'),
                fileName: 'config.json',
                destinationPath: 'map'
            });
        }

        // 2. map/ folder
        const mapDir = join(mapFolderPath, 'map');
        if (await dirExists(mapDir)) {
            const mapFiles = await readdir(mapDir);
            for (const file of mapFiles) {
                filesToSend.push({
                    filePath: join(mapDir, file),
                    fileName: file,
                    destinationPath: 'map/map'
                });
            }
        }

        // 3. queue/ folder
        const queueDir = join(mapFolderPath, 'queue');
        if (await dirExists(queueDir)) {
            const queueFiles = await readdir(queueDir);
            for (const file of queueFiles) {
                filesToSend.push({
                    filePath: join(queueDir, file),
                    fileName: file,
                    destinationPath: 'map/queue'
                });
            }
        }

        // Send files
        for (const fileInfo of filesToSend) {
            await uploadFileToRobot(robotIp, 8080, fileInfo.filePath, fileInfo.fileName, fileInfo.destinationPath);
        }

        console.log(`[sendMapToRobotFunc] Successfully sent map ${mapName} to ${robotIp}`);
        return true;
    } catch (error) {
        console.error(`[sendMapToRobotFunc] Failed to send map: ${error}`);
        throw error;
    }
}

const scheduleManager = new ScheduleManager(sendMapToRobotFunc);
scheduleManager.init();

// API Routes for Schedules
app.get('/api/schedules', (req, res) => {
    res.json(scheduleManager.getSchedules());
});

app.post('/api/schedules', async (req, res) => {
    try {
        const schedule = await scheduleManager.addSchedule(req.body);
        res.json(schedule);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/schedules/:id', async (req, res) => {
    try {
        const schedule = await scheduleManager.updateSchedule(req.params.id, req.body);
        if (schedule) res.json(schedule);
        else res.status(404).json({ error: 'Schedule not found' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/schedules/:id', async (req, res) => {
    try {
        const success = await scheduleManager.deleteSchedule(req.params.id);
        if (success) res.json({ success: true });
        else res.status(404).json({ error: 'Schedule not found' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Proxy all other API requests to Python backend
app.use('/api', createProxyMiddleware({
    target: TARGET_API,
    changeOrigin: true,
    ws: true,
    pathRewrite: {
        '^/': '/api/'
    }
}));

// Handle SPA routing
app.get(/.*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(join(__dirname, '../dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
