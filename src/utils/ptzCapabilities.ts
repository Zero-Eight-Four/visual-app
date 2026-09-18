const NO_CENTER_PTZ_SOURCES = new Set([
    '8.148.247.53:9093',
    '192.168.31.51:9093'
])

export const isPtzCenterUnavailable = (sourceUrl?: string) => {
    if (!sourceUrl || typeof sourceUrl !== 'string') return false

    try {
        const normalizedUrl = sourceUrl.includes('://') ? sourceUrl : `ws://${sourceUrl}`
        const url = new URL(normalizedUrl)
        return NO_CENTER_PTZ_SOURCES.has(`${url.hostname}:${url.port}`)
    } catch {
        return [...NO_CENTER_PTZ_SOURCES].some(source => sourceUrl.includes(source))
    }
}

export const supportsPtzCenter = (sourceUrl?: string) => !isPtzCenterUnavailable(sourceUrl)
