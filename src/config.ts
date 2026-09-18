export const API_BASE_URL = import.meta.env.PROD
    ? '/api'
    : '/api';

/** Gang_qwen 仪表/图片检测 API（8001），不要与 /api（8000 旧项目）混用 */
export const GANG_QWEN_API_BASE = import.meta.env.PROD
    ? '/api2'
    : '/api2';
