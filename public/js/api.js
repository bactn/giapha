import { config } from './config.js';

export function apiUrl(path) {
  return `${config.apiBaseUrl}${path}`;
}

export function apiFetch(path, options) {
  return fetch(apiUrl(path), options);
}

export function shareUrl(token) {
  const url = new URL('../index.html', import.meta.url);
  url.searchParams.set('share', token);
  return url.href;
}
