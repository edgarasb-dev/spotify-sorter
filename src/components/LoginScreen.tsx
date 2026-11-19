import { useState, type FormEvent } from "react";
import { AlertTriangle, Check, Copy, Lock, LogIn } from "lucide-react";
import {
  beginSpotifyLogin,
  getConfiguredClientId,
  getEnvClientId,
  getLoopbackUrl,
  getRedirectUri,
  isLocalhostOrigin,
} from "../auth/spotifyAuth";

interface LoginScreenProps {
  isExchangingCallback: boolean;
  errorMessage: string | null;
}

export function LoginScreen({
  isExchangingCallback,
  errorMessage,
}: LoginScreenProps) {
  const envClientId = getEnvClientId();
  const [manualClientId, setManualClientId] = useState(() =>
    envClientId ? "" : getConfiguredClientId()
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  const onLocalhost = isLocalhostOrigin();
  const redirectUri = getRedirectUri();
  const combinedError = localError ?? errorMessage;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      await beginSpotifyLogin(envClientId ? undefined : manualClientId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to start login.");
    }
  }

  async function handleCopyRedirect() {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopiedRedirect(true);
      setTimeout(() => setCopiedRedirect(false), 1800);
    } catch {
      // Ignore clipboard failures.
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">
              Spotify Playlist Sorter
            </h1>
            <p className="text-xs text-zinc-400">
              Private personal workspace · Login required
            </p>
          </div>
        </div>

        {onLocalhost && (
          <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="space-y-2">
                <p>
                  Spotify rejects <code className="text-amber-100">localhost</code> redirect URIs.
                  Open this page using the loopback IP instead:
                </p>
                <a
                  href={getLoopbackUrl()}
                  className="inline-flex items-center rounded-lg bg-amber-500/20 px-2.5 py-1 font-medium text-amber-100 hover:bg-amber-500/30"
                >
                  Switch to 127.0.0.1
                </a>
              </div>
            </div>
          </div>
        )}

        {combinedError && (
          <div className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-200">
            {combinedError}
          </div>
        )}

        {isExchangingCallback ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-sm text-zinc-300">
              Completing Spotify PKCE login…
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!envClientId && (
              <div>
                <label
                  htmlFor="spotify-client-id"
                  className="mb-1.5 block text-xs font-medium text-zinc-300"
                >
                  Spotify App Client ID
                </label>
                <input
                  id="spotify-client-id"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste Client ID from Spotify Developer Dashboard"
                  value={manualClientId}
                  onChange={(e) => setManualClientId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <p className="mt-1.5 text-[11px] text-zinc-500">
                  Stored only in this browser&apos;s localStorage (not shipped in static JS).
                </p>
              </div>
            )}

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-xs text-zinc-400">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-300">OAuth Redirect URI</span>
                <button
                  type="button"
                  onClick={handleCopyRedirect}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  {copiedRedirect ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <code className="block break-all text-[11px] text-emerald-300">
                {redirectUri}
              </code>
            </div>

            <button
              type="submit"
              disabled={onLocalhost && !(import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? "").trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              Sign in with Spotify
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
