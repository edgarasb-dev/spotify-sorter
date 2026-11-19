import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodeChallenge, generateRandomString } from "../auth/pkce";
import {
  clearAuthSession,
  getConfiguredClientId,
  getRedirectUri,
  loadStoredSession,
  setManualClientId,
} from "../auth/spotifyAuth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pkce and auth helpers", () => {
  it("generates RFC 7636 valid random verifier and base64url S256 challenge", async () => {
    const verifier = generateRandomString(64);
    expect(verifier).toHaveLength(64);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);

    const challenge = await createCodeChallenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(challenge).not.toContain("=");
    expect(challenge.length).toBe(43);
  });

  it("stores manual Client ID and clears auth session cleanly when env Client ID is unset", () => {
    vi.stubEnv("VITE_SPOTIFY_CLIENT_ID", "");
    localStorage.clear();
    setManualClientId("my-client-id-123");
    expect(getConfiguredClientId()).toBe("my-client-id-123");

    localStorage.setItem(
      "spotify_sorter:auth_session:v1",
      JSON.stringify({
        accessToken: "tok",
        refreshToken: "ref",
        expiresAt: Date.now() + 3600_000,
        scope: "user-read-private",
        clientId: "my-client-id-123",
      })
    );
    expect(loadStoredSession()?.accessToken).toBe("tok");

    clearAuthSession();
    expect(loadStoredSession()).toBeNull();
  });

  it("defaults redirect URI to current origin /callback", () => {
    vi.stubEnv("VITE_SPOTIFY_REDIRECT_URI", "");
    expect(getRedirectUri()).toBe(`${window.location.origin}/callback`);
  });
});
