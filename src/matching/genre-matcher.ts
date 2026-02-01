import { SpotifyClient, SpotifyTrack, SpotifyArtist } from "../spotify/client.js";

// ============ TYPES ============

export interface TrackWithGenres {
  id: string;
  uri: string;
  name: string;
  artistIds: string[];
  artistNames: string[];
  genres: string[];
  popularity: number;
  imageUrl?: string;
}

export interface PlaylistProfile {
  playlistId: string;
  playlistName: string;
  trackCount: number;
  sampledCount: number;
  artistIds: Set<string>;
  artistNames: Set<string>;
  genres: Map<string, number>; // genre -> count (frequency)
  avgPopularity: number;
}

export interface MatchResult {
  trackId: string;
  trackUri: string;
  trackName: string;
  artistNames: string;
  trackImageUrl?: string;
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

// ============ SIMILARITY FUNCTIONS ============

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Check if any artist from the track is in the playlist
 */
export function artistOverlapScore(trackArtistIds: string[], playlistArtistIds: Set<string>): number {
  if (trackArtistIds.length === 0 || playlistArtistIds.size === 0) return 0;

  const matchingArtists = trackArtistIds.filter(id => playlistArtistIds.has(id));

  // If any artist matches, that's a strong signal
  // Return 1.0 for direct match, scaled by how many artists match
  if (matchingArtists.length > 0) {
    return Math.min(1.0, matchingArtists.length / trackArtistIds.length + 0.5);
  }

  return 0;
}

/**
 * Genre overlap using Jaccard similarity
 */
export function genreOverlapScore(trackGenres: string[], playlistGenres: Set<string>): number {
  if (trackGenres.length === 0 || playlistGenres.size === 0) return 0;

  const trackGenreSet = new Set(trackGenres);
  return jaccardSimilarity(trackGenreSet, playlistGenres);
}

/**
 * Weighted genre score - genres that appear more frequently in playlist get higher weight
 */
export function weightedGenreScore(trackGenres: string[], playlistGenreFreq: Map<string, number>): number {
  if (trackGenres.length === 0 || playlistGenreFreq.size === 0) return 0;

  // Find max frequency for normalization
  const maxFreq = Math.max(...playlistGenreFreq.values());
  if (maxFreq === 0) return 0;

  let totalScore = 0;
  let matchCount = 0;

  for (const genre of trackGenres) {
    const freq = playlistGenreFreq.get(genre);
    if (freq !== undefined) {
      // Normalize frequency to 0-1 and add to score
      totalScore += freq / maxFreq;
      matchCount++;
    }
  }

  if (matchCount === 0) return 0;

  // Average weighted score, bonus for multiple matches
  return (totalScore / trackGenres.length) * (1 + Math.log10(matchCount + 1) / 2);
}

/**
 * Popularity similarity - tracks with similar popularity to playlist average score higher
 */
export function popularitySimilarity(trackPopularity: number, playlistAvgPopularity: number): number {
  // Both are 0-100 scale
  const diff = Math.abs(trackPopularity - playlistAvgPopularity);

  // Convert to similarity (0-1), with 20 points difference = 50% similarity
  return Math.max(0, 1 - (diff / 40));
}

// ============ MAIN MATCHING FORMULA ============

/**
 * Calculate match score between a track and a playlist profile
 *
 * Formula:
 *   score = (artistOverlap * 0.35) +
 *           (genreOverlap * 0.25) +
 *           (weightedGenreScore * 0.25) +
 *           (popularitySimilarity * 0.15)
 *
 * Weights rationale:
 * - Artist overlap (35%): Direct artist match is the strongest signal
 * - Genre overlap (25%): Jaccard similarity of genre sets
 * - Weighted genre (25%): Accounts for genre frequency in playlist
 * - Popularity (15%): Minor factor, helps with vibe matching
 */
export function calculateMatchScore(
  track: TrackWithGenres,
  playlist: PlaylistProfile
): { score: number; breakdown: MatchResult["breakdown"] } {
  const artistScore = artistOverlapScore(track.artistIds, playlist.artistIds);
  const genreScore = genreOverlapScore(track.genres, new Set(playlist.genres.keys()));
  const weightedGenre = weightedGenreScore(track.genres, playlist.genres);
  const popSimilarity = popularitySimilarity(track.popularity, playlist.avgPopularity);

  // Weighted combination
  const score =
    (artistScore * 0.35) +
    (genreScore * 0.25) +
    (weightedGenre * 0.25) +
    (popSimilarity * 0.15);

  return {
    score: Math.round(score * 100) / 100, // Round to 2 decimal places
    breakdown: {
      artistOverlap: Math.round(artistScore * 100) / 100,
      genreOverlap: Math.round(genreScore * 100) / 100,
      weightedGenreScore: Math.round(weightedGenre * 100) / 100,
      popularitySimilarity: Math.round(popSimilarity * 100) / 100,
    },
  };
}

// ============ PLAYLIST PROFILE CACHE ============

interface CachedProfile {
  profile: PlaylistProfile;
  cachedAt: number;
}

// Simple in-memory cache with 1-hour TTL
const profileCache = new Map<string, CachedProfile>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCachedProfile(playlistId: string): PlaylistProfile | null {
  const cached = profileCache.get(playlistId);
  if (!cached) return null;

  if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
    profileCache.delete(playlistId);
    return null;
  }

