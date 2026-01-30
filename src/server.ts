import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SpotifyOAuth } from "./auth/oauth.js";
import { TokenStore } from "./auth/token-store.js";
import { SpotifyClient } from "./spotify/client.js";
import { GenreMatcher } from "./matching/genre-matcher.js";

export async function createServer(clientId: string) {
  const tokenStore = new TokenStore();
  const oauth = new SpotifyOAuth({ clientId }, tokenStore);
  const spotifyClient = new SpotifyClient(oauth);
  const genreMatcher = new GenreMatcher(spotifyClient);

  const server = new McpServer({
    name: "playlist-matcher",
    version: "1.0.0",
  });

  // ============ AUTHENTICATION TOOLS ============

  server.tool(
    "spotify_authorize",
    "Start Spotify OAuth authorization. Opens browser for login. Run this first before using other tools.",
    {},
    async () => {
      try {
        const authUrl = await oauth.startAuthFlow();
        return {
          content: [
            {
              type: "text",
              text: `Authorization successful! You are now connected to Spotify.\n\nAuthorization URL was: ${authUrl}`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Authorization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "spotify_check_auth",
    "Check if currently authenticated with Spotify.",
    {},
    async () => {
      try {
        const isAuth = await oauth.isAuthenticated();
        if (isAuth) {
          const user = await spotifyClient.getCurrentUser();
          return {
            content: [
              {
                type: "text",
                text: `Authenticated as: ${user.display_name} (${user.id})`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: "Not authenticated. Run spotify_authorize first.",
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Not authenticated: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ============ LIBRARY TOOLS ============

  server.tool(
    "spotify_get_liked_songs",
    "Get your most recently liked songs from Spotify.",
    {
      limit: z.number().min(1).max(50).default(20).describe("Number of songs to fetch (1-50)"),
    },
    async ({ limit }) => {
      try {
        const tracks = await spotifyClient.getLikedSongs(limit);
        const result = tracks.map((t) => ({
          id: t.id,
          name: t.name,
          artist: t.artists.map((a) => a.name).join(", "),
          album: t.album.name,
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to fetch liked songs: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "spotify_get_audio_features",
    "Get audio features (energy, danceability, tempo, valence, etc.) for tracks.",
    {
      trackIds: z.array(z.string()).max(100).describe("Array of Spotify track IDs"),
    },
    async ({ trackIds }) => {
      try {
        const features = await spotifyClient.getAudioFeatures(trackIds);
        const result = features.map((f, i) => ({
          trackId: trackIds[i],
          features: f
            ? {
                energy: f.energy,
                danceability: f.danceability,
                valence: f.valence,
                tempo: f.tempo,
                acousticness: f.acousticness,
                instrumentalness: f.instrumentalness,
              }
            : null,
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to fetch audio features: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ============ PLAYLIST TOOLS ============

  server.tool(
    "spotify_get_playlists",
    "Get your Spotify playlists.",
    {
      limit: z.number().min(1).max(50).default(20).describe("Number of playlists to fetch (1-50)"),
    },
    async ({ limit }) => {
      try {
        const playlists = await spotifyClient.getUserPlaylists(limit);
        const result = playlists.map((p) => ({
          id: p.id,
          name: p.name,
          trackCount: p.tracks.total,
          owner: p.owner.display_name,
          public: p.public,
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to fetch playlists: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "spotify_get_playlist_tracks",
    "Get tracks from a specific playlist.",
    {
      playlistId: z.string().describe("Spotify playlist ID"),
      limit: z.number().min(1).max(100).default(50).describe("Number of tracks to fetch (1-100)"),
    },
    async ({ playlistId, limit }) => {
      try {
        const tracks = await spotifyClient.getPlaylistTracks(playlistId, limit);
        const result = tracks.map((t) => ({
          id: t.id,
          name: t.name,
          artist: t.artists.map((a) => a.name).join(", "),
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to fetch playlist tracks: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "spotify_add_tracks_to_playlist",
    "Add tracks to a playlist.",
    {
      playlistId: z.string().describe("Spotify playlist ID"),
      trackIds: z.array(z.string()).max(100).describe("Array of Spotify track IDs to add"),
    },
    async ({ playlistId, trackIds }) => {
      try {
        const trackUris = trackIds.map((id) => `spotify:track:${id}`);
        await spotifyClient.addTracksToPlaylist(playlistId, trackUris);
        return {
          content: [
            {
              type: "text",
              text: `Successfully added ${trackIds.length} track(s) to playlist.`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to add tracks: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ============ ARTIST TOOLS ============

  server.tool(
    "spotify_get_artist_genres",
    "Get genres and details for artists by their IDs.",
    {
      artistIds: z.array(z.string()).max(50).describe("Array of Spotify artist IDs"),
    },
    async ({ artistIds }) => {
      try {
        const artists = await spotifyClient.getArtists(artistIds);
        const result = artists.map((a) => ({
          id: a.id,
          name: a.name,
          genres: a.genres,
          popularity: a.popularity,
          followers: a.followers.total,
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to fetch artist details: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "spotify_get_liked_songs_with_genres",
    "Get your liked songs with artist genre information.",
    {
      limit: z.number().min(1).max(50).default(20).describe("Number of songs to fetch (1-50)"),
    },
    async ({ limit }) => {
      try {
        const tracks = await spotifyClient.getLikedSongs(limit);

        // Collect unique artist IDs
        const artistIds = [...new Set(tracks.flatMap((t) => t.artists.map((a) => a.id)))];

        // Fetch artist details with genres
        const artists = await spotifyClient.getArtists(artistIds);
        const artistMap = new Map(artists.map((a) => [a.id, a]));

        const result = tracks.map((t) => {
          const trackArtists = t.artists.map((a) => {
            const artistDetails = artistMap.get(a.id);
            return {
              name: a.name,
              genres: artistDetails?.genres || [],
              popularity: artistDetails?.popularity || 0,
            };
          });

          // Combine all genres from all artists
          const allGenres = [...new Set(trackArtists.flatMap((a) => a.genres))];

          return {
            id: t.id,
            name: t.name,
            artists: trackArtists.map((a) => a.name).join(", "),
            album: t.album.name,
            genres: allGenres,
            artistDetails: trackArtists,
          };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to fetch liked songs with genres: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ============ GENRE MATCHING TOOLS ============

  server.tool(
    "spotify_match_songs_to_playlists",
    "Find the best matching playlist for each of your liked songs based on artist/genre overlap.",
    {
      likedSongsLimit: z.number().min(1).max(50).default(20).describe("Number of liked songs to analyze"),
      playlistLimit: z.number().min(1).max(20).default(10).describe("Number of playlists to consider"),
      similarityThreshold: z
        .number()
        .min(0)
        .max(1)
        .default(0.15)
        .describe("Minimum similarity score (0-1) for a match. Lower = more matches. Recommended: 0.15-0.3"),
    },
    async ({ likedSongsLimit, playlistLimit, similarityThreshold }) => {
      try {
        const result = await genreMatcher.matchSongsToPlaylists(likedSongsLimit, playlistLimit, similarityThreshold);

        const summary = {
          matchedSongs: result.matches.length,
          unmatchedSongs: result.unmatched.length,
          matches: result.matches.map((m) => ({
            song: `${m.trackName} - ${m.artistNames}`,
            genres: m.trackGenres,
            playlist: m.playlistName,
            score: m.score,
            breakdown: m.breakdown,
          })),
          unmatched: result.unmatched,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to match songs: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "spotify_auto_organize_liked_songs",
    "Automatically match your liked songs to playlists and optionally add them. Use dryRun=true first to preview.",
    {
      likedSongsLimit: z.number().min(1).max(50).default(20).describe("Number of liked songs to organize"),
      playlistLimit: z.number().min(1).max(20).default(10).describe("Number of playlists to consider"),
      similarityThreshold: z.number().min(0).max(1).default(0.2).describe("Minimum similarity for auto-add. Recommended: 0.15-0.3"),
      dryRun: z.boolean().default(true).describe("If true, only preview changes without adding tracks"),
    },
    async ({ likedSongsLimit, playlistLimit, similarityThreshold, dryRun }) => {
      try {
        const result = await genreMatcher.autoOrganize(likedSongsLimit, playlistLimit, similarityThreshold, dryRun);

        const summary = {
          dryRun: result.dryRun,
          status: result.dryRun ? "PREVIEW - No changes made" : "EXECUTED - Tracks added to playlists",
          formula: "score = (artistOverlap * 0.35) + (genreOverlap * 0.25) + (weightedGenreScore * 0.25) + (popularitySimilarity * 0.15)",
          summary: {
            totalMatched: result.matches.length,
            totalUnmatched: result.unmatched.length,
            playlistsAffected: result.added.length,
          },
          additions: result.added.map((a) => ({
            playlist: a.playlistName,
            tracksToAdd: a.tracks,
          })),
          matchDetails: result.matches.map((m) => ({
            song: `${m.trackName} - ${m.artistNames}`,
            playlist: m.playlistName,
            score: m.score,
            breakdown: m.breakdown,
          })),
          unmatched: result.unmatched,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to organize: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  return server;
}
