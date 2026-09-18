import { readFileSync } from 'fs';
import { resolve } from 'path';

const CONFIG_PATH = resolve(process.cwd(), process.env.IMAGE_ROUTING_CONFIG_PATH || 'config/image-routing.json');

function readImageRoutingConfig() {
    try {
        const text = readFileSync(CONFIG_PATH, 'utf8');
        const config = JSON.parse(text);
        return Array.isArray(config.image2Sources) ? config.image2Sources : [];
    } catch (error) {
        console.warn(`[ImageRouting] Failed to read ${CONFIG_PATH}, image2 routing disabled:`, error.message);
        return [];
    }
}

function parseSource(source) {
    const value = String(source || '').trim();
    if (!value) return null;

    try {
        const normalized = value.includes('://') ? value : `ws://${value}`;
        const url = new URL(normalized);
        return {
            host: url.hostname,
            port: url.port || ''
        };
    } catch {
        const [host, port = ''] = value.split(':');
        return host ? { host, port } : null;
    }
}

function getImage2SourceRules() {
    return readImageRoutingConfig()
        .map(parseSource)
        .filter(Boolean);
}

export function shouldRouteImageToImage2(sourceUrl) {
    const source = parseSource(sourceUrl);
    if (!source) return false;

    return getImage2SourceRules().some(rule => {
        if (rule.host !== source.host) return false;
        return !rule.port || !source.port || rule.port === source.port;
    });
}
