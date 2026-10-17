import { ApiError, type ApiErrorBody } from './errors';

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  readonly query?: Record<string, QueryValue | QueryValue[]>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly headers?: Record<string, string>;
}

export interface ApiClientOptions {
  /** e.g. "https://api.vargly.in/api/v1" */
  readonly baseUrl: string;
  /** Supplies the current access token; omitted for public endpoints. */
  readonly getAccessToken?: () => string | null | undefined;
  /**
   * Gets a fresh access token after a 401 (e.g. from the refresh cookie). The request is retried
   * once with the new token; return null when the session cannot be renewed.
   */
  readonly refreshAccessToken?: () => Promise<string | null>;
  /** Called when the API rejects the session (401) and it could not be refreshed, e.g. to sign out. */
  readonly onUnauthorized?: (error: ApiError) => void;
  /** Injectable for tests and server-side use. */
  readonly fetch?: typeof fetch;
  /** Sent on every request, e.g. cookies forwarded by a server route. */
  readonly defaultHeaders?: Record<string, string>;
}

/** Paging info the API returns next to a list: `{ data: [...], meta: { total, page, limit } }` */
export interface PageMeta {
  total: number;
  page: number;
  limit: number;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

export interface ApiClient {
  request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
  /** GET a paged list, keeping the `meta` that `get` drops */
  getPage<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<Page<T>>;
  get<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  /** POST that keeps the whole `{ data, meta }` body, for replies whose `meta` matters */
  postEnvelope<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  delete<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T>;
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const url = `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      // Omitted filters are not sent at all, rather than as "undefined"
      if (item !== undefined && item !== null && item !== '') params.append(key, String(item));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Typed client for the Vargly API. Unwraps the `{ data }` success envelope and converts every
 * failure (HTTP error, network error, unreadable body) into an ApiError.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function send<T>(
    method: string,
    path: string,
    req: RequestOptions,
    token: string | null | undefined,
    envelope = false,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.defaultHeaders,
      ...req.headers,
    };
    if (req.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await doFetch(buildUrl(options.baseUrl, path, req.query), {
        method,
        headers,
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        signal: req.signal,
        credentials: 'include',
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'Could not reach the server. Check your connection and try again.',
      );
    }

    const payload = await readJson(response);
    if (!response.ok) {
      const body: Partial<ApiErrorBody> = payload?.error ?? {};
      throw new ApiError(
        response.status,
        body.code ?? `HTTP_${response.status}`,
        body.message ?? response.statusText ?? 'Request failed',
        body.details,
        body.upgradeUrl,
      );
    }

    if (envelope) return payload as T;
    // Most endpoints wrap results in { data }; a few (health, webhooks) do not
    return (
      payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload
    ) as T;
  }

  async function request<T>(
    method: string,
    path: string,
    req: RequestOptions = {},
    envelope = false,
  ): Promise<T> {
    try {
      return await send<T>(method, path, req, options.getAccessToken?.(), envelope);
    } catch (error) {
      if (!(error instanceof ApiError) || !error.isUnauthorized) throw error;

      // Access tokens are short-lived: renew once and replay the request before giving up
      const fresh = options.refreshAccessToken
        ? await options.refreshAccessToken().catch(() => null)
        : null;
      if (fresh) {
        try {
          return await send<T>(method, path, req, fresh, envelope);
        } catch (retryError) {
          if (retryError instanceof ApiError && retryError.isUnauthorized)
            options.onUnauthorized?.(retryError);
          throw retryError;
        }
      }
      options.onUnauthorized?.(error);
      throw error;
    }
  }

  async function getPage<T>(
    path: string,
    req: Omit<RequestOptions, 'body'> = {},
  ): Promise<Page<T>> {
    const payload = await request<{ data?: T[]; meta?: Partial<PageMeta> }>('GET', path, req, true);
    const items = Array.isArray(payload?.data) ? payload.data : [];
    return {
      items,
      meta: {
        total: payload?.meta?.total ?? items.length,
        page: payload?.meta?.page ?? 1,
        limit: payload?.meta?.limit ?? items.length,
      },
    };
  }

  return {
    request: (method, path, opts) => request(method, path, opts),
    getPage,
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    postEnvelope: (path, body, opts) => request('POST', path, { ...opts, body }, true),
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
  };
}