  return cached.profile;
}

function setCachedProfile(playlistId: string, profile: PlaylistProfile): void {
  profileCache.set(playlistId, { profile, cachedAt: Date.now() });
}

// ============ GENRE MATCHER CLASS ============

export class GenreMatcher {
  constructor(private spotifyClient: SpotifyClient) {}

  /**
   * Enrich tracks with genre information from their artists
   */
  async enrichTracksWithGenres(tracks: SpotifyTrack[]): Promise<TrackWithGenres[]> {
    // Collect unique artist IDs
    const artistIds = [...new Set(tracks.flatMap(t => t.artists.map(a => a.id)))];

    // Fetch artist details
    const artists = await this.spotifyClient.getArtists(artistIds);
    const artistMap = new Map<string, SpotifyArtist>(artists.map(a => [a.id, a]));

    return tracks.map(track => {
      const trackArtists = track.artists.map(a => artistMap.get(a.id));
      const allGenres = [...new Set(trackArtists.flatMap(a => a?.genres || []))];

      return {
        id: track.id,
        uri: track.uri,
        name: track.name,
        artistIds: track.artists.map(a => a.id),
        artistNames: track.artists.map(a => a.name),
        genres: allGenres,
        popularity: track.popularity || 0,
        imageUrl: track.album?.images?.[0]?.url,
      };
    });
  }

  /**
   * Build a profile for a playlist based on its tracks.
   * Results are cached for 1 hour to reduce Spotify API calls.
   */
  async buildPlaylistProfile(playlistId: string, sampleSize: number = 50): Promise<PlaylistProfile> {
    // Check cache first
    const cached = getCachedProfile(playlistId);
    if (cached) {
      return cached;
    }

    const playlist = await this.spotifyClient.getPlaylist(playlistId);
    const tracks = await this.spotifyClient.getPlaylistTracks(playlistId, sampleSize);

    if (tracks.length === 0) {
      throw new Error(`Playlist "${playlist.name}" has no tracks`);
    }

    // Enrich with genres
    const enrichedTracks = await this.enrichTracksWithGenres(tracks);

    // Build profile
    const artistIds = new Set<string>();
    const artistNames = new Set<string>();
    const genreFreq = new Map<string, number>();
    let totalPopularity = 0;

    for (const track of enrichedTracks) {
      // Add artists
      track.artistIds.forEach(id => artistIds.add(id));
      track.artistNames.forEach(name => artistNames.add(name));

      // Count genre frequencies
      for (const genre of track.genres) {
        genreFreq.set(genre, (genreFreq.get(genre) || 0) + 1);
      }

      totalPopularity += track.popularity;
    }

    const profile: PlaylistProfile = {
      playlistId,
      playlistName: playlist.name,
      trackCount: playlist.tracks.total,
      sampledCount: enrichedTracks.length,
      artistIds,
      artistNames,
      genres: genreFreq,
      avgPopularity: totalPopularity / enrichedTracks.length,
    };

    // Cache the profile
    setCachedProfile(playlistId, profile);

    return profile;
  }

