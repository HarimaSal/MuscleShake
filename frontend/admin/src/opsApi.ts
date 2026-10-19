export interface OpsAdmin {
  id: string;
  username: string;
  role: 'super_admin' | 'operator' | 'reviewer' | 'viewer';
  status: string;
  lastLoginAt?: string | null;
}

export interface OpsSession {
  token: string;
  expiresAt: string;
  admin: OpsAdmin;
}

const TOKEN_KEY = 'fitlog.ops.token';

export function getOpsToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setOpsToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearOpsToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class OpsApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getOpsToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`/api/ops${path}`, { ...options, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    if (res.status === 401) clearOpsToken();
    throw new OpsApiError(res.status, body?.error?.code ?? 'OPS_ERROR', body?.error?.message ?? '后台请求失败');
  }
  return body?.data as T;
}

export const ops = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
