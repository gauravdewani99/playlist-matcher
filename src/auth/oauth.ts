import crypto from "crypto";
import http from "http";
import open from "open";
import { TokenStore, StoredTokens } from "./token-store.js";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const REDIRECT_URI = "http://127.0.0.1:8888/callback";

const SCOPES = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

export interface OAuthConfig {
  clientId: string;
}

function generateCodeVerifier(length: number = 64): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues)
    .map((x) => possible[x % possible.length])
    .join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Buffer.from(digest)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export class SpotifyOAuth {
  private clientId: string;
  private tokenStore: TokenStore;
  private codeVerifier: string | null = null;

  constructor(config: OAuthConfig, tokenStore: TokenStore) {
    this.clientId = config.clientId;
    this.tokenStore = tokenStore;
  }

  async startAuthFlow(): Promise<string> {
    this.codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(this.codeVerifier);

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
      scope: SCOPES,
    });

    const authUrl = `${SPOTIFY_AUTH_URL}?${params.toString()}`;

    // Start local server to receive callback
    const authPromise = this.startCallbackServer();

    // Open browser for user authorization
    await open(authUrl);

    // Wait for auth to complete
    await authPromise;

    return authUrl;
  }

  private startCallbackServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, `http://127.0.0.1:8888`);

        if (url.pathname === "/callback") {
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`
              <html>
                <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff;">
                  <div style="text-align: center;">
                    <h1 style="color: #ef4444;">Authorization Failed</h1>
                    <p>${error}</p>
                  </div>
                </body>
              </html>
            `);
            server.close();
            reject(new Error(error));
            return;
          }

          if (code && this.codeVerifier) {
            try {
              await this.exchangeCodeForToken(code);
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(`
                <html>
                  <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff;">
                    <div style="text-align: center;">
                      <h1 style="color: #1DB954;">Authorization Successful!</h1>
                      <p>You can close this window and return to Claude.</p>
                    </div>
                  </body>
                </html>
              `);
              server.close();
              resolve();
            } catch (err) {
              res.writeHead(500, { "Content-Type": "text/html" });
              res.end(`
                <html>
                  <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff;">
                    <div style="text-align: center;">
                      <h1 style="color: #ef4444;">Token Exchange Failed</h1>
                      <p>${err instanceof Error ? err.message : "Unknown error"}</p>
                    </div>
                  </body>
                </html>
              `);
              server.close();
              reject(err);
            }
          }
        }
      });

      server.listen(8888, "127.0.0.1");

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error("Authorization timeout - no response within 5 minutes"));
      }, 300000);
    });
  }

  private async exchangeCodeForToken(code: string): Promise<void> {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: this.clientId,
        code_verifier: this.codeVerifier!,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const tokens = await response.json();
    await this.tokenStore.saveTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
  }

  async refreshAccessToken(): Promise<string> {
    const tokens = await this.tokenStore.getTokens();
    if (!tokens?.refreshToken) {
      throw new Error("No refresh token available. Please re-authorize.");
    }

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: this.clientId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const newTokens = await response.json();
    await this.tokenStore.saveTokens({
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || tokens.refreshToken,
      expiresAt: Date.now() + newTokens.expires_in * 1000,
    });

    return newTokens.access_token;
  }

  async getValidAccessToken(): Promise<string> {
    const tokens = await this.tokenStore.getTokens();

    if (!tokens) {
      throw new Error("Not authenticated. Please run the spotify_authorize tool first.");
    }

    // Refresh if token expires within 5 minutes
    if (tokens.expiresAt - Date.now() < 300000) {
      return this.refreshAccessToken();
    }

    return tokens.accessToken;
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.getValidAccessToken();
      return true;
    } catch {
      return false;
    }
  }
}
