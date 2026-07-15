'use client'

declare const process:
  | {
      env?: Record<string, string | undefined>
    }
  | undefined

declare global {
  interface Window {
    __API_BASE_URL__?: string
    __APP_CONFIG__?: {
      apiBaseUrl?: string
    }
  }
}

export function getApiBaseUrl(): string {
  const fromProcess =
    typeof process !== 'undefined' ? process?.env?.NEXT_PUBLIC_API_BASE_URL : undefined
  const fromWindow =
    typeof window !== 'undefined'
      ? window.__API_BASE_URL__ || window.__APP_CONFIG__?.apiBaseUrl
      : undefined

  return fromProcess || fromWindow || ''
}

export function buildApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl()
  return baseUrl ? `${baseUrl}${path}` : path
}

export function appendTokenToUrl(path: string, token?: string): string {
  if (!token) return buildApiUrl(path)
  const separator = path.includes('?') ? '&' : '?'
  return `${buildApiUrl(path)}${separator}token=${encodeURIComponent(token)}`
}