  /**
   * Match liked songs to playlists using genre-based algorithm
   */
  async matchSongsToPlaylists(
    likedSongsLimit: number = 20,
    playlistLimit: number = 10,
    similarityThreshold: number = 0.15
  ): Promise<{ matches: MatchResult[]; unmatched: { trackName: string; artistNames: string; reason: string }[] }> {
    // Get current user ID to filter owned playlists
    const currentUser = await this.spotifyClient.getCurrentUser();
    const currentUserId = currentUser.id;

    // Get liked songs and enrich with genres
    const likedSongs = await this.spotifyClient.getLikedSongs(likedSongsLimit);
    const enrichedSongs = await this.enrichTracksWithGenres(likedSongs);

    // Get playlists and filter to only those owned by current user
    const allPlaylists = await this.spotifyClient.getUserPlaylists(playlistLimit);
    const ownedPlaylists = allPlaylists.filter(p => p.owner.id === currentUserId);

    const playlistProfiles: PlaylistProfile[] = [];

    for (const playlist of ownedPlaylists) {
      if (playlist.tracks.total === 0) continue;

      try {
        const profile = await this.buildPlaylistProfile(playlist.id, 50);
        playlistProfiles.push(profile);
      } catch (error) {
        console.error(`Skipping playlist "${playlist.name}":`, error);
      }
    }

    if (playlistProfiles.length === 0) {
      return {
        matches: [],
        unmatched: enrichedSongs.map(s => ({
          trackName: s.name,
          artistNames: s.artistNames.join(", "),
          reason: "No playlists available for matching",
        })),
      };
    }

    // Match each song to best playlist
    const matches: MatchResult[] = [];
    const unmatched: { trackName: string; artistNames: string; reason: string }[] = [];

    for (const song of enrichedSongs) {
      let bestMatch: { profile: PlaylistProfile; score: number; breakdown: MatchResult["breakdown"] } | null = null;

      for (const profile of playlistProfiles) {
        const { score, breakdown } = calculateMatchScore(song, profile);

        if (score >= similarityThreshold) {
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { profile, score, breakdown };
          }
        }
      }

      if (bestMatch) {
        matches.push({
          trackId: song.id,
          trackUri: song.uri,
          trackName: song.name,
          artistNames: song.artistNames.join(", "),
          trackImageUrl: song.imageUrl,
          trackGenres: song.genres,
          playlistId: bestMatch.profile.playlistId,
          playlistName: bestMatch.profile.playlistName,
          score: bestMatch.score,
          breakdown: bestMatch.breakdown,
        });
      } else {
        unmatched.push({
          trackName: song.name,
          artistNames: song.artistNames.join(", "),
          reason: song.genres.length === 0
            ? "No genre data available for this track's artists"
            : `Best score (${Math.max(...playlistProfiles.map(p => calculateMatchScore(song, p).score)).toFixed(2)}) below threshold (${similarityThreshold})`,
        });
      }
    }

    // Sort by score
    matches.sort((a, b) => b.score - a.score);

    return { matches, unmatched };
  }

  /**
   * Auto-organize: match and optionally add songs to playlists
   */
  async autoOrganize(
    likedSongsLimit: number = 20,
    playlistLimit: number = 10,
    similarityThreshold: number = 0.2,
    dryRun: boolean = true
  ): Promise<{
    matches: MatchResult[];
    added: { playlistId: string; playlistName: string; tracks: string[] }[];
    unmatched: { trackName: string; artistNames: string; reason: string }[];
    dryRun: boolean;
  }> {
    const { matches, unmatched } = await this.matchSongsToPlaylists(
      likedSongsLimit,
      playlistLimit,
      similarityThreshold
    );

    // Group by playlist
    const byPlaylist = new Map<string, MatchResult[]>();
    for (const match of matches) {
      const existing = byPlaylist.get(match.playlistId) || [];
      existing.push(match);
      byPlaylist.set(match.playlistId, existing);
    }

    const added: { playlistId: string; playlistName: string; tracks: string[] }[] = [];

    if (!dryRun) {
      for (const [playlistId, playlistMatches] of byPlaylist) {
        const trackUris = playlistMatches.map(m => m.trackUri);
        const trackNames = playlistMatches.map(m => `${m.trackName} - ${m.artistNames}`);

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
              artistNames: match.artistNames,
              reason: error instanceof Error ? error.message : "Failed to add to playlist",
            });
          }
        }
      }
    } else {
      // Dry run - show what would be added
      for (const [playlistId, playlistMatches] of byPlaylist) {
        added.push({
          playlistId,
          playlistName: playlistMatches[0].playlistName,
          tracks: playlistMatches.map(m => `${m.trackName} - ${m.artistNames}`),
        });
      }
    }

    return { matches, added, unmatched, dryRun };
  }
}
