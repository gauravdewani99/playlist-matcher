import express from "express";
import cors from "cors";
import crypto from "crypto";
import { SpotifyClient } from "./spotify/client.js";
import { GenreMatcher } from "./matching/genre-matcher.js";
import { TokenStore } from "./auth/token-store.js";
import { SettingsStore, UserSettings } from "./storage/settings-store.js";
import { MatchHistoryStore } from "./storage/match-history-store.js";
import { SchedulerStore } from "./storage/scheduler-store.js";

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
  const settingsStore = new SettingsStore();
  const matchHistoryStore = new MatchHistoryStore();
  const schedulerStore = new SchedulerStore();
  const oauth = new WebSpotifyOAuth(clientId, tokenStore);
  const spotifyClient = new SpotifyClient(oauth as any);
  const genreMatcher = new GenreMatcher(spotifyClient);

  // Get frontend URL from environment or default to localhost (support multiple Vite ports)
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5174";
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://127.0.0.1:${port}`;
  const redirectUri = `${baseUrl}/api/auth/callback`;

  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    frontendUrl, // Add the configured frontend URL
  ].filter(Boolean);

  console.log("Allowed CORS origins:", allowedOrigins);
  console.log("Frontend URL:", frontendUrl);

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS blocked origin: ${origin}, allowed: ${allowedOrigins.join(", ")}`);
        // Return false instead of throwing error to avoid 500
        callback(null, false);
      }
    },
    credentials: true,
  }));
  app.use(express.json());

  // Cleanup PKCE store periodically
  setInterval(cleanupPkceStore, 60000);

  // Health check endpoint for Railway
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

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

  // Match songs to playlists (filters out already-matched songs)
  app.get("/api/match", async (req, res) => {
    try {
      const user = await spotifyClient.getCurrentUser();
      const likedSongsLimit = Math.min(100, Math.max(1, parseInt(req.query.likedSongsLimit as string) || 20));
      const playlistLimit = Math.min(50, Math.max(1, parseInt(req.query.playlistLimit as string) || 10));
      const threshold = Math.min(1, Math.max(0, parseFloat(req.query.threshold as string) || 0.15));

      // Get already matched track IDs
      const matchedTrackIds = await matchHistoryStore.getMatchedTrackIds(user.id);

      // Get match results, the genreMatcher will handle the matching
      const result = await genreMatcher.matchSongsToPlaylists(likedSongsLimit, playlistLimit, threshold);

      // Filter out already matched songs
      const newMatches = result.matches.filter(m => !matchedTrackIds.has(m.trackId));

      res.json({
        matches: newMatches,
        unmatched: result.unmatched,
        alreadyMatched: result.matches.length - newMatches.length,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to match songs" });
    }
  });

  // Auto-organize (preview or execute) - records matches to history
  app.post("/api/organize", async (req, res) => {
    try {
      const user = await spotifyClient.getCurrentUser();
      const {
        likedSongsLimit = 20,
        playlistLimit = 10,
        threshold = 0.2,
        dryRun = true,
      } = req.body;

      // Get already matched track IDs to filter them out
      const matchedTrackIds = await matchHistoryStore.getMatchedTrackIds(user.id);

      const result = await genreMatcher.autoOrganize(
        Math.min(100, Math.max(1, likedSongsLimit)),
        Math.min(50, Math.max(1, playlistLimit)),
        Math.min(1, Math.max(0, threshold)),
        dryRun
      );

      // Filter out already matched songs
      const newMatches = result.matches.filter(m => !matchedTrackIds.has(m.trackId));

      // If not dry run, record the new matches to history
      if (!dryRun && newMatches.length > 0) {
        const matchRecords = newMatches.map(m => ({
          trackId: m.trackId,
          playlistId: m.playlistId,
          playlistName: m.playlistName,
          matchedAt: Date.now(),
        }));
        await matchHistoryStore.addMatches(user.id, matchRecords);
      }

      res.json({
        ...result,
        matches: newMatches,
        alreadyMatched: result.matches.length - newMatches.length,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to organize" });
    }
  });

  // ============ SETTINGS ENDPOINTS ============

  // Get user settings
  app.get("/api/settings", async (_req, res) => {
    try {
      const user = await spotifyClient.getCurrentUser();
      const settings = await settingsStore.getSettings(user.id);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch settings" });
    }
  });

  // Save user settings and schedule cron job
  app.put("/api/settings", async (req, res) => {
    try {
      const user = await spotifyClient.getCurrentUser();
      const { songsToMatch, intervalDays, scheduleHours, scheduleMinutes } = req.body;

      const updates: Partial<UserSettings> = {};
      if (typeof songsToMatch === "number") updates.songsToMatch = songsToMatch;
      if (typeof intervalDays === "number") updates.intervalDays = intervalDays;
      if (typeof scheduleHours === "number") updates.scheduleHours = scheduleHours;
      if (typeof scheduleMinutes === "number") updates.scheduleMinutes = scheduleMinutes;

      const settings = await settingsStore.saveSettings(user.id, updates);

      // Schedule/update the cron job for this user
      const job = await schedulerStore.scheduleJob(
        user.id,
        settings.intervalDays,
        settings.scheduleHours
      );

      res.json({
        ...settings,
        nextScheduledRun: job.nextRunAt,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save settings" });
    }
  });

  // Get match history for current user
  app.get("/api/match-history", async (_req, res) => {
    try {
      const user = await spotifyClient.getCurrentUser();
      const history = await matchHistoryStore.getHistory(user.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch match history" });
    }
  });

  // Get scheduled job info for current user
  app.get("/api/schedule", async (_req, res) => {
    try {
      const user = await spotifyClient.getCurrentUser();
      const job = await schedulerStore.getJob(user.id);
      res.json(job || { enabled: false });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch schedule" });
    }
  });

  // ============ TRACK MANAGEMENT ENDPOINTS ============

  // Move track between playlists (or just remove from playlist)
  app.post("/api/playlists/move-track", async (req, res) => {
    try {
      const user = await spotifyClient.getCurrentUser();
      const { trackId, fromPlaylistId, toPlaylistId } = req.body;

      if (!trackId) {
        return res.status(400).json({ error: "trackId required" });
      }

      // Must have at least one playlist to act on
      if (!fromPlaylistId && !toPlaylistId) {
        return res.status(400).json({ error: "At least one of fromPlaylistId or toPlaylistId required" });
      }

      const trackUri = `spotify:track:${trackId}`;

      // Remove from source playlist if specified
      if (fromPlaylistId) {
        await spotifyClient.removeTracksFromPlaylist(fromPlaylistId, [trackUri]);
        // Also remove from match history so it can be re-matched in the future
        await matchHistoryStore.removeMatch(user.id, trackId);
      }

      // Add to destination playlist if specified
      if (toPlaylistId) {
        await spotifyClient.addTracksToPlaylist(toPlaylistId, [trackUri]);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to move track" });
    }
  });

  return app;
}

// Export CronRunner for external use
export { CronRunner } from "./scheduler/cron-runner.js";

// CLI entry point for web server
if (import.meta.url === `file://${process.argv[1]}`) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const port = parseInt(process.env.PORT || "3001");
  const enableCron = process.env.ENABLE_CRON !== "false"; // Enabled by default

  if (!clientId) {
    console.error("Error: SPOTIFY_CLIENT_ID environment variable is required");
    process.exit(1);
  }

  const app = createWebServer(clientId, port);

  // Import and start cron runner if enabled
  if (enableCron) {
    import("./scheduler/cron-runner.js").then(({ CronRunner }) => {
      const cronRunner = new CronRunner({
        clientId,
        checkIntervalMs: 60000, // Check every minute
        onJobStart: (job) => {
          console.log(`[Cron] Starting job for user ${job.userId}`);
        },
        onJobComplete: (job, result) => {
          console.log(
            `[Cron] Completed job for user ${job.userId}: ` +
            `${result.matchesAdded} tracks added to ${result.playlists.length} playlists`
          );
        },
        onJobError: (job, error) => {
          console.error(`[Cron] Job failed for user ${job.userId}:`, error.message);
        },
      });
      cronRunner.start();
      console.log("Cron runner started");
    });
  }

  app.listen(port, () => {
    console.log(`Playlist Matcher API running on http://localhost:${port}`);
    console.log(`Frontend should run on http://localhost:5173`);
    if (enableCron) {
      console.log("Cron runner: enabled (checking every minute)");
    } else {
      console.log("Cron runner: disabled (set ENABLE_CRON=true to enable)");
    }
  });
}
