/** Typed API client: cookie session + CSRF header, JSON and multipart helpers. */

// Web deployment serves the API behind the same origin (vite dev proxy or
// reverse proxy), so the base is ''. In the Capacitor Android build the API
// lives on another origin; set VITE_API_BASE at build time (see ANDROID.md).
const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)cashbook_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = {}
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken()
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (data?.detail) detail = typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail) ? data.detail.map((e: {loc?: string[]; msg: string}) => `${e.loc?.slice(1).join(' ')}: ${e.msg}`).join('. ') : detail
    } catch {
      /* keep default */
    }
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/change-password') window.dispatchEvent(new Event('cashbook:expired'))
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form, true),
  /** Binary media fetch for previews/playback (auth-checked endpoints). */
  mediaUrl: (path: string) => `/api${path}`,
}

export function fileUrl(kind: 'images' | 'voice', id: number): string {
  return `${API_BASE}/api/media/${kind === 'images' ? 'images' : 'voice'}/${id}/file`
}
