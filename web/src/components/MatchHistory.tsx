import { useState, useEffect } from "react";
import { matchSongs, removeTrackFromPlaylist } from "../api";
import type { MatchResult, SpotifyPlaylist } from "../api";
import "./MatchHistory.css";

interface MatchHistoryProps {
  songsLimit: number;
  playlistsLimit: number;
  playlists: SpotifyPlaylist[];
  onRefresh: () => void;
}

export function MatchHistory({ songsLimit, playlistsLimit, playlists, onRefresh }: MatchHistoryProps) {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadMatches();
  }, [songsLimit, playlistsLimit]);

  async function loadMatches() {
    try {
      setLoading(true);
      const result = await matchSongs(songsLimit, playlistsLimit, 0.1);
      setMatches(result.matches);
    } catch (error) {
      console.error("Failed to load matches:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleMatch(match: MatchResult) {
    try {
      setRemoving(match.trackId);
      // Remove track from the playlist
      await removeTrackFromPlaylist(match.trackId, match.playlistId);
      // Remove from local state
      setMatches(prev => prev.filter(m => m.trackId !== match.trackId));
      onRefresh();
    } catch (error) {
      console.error("Failed to remove track:", error);
    } finally {
      setRemoving(null);
    }
  }

  function getPlaylistImage(playlistId: string): string | null {
    const playlist = playlists.find(p => p.id === playlistId);
    return playlist?.images?.[0]?.url || null;
  }

  if (loading) {
    return (
      <div className="match-history match-history-loading">
        <div className="loader" />
        <span>Loading matches...</span>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="match-history match-history-empty">
        <svg viewBox="0 0 24 24" fill="currentColor" className="empty-icon">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
        <p>No matches found</p>
        <span className="empty-hint">Your liked songs will be matched to playlists based on genre and artist overlap</span>
      </div>
    );
  }

  return (
    <div className="match-history">
      <div className="match-list">
        {matches.map((match) => (
          <div
            key={match.trackId}
            className={`match-item ${removing === match.trackId ? "removing" : ""}`}
          >
            <button
              className="match-checkbox"
              onClick={() => handleToggleMatch(match)}
              disabled={removing === match.trackId}
              aria-label={`Remove ${match.trackName} from ${match.playlistName}`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            </button>

            <div className="match-track">
              <span className="match-track-name">{match.trackName}</span>
              <span className="match-track-artist">{match.artistNames}</span>
            </div>

            <div className="match-arrow">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
              </svg>
            </div>

            <div className="match-playlist">
              <div className="match-playlist-image">
                {getPlaylistImage(match.playlistId) ? (
                  <img src={getPlaylistImage(match.playlistId)!} alt={match.playlistName} />
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                  </svg>
                )}
              </div>
              <span className="match-playlist-name">{match.playlistName}</span>
            </div>

            <div className="match-score">
              <span className="score-value">{Math.round(match.score * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
