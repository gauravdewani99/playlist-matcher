import { SpotifyClient } from "../spotify/client.js";
import { GenreMatcher } from "../matching/genre-matcher.js";
import { TokenStore } from "../auth/token-store.js";
import { SettingsStore } from "../storage/settings-store.js";
import { MatchHistoryStore } from "../storage/match-history-store.js";
import { SchedulerStore, ScheduledJob } from "../storage/scheduler-store.js";

interface CronRunnerOptions {
  clientId: string;
  checkIntervalMs?: number; // How often to check for due jobs (default: 1 minute)
  onJobStart?: (job: ScheduledJob) => void;
  onJobComplete?: (job: ScheduledJob, result: JobResult) => void;
  onJobError?: (job: ScheduledJob, error: Error) => void;
}

interface JobResult {
  matchesAdded: number;
  alreadyMatched: number;
  unmatched: number;
  playlists: string[];
}

export class CronRunner {
  private clientId: string;
  private checkIntervalMs: number;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private tokenStore: TokenStore;
  private settingsStore: SettingsStore;
  private matchHistoryStore: MatchHistoryStore;
  private schedulerStore: SchedulerStore;
  private onJobStart?: (job: ScheduledJob) => void;
  private onJobComplete?: (job: ScheduledJob, result: JobResult) => void;
  private onJobError?: (job: ScheduledJob, error: Error) => void;

  constructor(options: CronRunnerOptions) {
    this.clientId = options.clientId;
    this.checkIntervalMs = options.checkIntervalMs || 60000; // Default: 1 minute
    this.tokenStore = new TokenStore();
    this.settingsStore = new SettingsStore();
    this.matchHistoryStore = new MatchHistoryStore();
    this.schedulerStore = new SchedulerStore();
    this.onJobStart = options.onJobStart;
    this.onJobComplete = options.onJobComplete;
    this.onJobError = options.onJobError;
  }

  start(): void {
    if (this.isRunning) {
      console.log("[CronRunner] Already running");
      return;
    }

    console.log(`[CronRunner] Starting with ${this.checkIntervalMs}ms check interval`);
    this.isRunning = true;

    // Run immediately on start
    this.checkAndRunDueJobs();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAndRunDueJobs();
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (!this.isRunning) {
      console.log("[CronRunner] Not running");
      return;
    }

    console.log("[CronRunner] Stopping");
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkAndRunDueJobs(): Promise<void> {
    try {
      const dueJobs = await this.schedulerStore.getJobsDueNow();

      if (dueJobs.length === 0) {
        return;
      }

      console.log(`[CronRunner] Found ${dueJobs.length} due job(s)`);

      for (const job of dueJobs) {
        await this.runJob(job);
      }
    } catch (error) {
      console.error("[CronRunner] Error checking for due jobs:", error);
    }
  }

  private async runJob(job: ScheduledJob): Promise<void> {
    console.log(`[CronRunner] Running job for user ${job.userId}`);
    this.onJobStart?.(job);

    try {
      // Create OAuth instance for this user
      const oauth = new UserSpotifyOAuth(this.clientId, this.tokenStore, job.userId);

      // Check if user is still authenticated
      const isAuth = await oauth.isAuthenticated();
      if (!isAuth) {
        console.log(`[CronRunner] User ${job.userId} is not authenticated, skipping`);
        // Disable the job since user is not authenticated
        await this.schedulerStore.disableJob(job.userId);
        return;
      }

      // Create clients
      const spotifyClient = new SpotifyClient(oauth as any);
      const genreMatcher = new GenreMatcher(spotifyClient);

      // Get user settings
      const settings = await this.settingsStore.getSettings(job.userId);

      // Get already matched track IDs
      const matchedTrackIds = await this.matchHistoryStore.getMatchedTrackIds(job.userId);

      // Run the matching (not dry run - actually add tracks)
      const result = await genreMatcher.autoOrganize(
        settings.songsToMatch,
        50, // playlistLimit
        0.15, // threshold
        false // dryRun = false, actually add tracks
      );

      // Filter out already matched songs
      const newMatches = result.matches.filter(m => !matchedTrackIds.has(m.trackId));

      // Record the new matches to history
      if (newMatches.length > 0) {
        const matchRecords = newMatches.map(m => ({
          trackId: m.trackId,
          trackName: m.trackName,
          artistNames: m.artistNames,
          playlistId: m.playlistId,
          playlistName: m.playlistName,
          matchedAt: Date.now(),
        }));
        await this.matchHistoryStore.addMatches(job.userId, matchRecords);
      }

      // Update next run time
      await this.schedulerStore.updateNextRun(job.userId);

      const jobResult: JobResult = {
        matchesAdded: newMatches.length,
        alreadyMatched: result.matches.length - newMatches.length,
        unmatched: result.unmatched.length,
        playlists: [...new Set(newMatches.map(m => m.playlistName))],
      };

      console.log(
        `[CronRunner] Job completed for user ${job.userId}: ` +
        `${jobResult.matchesAdded} added, ${jobResult.alreadyMatched} already matched`
      );

      this.onJobComplete?.(job, jobResult);
    } catch (error) {
      console.error(`[CronRunner] Job failed for user ${job.userId}:`, error);
      this.onJobError?.(job, error instanceof Error ? error : new Error(String(error)));

      // Still update next run time so we don't keep retrying immediately
      await this.schedulerStore.updateNextRun(job.userId);
    }
  }
}

// OAuth class that works with stored tokens for a specific user
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

class UserSpotifyOAuth {
  private clientId: string;
  private tokenStore: TokenStore;
  private userId: string;

  constructor(clientId: string, tokenStore: TokenStore, userId: string) {
    this.clientId = clientId;
    this.tokenStore = tokenStore;
    this.userId = userId;
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
