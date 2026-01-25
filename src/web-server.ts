import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import { SpotifyClient } from "./spotify/client.js";
import { GenreMatcher } from "./matching/genre-matcher.js";

// File-based stores (fallback for local development)
import { TokenStore } from "./auth/token-store.js";
import { SettingsStore, UserSettings } from "./storage/settings-store.js";
import { MatchHistoryStore } from "./storage/match-history-store.js";
import { SchedulerStore } from "./storage/scheduler-store.js";

// PostgreSQL stores (for production with DATABASE_URL)
import { isDatabaseConfigured, initializeDatabase } from "./storage/database.js";
import { PgTokenStore, OAuthTokenBuffer, StoredTokens } from "./storage/pg-token-store.js";
import { PgSettingsStore } from "./storage/pg-settings-store.js";
import { PgMatchHistoryStore } from "./storage/pg-match-history-store.js";
import { PgSchedulerStore } from "./storage/pg-scheduler-store.js";
import { SessionStore, OAuthStateStore } from "./storage/session-store.js";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

const SCOPES = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

const SESSION_COOKIE_NAME = "sortify_session";

// Extend Express Request to include user context
interface AuthenticatedRequest extends Request {
  userId?: string;
  accessToken?: string;
}

// PKCE helpers
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

// Common token store interface
interface ITokenStore {
  saveTokens(tokens: StoredTokens, userId?: string): Promise<void>;
  getTokens(userId?: string): Promise<StoredTokens | null>;
  clearTokens(userId?: string): Promise<void>;
}

// Common settings store interface
interface ISettingsStore {
  getSettings(userId: string): Promise<UserSettings>;
  saveSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings>;
}

// Common match history store interface
interface IMatchHistoryStore {
  getHistory(userId: string): Promise<{ matches: any[]; lastMatchRun: number }>;
  addMatches(userId: string, matches: any[]): Promise<void>;
  removeMatch(userId: string, trackId: string): Promise<void>;
  getMatchedTrackIds(userId: string): Promise<Set<string>>;
}

// Common scheduler store interface
interface ISchedulerStore {
  scheduleJob(userId: string, intervalDays: number, scheduleHours: number): Promise<any>;
  getJob(userId: string): Promise<any | null>;
  getJobsDueNow(): Promise<any[]>;
  updateNextRun(userId: string): Promise<any>;
  disableJob(userId: string): Promise<void>;
}

// OAuth helper that uses per-request tokens
class RequestScopedOAuth {
  private clientId: string;
  private tokenStore: PgTokenStore;
  private userId: string;

  constructor(clientId: string, tokenStore: PgTokenStore, userId: string) {
    this.clientId = clientId;
    this.tokenStore = tokenStore;
    this.userId = userId;
  }

  async getValidAccessToken(): Promise<string> {
    const tokens = await this.tokenStore.getTokens(this.userId);

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
    }, this.userId);

    return newTokens.access_token;
  }
}

// Temporary OAuth for callback (when we don't know userId yet)
class TempOAuth {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async getValidAccessToken(): Promise<string> {
    return this.accessToken;
  }
}

