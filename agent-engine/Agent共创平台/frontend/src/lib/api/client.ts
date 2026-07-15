import { buildApiUrl } from '@/lib/runtime-config'

type QueryParams = Record<string, string | number | boolean | undefined | null>

interface RequestOptions extends RequestInit {
  params?: QueryParams
}

function normalizeApiPath(path: string) {
  if (path.startsWith('/api/')) return path
  return `/api/v1${path.startsWith('/') ? path : `/${path}`}`
}

function withParams(path: string, params?: QueryParams) {
  if (!params) return path

  const url = new URL(buildApiUrl(normalizeApiPath(path)), 'http://localhost')
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString().replace(url.origin, '')
}

async function request<T = unknown>(path: string, options: RequestOptions = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(buildApiUrl(withParams(normalizeApiPath(path), options.params)), {
    ...options,
    headers,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(data?.error || response.statusText || 'Request failed')
  }

  return { data: data as T, status: response.status }
}

const api = {
  get: <T = any>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T = any>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  put: <T = any>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: <T = any>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  delete: <T = any>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}

export default api
