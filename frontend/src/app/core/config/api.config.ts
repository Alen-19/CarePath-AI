/**
 * Dynamic API & WebSocket Endpoint Configuration
 * Automatically switches between local development (localhost:5000)
 * and production cloud backend (Render) based on the browser's hostname.
 */
export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }
  }
  return 'https://carepath-backend-efqi.onrender.com';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Normalizes relative uploaded media paths (profile images, meal photos, PDF reports)
 * to full URLs pointing to the appropriate backend environment.
 */
export const getMediaUrl = (path: string | null | undefined): string => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.startsWith('/') ? path : '/' + path;
  return `${getApiBaseUrl()}${cleanPath}`;
};
