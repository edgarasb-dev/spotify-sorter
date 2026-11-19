import {
  forceRefreshAccessToken,
  getValidAccessToken,
} from "../auth/spotifyAuth";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export class SpotifyApiError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface SpotifyFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  maxRateLimitRetries?: number;
  onRateLimit?: (waitSeconds: number) => void;
}

function resolveSpotifyUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("https://api.spotify.com/")) {
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    throw new Error("Refusing to send Spotify token to untrusted URL.");
  }
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${SPOTIFY_API_BASE}${normalizedPath}`;
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Operation aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Operation aborted", "AbortError"));
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as {
      error?: { message?: string; status?: number };
    };
    if (json?.error?.message) {
      return json.error.message;
    }
  } catch {
    // Fall through to status text.
  }
  return response.statusText || `HTTP ${response.status}`;
}

export async function spotifyFetch<T>(
  pathOrUrl: string,
  options: SpotifyFetchOptions = {}
): Promise<T> {
  const url = resolveSpotifyUrl(pathOrUrl);
  const maxRateLimitRetries = options.maxRateLimitRetries ?? 5;

  let refreshedAfter401 = false;
  let rateLimitRetries = 0;

  while (true) {
    if (options.signal?.aborted) {
      throw new DOMException("Operation aborted", "AbortError");
    }

    const token = await getValidAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    let serializedBody: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      serializedBody = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: serializedBody,
      signal: options.signal,
    });

    if (response.status === 401 && !refreshedAfter401) {
      refreshedAfter401 = true;
      await forceRefreshAccessToken();
      continue;
    }

    if (response.status === 429) {
      const retryHeader = response.headers.get("Retry-After");
      const parsed = retryHeader ? Number.parseInt(retryHeader, 10) : NaN;
      const waitSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 2;

      if (rateLimitRetries >= maxRateLimitRetries) {
        throw new SpotifyApiError(
          429,
          `Spotify rate limit exceeded after ${maxRateLimitRetries} retries.`,
          waitSeconds
        );
      }

      rateLimitRetries += 1;
      options.onRateLimit?.(waitSeconds);
      await abortableSleep((waitSeconds + 0.25) * 1000, options.signal);
      continue;
    }

    if (!response.ok) {
      const message = await parseErrorMessage(response);
      throw new SpotifyApiError(response.status, message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
