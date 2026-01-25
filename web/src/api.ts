const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:3001/api";
const SESSION_STORAGE_KEY = "sortify_session";

// Session management
export function getStoredSession(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

export function setStoredSession(sessionId: string): void {
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

// ============ TYPES ============

export interface SpotifyUser {
  id: string;
  display_name: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string }[] };
  duration_ms: number;
  popularity: number;
}

export interface TrackWithGenres {
  id: string;
  uri: string;
  name: string;
  artistIds: string[];
  artistNames: string[];
  genres: string[];
  popularity: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  owner: { id: string; display_name: string };
  tracks: { total: number };
  images: { url: string }[];
  public: boolean;
}

export interface MatchResult {
  trackId: string;
  trackUri: string;
  trackName: string;
  artistNames: string;
  trackGenres: string[];
  playlistId: string;
  playlistName: string;
  score: number;
  breakdown: {
    artistOverlap: number;
    genreOverlap: number;
    popularitySimilarity: number;
    weightedGenreScore: number;
  };
}

export interface MatchResponse {
  matches: MatchResult[];
  unmatched: { trackName: string; artistNames: string; reason: string }[];
  alreadyMatched?: number;
}

export interface OrganizeResponse {
  matches: MatchResult[];
  added: { playlistId: string; playlistName: string; tracks: string[] }[];
  unmatched: { trackName: string; artistNames: string; reason: string }[];
  dryRun: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  user?: SpotifyUser;
}

export interface UserSettings {
  songsToMatch: number;
  intervalDays: number;
  scheduleHours: number;
  scheduleMinutes: number;
  lastUpdated: number;
  nextScheduledRun?: number;
}

export interface MatchRecord {
  trackId: string;
  trackName: string;
  artistNames: string;
  playlistId: string;
  playlistName: string;
  matchedAt: number;
}

export interface MatchHistory {
  matches: MatchRecord[];
  lastMatchRun: number;
}

export interface ScheduledJob {
  userId: string;
  nextRunAt: number;
  intervalDays: number;
  scheduleHours: number;
  enabled: boolean;
}

// ============ API FUNCTIONS ============

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  // Add Authorization header if we have a stored session
  const sessionId = getStoredSession();
  if (sessionId) {
    headers["Authorization"] = `Bearer ${sessionId}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include", // Keep for backwards compatibility
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// Auth
export async function getAuthUrl(): Promise<{ url: string }> {
  return fetchApi("/auth/url");
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return fetchApi("/auth/status");
}

export async function validateSession(sessionId: string): Promise<{ success: boolean; userId: string }> {
  return fetchApi("/auth/validate-session", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function logout(): Promise<void> {
  await fetchApi("/auth/logout", { method: "POST" });
  clearStoredSession();
}

// Songs
export async function getLikedSongs(limit: number = 20): Promise<SpotifyTrack[]> {
  return fetchApi(`/songs/liked?limit=${limit}`);
}

export async function getLikedSongsWithGenres(limit: number = 20): Promise<TrackWithGenres[]> {
  return fetchApi(`/songs/liked/with-genres?limit=${limit}`);
}

// Playlists
export async function getPlaylists(limit: number = 20): Promise<SpotifyPlaylist[]> {
  return fetchApi(`/playlists?limit=${limit}`);
}

export async function getPlaylistTracks(playlistId: string, limit: number = 50): Promise<SpotifyTrack[]> {
  return fetchApi(`/playlists/${playlistId}/tracks?limit=${limit}`);
}

export async function addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
  await fetchApi(`/playlists/${playlistId}/tracks`, {
    method: "POST",
    body: JSON.stringify({ trackIds }),
  });
}

// Matching
export async function matchSongs(
  likedSongsLimit: number = 20,
  playlistLimit: number = 10,
  threshold: number = 0.15
): Promise<MatchResponse> {
  return fetchApi(`/match?likedSongsLimit=${likedSongsLimit}&playlistLimit=${playlistLimit}&threshold=${threshold}`);
}

export async function autoOrganize(
  likedSongsLimit: number = 20,
  playlistLimit: number = 10,
  threshold: number = 0.2,
  dryRun: boolean = true
): Promise<OrganizeResponse> {
  return fetchApi("/organize", {
    method: "POST",
    body: JSON.stringify({ likedSongsLimit, playlistLimit, threshold, dryRun }),
  });
}

// Settings
export async function getSettings(): Promise<UserSettings> {
  return fetchApi("/settings");
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  return fetchApi("/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// Track management
export async function moveTrack(
  trackId: string,
  fromPlaylistId: string | null,
  toPlaylistId: string | null
): Promise<void> {
  await fetchApi("/playlists/move-track", {
    method: "POST",
    body: JSON.stringify({
      trackId,
      fromPlaylistId: fromPlaylistId || undefined,
      toPlaylistId: toPlaylistId || undefined
    }),
  });
}

// Remove track from playlist
export async function removeTrackFromPlaylist(
  trackId: string,
  playlistId: string
): Promise<void> {
  await moveTrack(trackId, playlistId, null);
}

// Match history
export async function getMatchHistory(): Promise<MatchHistory> {
  return fetchApi("/match-history");
}

// Schedule
export async function getSchedule(): Promise<ScheduledJob | { enabled: false }> {
  return fetchApi("/schedule");
}

// Sync now
export interface SyncResult {
  success: boolean;
  matchesAdded: number;
  alreadyMatched: number;
  unmatched: number;
}

export async function syncNow(): Promise<SyncResult> {
  return fetchApi("/sync-now", { method: "POST" });
}
