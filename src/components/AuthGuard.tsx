import { useEffect, useState, type ReactNode } from "react";
import type { SpotifyUser } from "../types/spotify";
import {
  bootstrapAuthSession,
  clearAuthSession,
  isOAuthCallbackUrl,
  loadStoredSession,
} from "../auth/spotifyAuth";
import { LoginScreen } from "./LoginScreen";

interface AuthGuardProps {
  children: (ctx: { user: SpotifyUser; onLogout: () => void }) => ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(
    () => isOAuthCallbackUrl() || loadStoredSession() !== null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function runBootstrap() {
      try {
        const verifiedUser = await bootstrapAuthSession();
        if (active) {
          setUser(verifiedUser);
          setErrorMessage(null);
        }
      } catch (err) {
        clearAuthSession();
        if (active) {
          setUser(null);
          setErrorMessage(
            err instanceof Error ? err.message : "Spotify login failed."
          );
        }
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    }

    void runBootstrap();

    return () => {
      active = false;
    };
  }, []);

  function handleLogout() {
    clearAuthSession();
    setUser(null);
    setErrorMessage(null);
  }

  if (checkingSession || !user) {
    return (
      <LoginScreen
        isExchangingCallback={checkingSession}
        errorMessage={errorMessage}
      />
    );
  }

  return <>{children({ user, onLogout: handleLogout })}</>;
}
