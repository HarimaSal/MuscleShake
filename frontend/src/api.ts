import type { Tokens } from './types';

const TOKEN_KEY = 'fitlog.tokens';
const DEVICE_KEY = 'fitlog.device';

export class ApiError extends Error {
  status: number;
  code: string;
  details: any;
  constructor(status: number, code: string, message: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export function setTokens(tokens: Tokens | null) {
  if (tokens) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(TOKEN_KEY);
}

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `web-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function parseResponse(res: Response) {
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const error = body?.error ?? {};
    throw new ApiError(res.status, error.code ?? 'HTTP_ERROR', error.message ?? '请求失败，请稍后重试', error.details);
  }
  return body?.data;
}

async function refreshTokens(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return false;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!res.ok) return false;
    const body = await res.json();
    setTokens(body.data.tokens);
    return true;
  } catch {
    return false;
  }
}

export async function request<T = any>(
  path: string,
  options: { method?: string; body?: any; raw?: BodyInit; headers?: Record<string, string>; auth?: boolean } = {},
): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    'X-Device-Id': deviceId(),
    ...(options.headers ?? {}),
  };
  if (options.auth !== false && tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
  let body: BodyInit | undefined;
  if (options.raw !== undefined) {
    body = options.raw;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method: options.method ?? 'GET', headers, body });
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', '网络不可用，操作已保存在本地');
  }
  if (res.status === 401 && options.auth !== false) {
    const body = await res.clone().json().catch(() => null);
    if (body?.error?.code === 'TOKEN_EXPIRED' || body?.error?.code === 'UNAUTHORIZED') {
      const refreshed = await refreshTokens();
      if (refreshed) {
        const next = getTokens();
        if (next?.accessToken) headers.Authorization = `Bearer ${next.accessToken}`;
        res = await fetch(path, { method: options.method ?? 'GET', headers, body });
      }
    }
  }
  return parseResponse(res) as Promise<T>;
}

export const api = {
  get: <T = any>(path: string, options?: { auth?: boolean }) => request<T>(path, options),
  post: <T = any>(path: string, body?: any, options?: { auth?: boolean }) =>
    request<T>(path, { method: 'POST', body, ...options }),
  patch: <T = any>(path: string, body?: any) => request<T>(path, { method: 'PATCH', body }),
  put: <T = any>(path: string, body?: any) => request<T>(path, { method: 'PUT', body }),
  del: <T = any>(path: string, body?: any) => request<T>(path, { method: 'DELETE', body }),
  chunk: <T = any>(path: string, data: Blob) =>
    request<T>(path, { method: 'PUT', raw: data, headers: { 'Content-Type': 'application/octet-stream' } }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return '操作失败，请稍后重试';
}

export async function downloadWithAuth(path: string, filename: string) {
  const tokens = getTokens();
  const res = await fetch(path, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', '下载失败，请重新申请');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