export async function createWebServer(clientId: string, port: number = 3001) {
  const app = express();

  // Determine storage backend
  const usePostgres = isDatabaseConfigured();
  console.log(`[Storage] DATABASE_URL is ${process.env.DATABASE_URL ? "set" : "NOT set"}`);
  console.log(`[Storage] Using ${usePostgres ? "PostgreSQL" : "file-based"} storage`);

  // Initialize stores
  let tokenStore: ITokenStore;
  let pgTokenStore: PgTokenStore | null = null;
  let settingsStore: ISettingsStore;
  let matchHistoryStore: IMatchHistoryStore;
  let schedulerStore: ISchedulerStore;
  let sessionStore: SessionStore | null = null;
  let oauthStateStore: OAuthStateStore | null = null;
  let oauthTokenBuffer: OAuthTokenBuffer | null = null;

  // In-memory PKCE store for file-based mode
  const pkceStore = new Map<string, { verifier: string; createdAt: number }>();

  if (usePostgres) {
    await initializeDatabase();

    pgTokenStore = new PgTokenStore();
    tokenStore = pgTokenStore as unknown as ITokenStore;
    settingsStore = new PgSettingsStore();
    matchHistoryStore = new PgMatchHistoryStore();
    schedulerStore = new PgSchedulerStore();
    sessionStore = new SessionStore();
    oauthStateStore = new OAuthStateStore();
    oauthTokenBuffer = new OAuthTokenBuffer();

    console.log("[Storage] PostgreSQL stores initialized with session support");
  } else {
    tokenStore = new TokenStore();
    settingsStore = new SettingsStore();
    matchHistoryStore = new MatchHistoryStore();
    schedulerStore = new SchedulerStore();

    console.log("[Storage] File-based stores initialized (single-user mode)");
  }

  // Get frontend URL from environment
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
    frontendUrl,
  ].filter(Boolean);

  console.log("Allowed CORS origins:", allowedOrigins);
  console.log("Frontend URL:", frontendUrl);

  // Middleware
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS blocked origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  // Cleanup expired sessions and OAuth states periodically
  if (usePostgres && sessionStore && oauthStateStore && oauthTokenBuffer) {
    setInterval(async () => {
      try {
        const sessionsCleared = await sessionStore!.cleanupExpiredSessions();
        const statesCleared = await oauthStateStore!.cleanupOldStates();
        const tokensCleared = await oauthTokenBuffer!.cleanup();
        if (sessionsCleared > 0 || statesCleared > 0 || tokensCleared > 0) {
          console.log(`[Cleanup] Cleared ${sessionsCleared} sessions, ${statesCleared} states, ${tokensCleared} temp tokens`);
        }
      } catch (err) {
        console.error("[Cleanup] Error:", err);
      }
    }, 60000);
  } else {
    // Cleanup PKCE store for file-based mode
    setInterval(() => {
      const now = Date.now();
      for (const [state, data] of pkceStore.entries()) {
        if (now - data.createdAt > 600000) {
          pkceStore.delete(state);
        }
      }
    }, 60000);
  }

  // Authentication middleware for protected routes
  const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (usePostgres && sessionStore && pgTokenStore) {
        // PostgreSQL mode: use session cookie
        const sessionId = req.cookies[SESSION_COOKIE_NAME];

        if (!sessionId) {
          return res.status(401).json({ error: "Not authenticated" });
        }

        const session = await sessionStore.getSession(sessionId);
        if (!session) {
          // Clear invalid cookie
          res.clearCookie(SESSION_COOKIE_NAME);
          return res.status(401).json({ error: "Session expired" });
        }

        // Set user context on request
        req.userId = session.userId;

        // Create request-scoped OAuth and get access token
        const oauth = new RequestScopedOAuth(clientId, pgTokenStore, session.userId);
        try {
          req.accessToken = await oauth.getValidAccessToken();
        } catch {
          // Token refresh failed, session is invalid
          await sessionStore.deleteSession(sessionId);
          res.clearCookie(SESSION_COOKIE_NAME);
          return res.status(401).json({ error: "Token expired" });
        }

        next();
      } else {
        // File-based mode: single user, no session needed
        const tokens = await tokenStore.getTokens();
        if (!tokens) {
          return res.status(401).json({ error: "Not authenticated" });
        }

        req.accessToken = tokens.accessToken;
        next();
      }
    } catch (error) {
      console.error("[Auth] Middleware error:", error);
      res.status(500).json({ error: "Authentication error" });
    }
  };

  // Helper to create Spotify client for a request
  const createSpotifyClient = (req: AuthenticatedRequest): SpotifyClient => {
    const oauth = {
      getValidAccessToken: async () => req.accessToken!,
    };
    return new SpotifyClient(oauth as any);
  };

  // ============ HEALTH CHECK ============
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      storage: usePostgres ? "postgresql" : "file",
      multiUser: usePostgres,
      timestamp: new Date().toISOString(),
    });
  });

  // ============ AUTH ENDPOINTS ============

  // Get auth URL
  app.get("/api/auth/url", async (_req, res) => {
    try {
      const state = generateState();
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);

      if (usePostgres && oauthStateStore) {
        // Store in database
        await oauthStateStore.saveState(state, verifier);
      } else {
        // Store in memory
        pkceStore.set(state, { verifier, createdAt: Date.now() });
      }

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
      console.error("[Auth] URL generation error:", error);
      res.status(500).json({ error: "Failed to generate auth URL" });
    }
  });

  // OAuth callback
  app.get("/api/auth/callback", async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${frontendUrl}?error=${encodeURIComponent(error as string)}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}?error=missing_params`);
    }

    try {
      let verifier: string | null = null;

      if (usePostgres && oauthStateStore) {
        verifier = await oauthStateStore.consumeState(state as string);
      } else {
        const pkceData = pkceStore.get(state as string);
        if (pkceData) {
          verifier = pkceData.verifier;
          pkceStore.delete(state as string);
        }
      }

      if (!verifier) {
        return res.redirect(`${frontendUrl}?error=invalid_state`);
      }

      // Exchange code for tokens
      const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Auth] Token exchange failed:", errorText);
        return res.redirect(`${frontendUrl}?error=token_exchange_failed`);
      }

      const tokens = await response.json();
      const tokenData: StoredTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      };

      if (usePostgres && pgTokenStore && sessionStore) {
        // Get user ID from Spotify
        console.log("[Auth] Getting user info from Spotify...");
        const tempOauth = new TempOAuth(tokens.access_token);
        const tempClient = new SpotifyClient(tempOauth as any);
        const user = await tempClient.getCurrentUser();
        console.log(`[Auth] Got user: ${user.id}`);

        // Save tokens to database with user ID
        console.log("[Auth] Saving tokens to database...");
        await pgTokenStore.saveTokens(tokenData, user.id);
        console.log("[Auth] Tokens saved");

        // Create session
        console.log("[Auth] Creating session...");
        const session = await sessionStore.createSession(user.id);
        console.log(`[Auth] Session created: ${session.sessionId.substring(0, 8)}...`);

        // For cross-origin setup (Vercel frontend + Railway backend),
        // pass session token in URL for frontend to store
        // Frontend will call /api/auth/set-session to establish the cookie
        console.log(`[Auth] User ${user.id} logged in successfully`);
        return res.redirect(`${frontendUrl}?auth=success&session=${session.sessionId}`);
      } else {
        // File-based mode: just save tokens
        await tokenStore.saveTokens(tokenData);
      }

      res.redirect(`${frontendUrl}?auth=success`);
    } catch (err) {
      console.error("[Auth] Callback error:", err);
      res.redirect(`${frontendUrl}?error=auth_failed`);
    }
  });

  // Check auth status
  app.get("/api/auth/status", async (req: AuthenticatedRequest, res) => {
    try {
      if (usePostgres && sessionStore && pgTokenStore) {
        const sessionId = req.cookies[SESSION_COOKIE_NAME];

        if (!sessionId) {
          return res.json({ authenticated: false });
        }

        const session = await sessionStore.getSession(sessionId);
        if (!session) {
          res.clearCookie(SESSION_COOKIE_NAME);
          return res.json({ authenticated: false });
        }

        // Get user info
        const oauth = new RequestScopedOAuth(clientId, pgTokenStore, session.userId);
        try {
          const accessToken = await oauth.getValidAccessToken();
          const tempOauth = new TempOAuth(accessToken);
          const client = new SpotifyClient(tempOauth as any);
          const user = await client.getCurrentUser();

          res.json({ authenticated: true, user });
        } catch {
          // Token invalid, clear session
          await sessionStore.deleteSession(sessionId);
          res.clearCookie(SESSION_COOKIE_NAME);
          res.json({ authenticated: false });
        }
      } else {
        // File-based mode
        const tokens = await tokenStore.getTokens();
        if (!tokens) {
          return res.json({ authenticated: false });
        }

        try {
          const tempOauth = new TempOAuth(tokens.accessToken);
          const client = new SpotifyClient(tempOauth as any);
          const user = await client.getCurrentUser();
          res.json({ authenticated: true, user });
        } catch {
          res.json({ authenticated: false });
        }
      }
    } catch {
      res.json({ authenticated: false });
    }
  });

  // Set session cookie (called by frontend after OAuth redirect)
  app.post("/api/auth/set-session", async (req: AuthenticatedRequest, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId || !usePostgres || !sessionStore) {
        return res.status(400).json({ error: "Invalid request" });
      }

      // Verify session exists and is valid
      const session = await sessionStore.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Invalid session" });
      }

      // Set the session cookie
      const isProduction = !!process.env.RAILWAY_PUBLIC_DOMAIN;
      res.cookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      console.log(`[Auth] Session cookie set for user ${session.userId}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Set session error:", error);
      res.status(500).json({ error: "Failed to set session" });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req: AuthenticatedRequest, res) => {
    try {
      if (usePostgres && sessionStore) {
        const sessionId = req.cookies[SESSION_COOKIE_NAME];
        if (sessionId) {
          await sessionStore.deleteSession(sessionId);
        }
        res.clearCookie(SESSION_COOKIE_NAME, {
          httpOnly: true,
          secure: !!process.env.RAILWAY_PUBLIC_DOMAIN,
          sameSite: process.env.RAILWAY_PUBLIC_DOMAIN ? "none" : "lax",
        });
      } else {
        await tokenStore.clearTokens();
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to logout" });
    }
  });

  // ============ PROTECTED ROUTES ============

  // Get liked songs
  app.get("/api/songs/liked", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const spotifyClient = createSpotifyClient(req);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const tracks = await spotifyClient.getLikedSongs(limit);
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch liked songs" });
    }
  });

  // Get liked songs with genres
  app.get("/api/songs/liked/with-genres", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const spotifyClient = createSpotifyClient(req);
      const genreMatcher = new GenreMatcher(spotifyClient);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const tracks = await spotifyClient.getLikedSongs(limit);
      const enriched = await genreMatcher.enrichTracksWithGenres(tracks);
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch liked songs" });
    }
  });

  // Get playlists
  app.get("/api/playlists", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const spotifyClient = createSpotifyClient(req);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const playlists = await spotifyClient.getUserPlaylists(limit);
      res.json(playlists);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch playlists" });
    }
  });

  // Get playlist tracks
  app.get("/api/playlists/:id/tracks", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const spotifyClient = createSpotifyClient(req);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const playlistId = req.params.id as string;
      const tracks = await spotifyClient.getPlaylistTracks(playlistId, limit);
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch playlist tracks" });
    }
  });

  // Add tracks to playlist
  app.post("/api/playlists/:id/tracks", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const spotifyClient = createSpotifyClient(req);
      const { trackIds } = req.body;
      if (!trackIds || !Array.isArray(trackIds)) {
        return res.status(400).json({ error: "trackIds array required" });
      }
      const playlistId = req.params.id as string;
      const trackUris = trackIds.map((id: string) => `spotify:track:${id}`);
      await spotifyClient.addTracksToPlaylist(playlistId, trackUris);
      res.json({ success: true, added: trackIds.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to add tracks" });
    }
  });

  // Match songs
  app.get("/api/match", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const spotifyClient = createSpotifyClient(req);
      const genreMatcher = new GenreMatcher(spotifyClient);

      // Get user ID for PostgreSQL mode
      let userId: string;
      if (usePostgres && req.userId) {
        userId = req.userId;
      } else {
        const user = await spotifyClient.getCurrentUser();
        userId = user.id;
      }

      const likedSongsLimit = Math.min(100, Math.max(1, parseInt(req.query.likedSongsLimit as string) || 20));
      const playlistLimit = Math.min(50, Math.max(1, parseInt(req.query.playlistLimit as string) || 10));
      const threshold = Math.min(1, Math.max(0, parseFloat(req.query.threshold as string) || 0.15));

      const matchedTrackIds = await matchHistoryStore.getMatchedTrackIds(userId);
      const result = await genreMatcher.matchSongsToPlaylists(likedSongsLimit, playlistLimit, threshold);
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

  // Auto-organize
  app.post("/api/organize", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const spotifyClient = createSpotifyClient(req);
      const genreMatcher = new GenreMatcher(spotifyClient);

      let userId: string;
      if (usePostgres && req.userId) {
        userId = req.userId;
      } else {
        const user = await spotifyClient.getCurrentUser();
        userId = user.id;
      }

      const {
        likedSongsLimit = 20,
        playlistLimit = 10,
        threshold = 0.2,
        dryRun = true,
      } = req.body;

      const matchedTrackIds = await matchHistoryStore.getMatchedTrackIds(userId);
      const result = await genreMatcher.autoOrganize(
        Math.min(100, Math.max(1, likedSongsLimit)),
        Math.min(50, Math.max(1, playlistLimit)),
        Math.min(1, Math.max(0, threshold)),
        dryRun
      );

      const newMatches = result.matches.filter(m => !matchedTrackIds.has(m.trackId));

      if (!dryRun && newMatches.length > 0) {
        const matchRecords = newMatches.map(m => ({
          trackId: m.trackId,
          trackName: m.trackName,
          artistNames: m.artistNames,
          playlistId: m.playlistId,
          playlistName: m.playlistName,
          matchedAt: Date.now(),
        }));
        await matchHistoryStore.addMatches(userId, matchRecords);
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

  // Get settings
  app.get("/api/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      let userId: string;
      if (usePostgres && req.userId) {
        userId = req.userId;
      } else {
        const spotifyClient = createSpotifyClient(req);
        const user = await spotifyClient.getCurrentUser();
        userId = user.id;
      }

      const settings = await settingsStore.getSettings(userId);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch settings" });
    }
  });

  // Save settings
  app.put("/api/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      let userId: string;
      if (usePostgres && req.userId) {
        userId = req.userId;
      } else {
        const spotifyClient = createSpotifyClient(req);
        const user = await spotifyClient.getCurrentUser();
        userId = user.id;
      }

      const { songsToMatch, intervalDays, scheduleHours, scheduleMinutes } = req.body;

      const updates: Partial<UserSettings> = {};
      if (typeof songsToMatch === "number") updates.songsToMatch = songsToMatch;
      if (typeof intervalDays === "number") updates.intervalDays = intervalDays;
      if (typeof scheduleHours === "number") updates.scheduleHours = scheduleHours;
      if (typeof scheduleMinutes === "number") updates.scheduleMinutes = scheduleMinutes;

      const settings = await settingsStore.saveSettings(userId, updates);
      const job = await schedulerStore.scheduleJob(userId, settings.intervalDays, settings.scheduleHours);

      res.json({
        ...settings,
        nextScheduledRun: job.nextRunAt,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save settings" });
    }
  });

  // Get match history
  app.get("/api/match-history", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      let userId: string;
      if (usePostgres && req.userId) {
        userId = req.userId;
      } else {
        const spotifyClient = createSpotifyClient(req);
        const user = await spotifyClient.getCurrentUser();
        userId = user.id;
      }

      const history = await matchHistoryStore.getHistory(userId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch match history" });
    }
  });

  // Get schedule
  app.get("/api/schedule", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      let userId: string;
      if (usePostgres && req.userId) {
        userId = req.userId;
      } else {
        const spotifyClient = createSpotifyClient(req);
        const user = await spotifyClient.getCurrentUser();
        userId = user.id;
      }

      const job = await schedulerStore.getJob(userId);
      res.json(job || { enabled: false });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch schedule" });
    }
  });

  // Sync now
  app.post("/api/sync-now", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const spotifyClient = createSpotifyClient(req);
      const genreMatcher = new GenreMatcher(spotifyClient);

      let userId: string;
      if (usePostgres && req.userId) {
        userId = req.userId;
      } else {
        const user = await spotifyClient.getCurrentUser();
        userId = user.id;
      }

      const settings = await settingsStore.getSettings(userId);
      const matchedTrackIds = await matchHistoryStore.getMatchedTrackIds(userId);

      const result = await genreMatcher.autoOrganize(
        settings.songsToMatch,
        50,
        0.15,
        false
      );

      const newMatches = result.matches.filter((m) => !matchedTrackIds.has(m.trackId));

      if (newMatches.length > 0) {
        const matchRecords = newMatches.map((m) => ({
          trackId: m.trackId,
          trackName: m.trackName,
          artistNames: m.artistNames,
          playlistId: m.playlistId,
          playlistName: m.playlistName,
          matchedAt: Date.now(),
        }));
        await matchHistoryStore.addMatches(userId, matchRecords);
      }

      res.json({
        success: true,
        matchesAdded: newMatches.length,
        alreadyMatched: result.matches.length - newMatches.length,
        unmatched: result.unmatched.length,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Sync failed" });
    }
  });

  // Move track
  app.post("/api/playlists/move-track", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const spotifyClient = createSpotifyClient(req);

      let userId: string;
      if (usePostgres && req.userId) {
        userId = req.userId;
      } else {
        const user = await spotifyClient.getCurrentUser();
        userId = user.id;
      }

      const { trackId, fromPlaylistId, toPlaylistId } = req.body;

      if (!trackId) {
        return res.status(400).json({ error: "trackId required" });
      }

      if (!fromPlaylistId && !toPlaylistId) {
        return res.status(400).json({ error: "At least one of fromPlaylistId or toPlaylistId required" });
      }

      const trackUri = `spotify:track:${trackId}`;

      if (fromPlaylistId) {
        await spotifyClient.removeTracksFromPlaylist(fromPlaylistId, [trackUri]);
        await matchHistoryStore.removeMatch(userId, trackId);
      }

      if (toPlaylistId) {
        await spotifyClient.addTracksToPlaylist(toPlaylistId, [trackUri]);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to move track" });
    }
  });

  return { app, schedulerStore };
}

// Export CronRunner
export { CronRunner } from "./scheduler/cron-runner.js";

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const port = parseInt(process.env.PORT || "3001");
  const enableCron = process.env.ENABLE_CRON !== "false";

  if (!clientId) {
    console.error("Error: SPOTIFY_CLIENT_ID environment variable is required");
    process.exit(1);
  }

  createWebServer(clientId, port).then(({ app }) => {
    if (enableCron) {
      import("./scheduler/cron-runner.js").then(({ CronRunner }) => {
        const cronRunner = new CronRunner({
          clientId,
          checkIntervalMs: 60000,
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
        console.log("Cron runner: disabled");
      }
    });
  }).catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
