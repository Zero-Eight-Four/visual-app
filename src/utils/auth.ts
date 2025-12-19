/**
 * 获取指定名称的 cookie 值
 * @param name cookie 名称
 * @returns cookie 值，如果不存在则返回 null
 */
export function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
        return parts.pop()?.split(';').shift() || null;
    }
    return null;
}

/**
 * 获取 Authorization header 对象
 * 如果 cookie 中存在 Authorization，则返回包含该 header 的对象
 * 否则返回空对象
 */
export function getAuthHeaders(): HeadersInit {
    const token = getCookie('Authorization');
    if (token) {
        return {
            'Authorization': token
        };
    }
    return {};
}
