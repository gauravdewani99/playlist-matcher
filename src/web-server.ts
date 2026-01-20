import express from "express";
import cors from "cors";
import crypto from "crypto";
import { SpotifyClient } from "./spotify/client.js";
import { GenreMatcher } from "./matching/genre-matcher.js";
import { TokenStore, StoredTokens } from "./auth/token-store.js";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

const SCOPES = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

// In-memory store for PKCE verifiers (in production, use Redis or similar)
const pkceStore = new Map<string, { verifier: string; createdAt: number }>();

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

function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Cleanup old PKCE entries (older than 10 minutes)
function cleanupPkceStore() {
  const now = Date.now();
  for (const [state, data] of pkceStore.entries()) {
    if (now - data.createdAt > 600000) {
      pkceStore.delete(state);
    }
  }
}

// Simple OAuth class for web that uses the shared token store
class WebSpotifyOAuth {
  private clientId: string;
  private tokenStore: TokenStore;

  constructor(clientId: string, tokenStore: TokenStore) {
    this.clientId = clientId;
    this.tokenStore = tokenStore;
  }

  async getValidAccessToken(): Promise<string> {
    const tokens = await this.tokenStore.getTokens();

    if (!tokens) {
      throw new Error("Not authenticated");
    }

    // Refresh if token expires within 5 minutes
    if (tokens.expiresAt - Date.now() < 300000) {
      return this.refreshAccessToken(tokens.refreshToken);
    }

    return tokens.accessToken;
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.clientId,
      }),
    });

    if (!response.ok) {
      throw new Error("Token refresh failed");
    }

    const newTokens = await response.json();
    await this.tokenStore.saveTokens({
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || refreshToken,
      expiresAt: Date.now() + newTokens.expires_in * 1000,
    });

    return newTokens.access_token;
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

export function createWebServer(clientId: string, port: number = 3001) {
  const app = express();
  const tokenStore = new TokenStore();
  const oauth = new WebSpotifyOAuth(clientId, tokenStore);
  const spotifyClient = new SpotifyClient(oauth as any);
  const genreMatcher = new GenreMatcher(spotifyClient);

  // Get frontend URL from environment or default to localhost (support multiple Vite ports)
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5174";
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
  ];
  const redirectUri = `http://127.0.0.1:${port}/api/auth/callback`;

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }));
  app.use(express.json());

  // Cleanup PKCE store periodically
  setInterval(cleanupPkceStore, 60000);

  // ============ AUTH ENDPOINTS ============

  // Get auth URL for frontend to redirect to
  app.get("/api/auth/url", async (_req, res) => {
    try {
      const state = generateState();
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      // Store verifier with state
      pkceStore.set(state, { verifier, createdAt: Date.now() });

      const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        code_challenge_method: "S256",
        code_challenge: challenge,
        scope: SCOPES,
        state,
      });

      res.json({ url: `${SPOTIFY_AUTH_URL}?${params.toString()}` });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate auth URL" });
    }
  });

  // OAuth callback - receives code from Spotify
  app.get("/api/auth/callback", async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${frontendUrl}?error=${encodeURIComponent(error as string)}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}?error=missing_params`);
    }

    const pkceData = pkceStore.get(state as string);
    if (!pkceData) {
      return res.redirect(`${frontendUrl}?error=invalid_state`);
    }

    try {
      // Exchange code for tokens
      const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: pkceData.verifier,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Token exchange failed:", errorText);
        return res.redirect(`${frontendUrl}?error=token_exchange_failed`);
      }

      const tokens = await response.json();

      // Save tokens
      await tokenStore.saveTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });

      // Cleanup used state
      pkceStore.delete(state as string);

      // Redirect to frontend with success
      res.redirect(`${frontendUrl}?auth=success`);
    } catch (err) {
      console.error("Auth callback error:", err);
      res.redirect(`${frontendUrl}?error=auth_failed`);
    }
  });

  // Check auth status
  app.get("/api/auth/status", async (_req, res) => {
    try {
      const isAuth = await oauth.isAuthenticated();
      if (isAuth) {
        const user = await spotifyClient.getCurrentUser();
        res.json({ authenticated: true, user });
      } else {
        res.json({ authenticated: false });
      }
    } catch {
      res.json({ authenticated: false });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (_req, res) => {
    try {
      await tokenStore.clearTokens();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to logout" });
    }
  });

  // ============ LIBRARY ENDPOINTS ============

  // Get liked songs
  app.get("/api/songs/liked", async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const tracks = await spotifyClient.getLikedSongs(limit);
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch liked songs" });
    }
  });

  // Get liked songs with genre info
  app.get("/api/songs/liked/with-genres", async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const tracks = await spotifyClient.getLikedSongs(limit);
      const enriched = await genreMatcher.enrichTracksWithGenres(tracks);
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch liked songs" });
    }
  });

  // ============ PLAYLIST ENDPOINTS ============

  // Get user playlists
  app.get("/api/playlists", async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const playlists = await spotifyClient.getUserPlaylists(limit);
      res.json(playlists);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch playlists" });
    }
  });

  // Get playlist tracks
  app.get("/api/playlists/:id/tracks", async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const tracks = await spotifyClient.getPlaylistTracks(req.params.id, limit);
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch playlist tracks" });
    }
  });

  // Add tracks to playlist
  app.post("/api/playlists/:id/tracks", async (req, res) => {
    try {
      const { trackIds } = req.body;
      if (!trackIds || !Array.isArray(trackIds)) {
        return res.status(400).json({ error: "trackIds array required" });
      }
      const trackUris = trackIds.map((id: string) => `spotify:track:${id}`);
      await spotifyClient.addTracksToPlaylist(req.params.id, trackUris);
      res.json({ success: true, added: trackIds.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to add tracks" });
    }
  });

  // ============ MATCHING ENDPOINTS ============

  // Match songs to playlists
  app.get("/api/match", async (req, res) => {
    try {
      const likedSongsLimit = Math.min(50, Math.max(1, parseInt(req.query.likedSongsLimit as string) || 20));
      const playlistLimit = Math.min(20, Math.max(1, parseInt(req.query.playlistLimit as string) || 10));
      const threshold = Math.min(1, Math.max(0, parseFloat(req.query.threshold as string) || 0.15));

      const result = await genreMatcher.matchSongsToPlaylists(likedSongsLimit, playlistLimit, threshold);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to match songs" });
    }
  });

  // Auto-organize (preview or execute)
  app.post("/api/organize", async (req, res) => {
    try {
      const {
        likedSongsLimit = 20,
        playlistLimit = 10,
        threshold = 0.2,
        dryRun = true,
      } = req.body;

      const result = await genreMatcher.autoOrganize(
        Math.min(50, Math.max(1, likedSongsLimit)),
        Math.min(20, Math.max(1, playlistLimit)),
        Math.min(1, Math.max(0, threshold)),
        dryRun
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to organize" });
    }
  });

  return app;
}

// CLI entry point for web server
if (import.meta.url === `file://${process.argv[1]}`) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const port = parseInt(process.env.PORT || "3001");

  if (!clientId) {
    console.error("Error: SPOTIFY_CLIENT_ID environment variable is required");
    process.exit(1);
  }

  const app = createWebServer(clientId, port);
  app.listen(port, () => {
    console.log(`Playlist Matcher API running on http://localhost:${port}`);
    console.log(`Frontend should run on http://localhost:5173`);
  });
}
