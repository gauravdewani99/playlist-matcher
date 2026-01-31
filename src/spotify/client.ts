import { SpotifyOAuth } from "../auth/oauth.js";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string }[] };
  duration_ms: number;
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

export interface AudioFeatures {
  id: string;
  energy: number;
  danceability: number;
  tempo: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
  loudness: number;
  key: number;
  mode: number;
  time_signature: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers: { total: number };
  images: { url: string; height: number; width: number }[];
}

export class SpotifyClient {
  constructor(private oauth: SpotifyOAuth) {}

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.oauth.getValidAccessToken();

    const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Spotify API error: ${response.status} ${errorText}`);
    }

    // Handle empty responses (like 201 from adding tracks)
    const text = await response.text();
    if (!text) return {} as T;

    return JSON.parse(text);
  }

  async getCurrentUser(): Promise<{ id: string; display_name: string }> {
    return this.request("/me");
  }

  async getLikedSongs(limit: number = 20): Promise<SpotifyTrack[]> {
    const response = await this.request<{
      items: { track: SpotifyTrack }[];
    }>(`/me/tracks?limit=${limit}`);

    return response.items.map((item) => item.track);
  }

  async getUserPlaylists(limit: number = 20): Promise<SpotifyPlaylist[]> {
    const response = await this.request<{
      items: SpotifyPlaylist[];
    }>(`/me/playlists?limit=${limit}`);

    return response.items;
  }

  async getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    return this.request(`/playlists/${playlistId}`);
  }

  async getPlaylistTracks(playlistId: string, limit: number = 50): Promise<SpotifyTrack[]> {
    const response = await this.request<{
      items: { track: SpotifyTrack | null }[];
    }>(`/playlists/${playlistId}/tracks?limit=${limit}&fields=items(track(id,name,uri,artists(id,name),album(id,name,images),duration_ms,popularity))`);

    return response.items
      .map((item) => item.track)
      .filter((track): track is SpotifyTrack => track !== null);
  }

  async getTracks(trackIds: string[]): Promise<SpotifyTrack[]> {
    if (trackIds.length === 0) return [];

    // Spotify allows max 50 tracks per request
    const chunks: string[][] = [];
    for (let i = 0; i < trackIds.length; i += 50) {
      chunks.push(trackIds.slice(i, i + 50));
    }

    const results: SpotifyTrack[] = [];

    for (const chunk of chunks) {
      const response = await this.request<{
        tracks: (SpotifyTrack | null)[];
      }>(`/tracks?ids=${chunk.join(",")}`);
      results.push(...response.tracks.filter((t): t is SpotifyTrack => t !== null));
    }

    return results;
  }

  async getAudioFeatures(trackIds: string[]): Promise<(AudioFeatures | null)[]> {
    if (trackIds.length === 0) return [];

    // Spotify allows max 100 tracks per request
    const chunks: string[][] = [];
    for (let i = 0; i < trackIds.length; i += 100) {
      chunks.push(trackIds.slice(i, i + 100));
    }

    const results: (AudioFeatures | null)[] = [];

    for (const chunk of chunks) {
      try {
        const response = await this.request<{
          audio_features: (AudioFeatures | null)[];
        }>(`/audio-features?ids=${chunk.join(",")}`);
        results.push(...response.audio_features);
      } catch (error) {
        // If audio features are unavailable (403), return nulls
        if (error instanceof Error && error.message.includes("403")) {
          console.error("Audio features API unavailable - you may need extended access");
          results.push(...chunk.map(() => null));
        } else {
          throw error;
        }
      }
    }

    return results;
  }

  async addTracksToPlaylist(playlistId: string, trackUris: string[]): Promise<void> {
    if (trackUris.length === 0) return;

    // Spotify allows max 100 tracks per request
    const chunks: string[][] = [];
    for (let i = 0; i < trackUris.length; i += 100) {
      chunks.push(trackUris.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      await this.request(`/playlists/${playlistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ uris: chunk }),
      });
    }
  }

  async removeTracksFromPlaylist(playlistId: string, trackUris: string[]): Promise<void> {
    if (trackUris.length === 0) return;

    await this.request(`/playlists/${playlistId}/tracks`, {
      method: "DELETE",
      body: JSON.stringify({
        tracks: trackUris.map((uri) => ({ uri })),
      }),
    });
  }

  async getArtist(artistId: string): Promise<SpotifyArtist> {
    return this.request(`/artists/${artistId}`);
  }

  async getArtists(artistIds: string[]): Promise<SpotifyArtist[]> {
    if (artistIds.length === 0) return [];

    // Spotify allows max 50 artists per request
    const chunks: string[][] = [];
    for (let i = 0; i < artistIds.length; i += 50) {
      chunks.push(artistIds.slice(i, i + 50));
    }

    // Fetch all chunks in parallel for better performance
    const chunkPromises = chunks.map(chunk =>
      this.request<{ artists: SpotifyArtist[] }>(`/artists?ids=${chunk.join(",")}`)
    );

    const responses = await Promise.all(chunkPromises);
    return responses.flatMap(r => r.artists);
  }

  async getRelatedArtists(artistId: string): Promise<SpotifyArtist[]> {
    const response = await this.request<{
      artists: SpotifyArtist[];
    }>(`/artists/${artistId}/related-artists`);
    return response.artists;
  }
}
