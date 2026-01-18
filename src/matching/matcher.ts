import { SpotifyClient, SpotifyTrack, SpotifyPlaylist, AudioFeatures } from "../spotify/client.js";
import { calculateSimilarity, calculateAverageFeatures, formatFeatures } from "./similarity.js";

export interface PlaylistVibe {
  playlistId: string;
  playlistName: string;
  trackCount: number;
  sampledCount: number;
  averageFeatures: AudioFeatures;
  formattedFeatures: Record<string, string>;
}

export interface SongMatch {
  trackId: string;
  trackUri: string;
  trackName: string;
  artistName: string;
  playlistId: string;
  playlistName: string;
  similarityScore: number;
  songFeatures: Record<string, string>;
  playlistFeatures: Record<string, string>;
}

export interface OrganizeResult {
  matches: SongMatch[];
  added: { playlistId: string; playlistName: string; tracks: string[] }[];
  unmatched: { trackName: string; artistName: string; reason: string }[];
  dryRun: boolean;
}

export class SongMatcher {
  constructor(private spotifyClient: SpotifyClient) {}

  async analyzePlaylistVibe(playlistId: string, sampleSize: number = 20): Promise<PlaylistVibe> {
    const playlist = await this.spotifyClient.getPlaylist(playlistId);
    const tracks = await this.spotifyClient.getPlaylistTracks(playlistId, sampleSize);

    if (tracks.length === 0) {
      throw new Error(`Playlist "${playlist.name}" has no tracks`);
    }

    const trackIds = tracks.map((t) => t.id);
    const features = await this.spotifyClient.getAudioFeatures(trackIds);
    const validFeatures = features.filter((f): f is AudioFeatures => f !== null);

    if (validFeatures.length === 0) {
      throw new Error(`No audio features available for tracks in "${playlist.name}"`);
    }

    const averageFeatures = calculateAverageFeatures(validFeatures);

    return {
      playlistId,
      playlistName: playlist.name,
      trackCount: playlist.tracks.total,
      sampledCount: validFeatures.length,
      averageFeatures,
      formattedFeatures: formatFeatures(averageFeatures),
    };
  }

  async matchSongsToPlaylists(
    likedSongsLimit: number = 20,
    playlistLimit: number = 10,
    similarityThreshold: number = 0.7
  ): Promise<{ matches: SongMatch[]; unmatched: { trackName: string; artistName: string; reason: string }[] }> {
    // Get liked songs
    const likedSongs = await this.spotifyClient.getLikedSongs(likedSongsLimit);

    if (likedSongs.length === 0) {
      return { matches: [], unmatched: [] };
    }

    const likedTrackIds = likedSongs.map((s) => s.id);
    const likedFeatures = await this.spotifyClient.getAudioFeatures(likedTrackIds);

    // Get user's playlists
    const playlists = await this.spotifyClient.getUserPlaylists(playlistLimit);

    if (playlists.length === 0) {
      return {
        matches: [],
        unmatched: likedSongs.map((s) => ({
          trackName: s.name,
          artistName: s.artists.map((a) => a.name).join(", "),
          reason: "No playlists found",
        })),
      };
    }

    // Analyze each playlist's vibe
    const playlistVibes: PlaylistVibe[] = [];
    for (const playlist of playlists) {
      // Skip empty playlists
      if (playlist.tracks.total === 0) continue;

      try {
        const vibe = await this.analyzePlaylistVibe(playlist.id, 20);
        playlistVibes.push(vibe);
      } catch (error) {
        console.error(`Skipping playlist "${playlist.name}":`, error);
      }
    }

    if (playlistVibes.length === 0) {
      return {
        matches: [],
        unmatched: likedSongs.map((s) => ({
          trackName: s.name,
          artistName: s.artists.map((a) => a.name).join(", "),
          reason: "No playlists with analyzable tracks",
        })),
      };
    }

    // Match each liked song to best playlist
    const matches: SongMatch[] = [];
    const unmatched: { trackName: string; artistName: string; reason: string }[] = [];

    for (let i = 0; i < likedSongs.length; i++) {
      const song = likedSongs[i];
      const songFeatures = likedFeatures[i];
      const artistName = song.artists.map((a) => a.name).join(", ");

      if (!songFeatures) {
        unmatched.push({
          trackName: song.name,
          artistName,
          reason: "Audio features unavailable",
        });
        continue;
      }

      let bestMatch: { playlist: PlaylistVibe; score: number } | null = null;

      for (const playlistVibe of playlistVibes) {
        const score = calculateSimilarity(songFeatures, playlistVibe.averageFeatures);

        if (score >= similarityThreshold) {
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { playlist: playlistVibe, score };
          }
        }
      }

      if (bestMatch) {
        matches.push({
          trackId: song.id,
          trackUri: song.uri,
          trackName: song.name,
          artistName,
          playlistId: bestMatch.playlist.playlistId,
          playlistName: bestMatch.playlist.playlistName,
          similarityScore: Math.round(bestMatch.score * 100) / 100,
          songFeatures: formatFeatures(songFeatures),
          playlistFeatures: bestMatch.playlist.formattedFeatures,
        });
      } else {
        unmatched.push({
          trackName: song.name,
          artistName,
          reason: `No playlist matched (best score below ${similarityThreshold} threshold)`,
        });
      }
    }

    // Sort by similarity score
    matches.sort((a, b) => b.similarityScore - a.similarityScore);

    return { matches, unmatched };
  }

  async autoOrganize(
    likedSongsLimit: number = 20,
    playlistLimit: number = 10,
    similarityThreshold: number = 0.75,
    dryRun: boolean = true
  ): Promise<OrganizeResult> {
    const { matches, unmatched } = await this.matchSongsToPlaylists(
      likedSongsLimit,
      playlistLimit,
      similarityThreshold
    );

    // Group matches by playlist
    const byPlaylist = new Map<string, SongMatch[]>();
    for (const match of matches) {
      const existing = byPlaylist.get(match.playlistId) || [];
      existing.push(match);
      byPlaylist.set(match.playlistId, existing);
    }

    const added: { playlistId: string; playlistName: string; tracks: string[] }[] = [];

    if (!dryRun) {
      for (const [playlistId, playlistMatches] of byPlaylist) {
        const trackUris = playlistMatches.map((m) => m.trackUri);
        const trackNames = playlistMatches.map((m) => `${m.trackName} - ${m.artistName}`);

        try {
          await this.spotifyClient.addTracksToPlaylist(playlistId, trackUris);
          added.push({
            playlistId,
            playlistName: playlistMatches[0].playlistName,
            tracks: trackNames,
          });
        } catch (error) {
          for (const match of playlistMatches) {
            unmatched.push({
              trackName: match.trackName,
              artistName: match.artistName,
              reason: error instanceof Error ? error.message : "Failed to add to playlist",
            });
          }
        }
      }
    } else {
      // For dry run, just show what would be added
      for (const [playlistId, playlistMatches] of byPlaylist) {
        added.push({
          playlistId,
          playlistName: playlistMatches[0].playlistName,
          tracks: playlistMatches.map((m) => `${m.trackName} - ${m.artistName}`),
        });
      }
    }

    return { matches, added, unmatched, dryRun };
  }
}
