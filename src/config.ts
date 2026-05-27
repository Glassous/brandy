export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function getWsUrl(token: string): string {
  if (API_BASE.startsWith('http')) {
    const url = new URL(API_BASE);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${url.host}/api/ws?token=${token}`;
  }

  // Fallback to relative URL using window.location.host for production
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/ws?token=${token}`;
}
