import { useState } from "react";
import type { SpotifyTrack, SpotifyPlaylist, MatchResult } from "../api";
import "./TrackDetailPanel.css";

interface TrackDetailPanelProps {
  track: SpotifyTrack;
  match: MatchResult | null;
  playlists: SpotifyPlaylist[];
  onClose: () => void;
  onMove: (trackId: string, fromPlaylistId: string | null, toPlaylistId: string) => Promise<void>;
}

export function TrackDetailPanel({
  track,
  match,
  playlists,
  onClose,
  onMove,
}: TrackDetailPanelProps) {
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleMove = async () => {
    if (!selectedPlaylist) return;

    setLoading(true);
    try {
      await onMove(track.id, match?.playlistId || null, selectedPlaylist);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error("Failed to move track:", error);
    } finally {
      setLoading(false);
    }
  };

  const openInSpotify = () => {
    window.open(track.uri, "_blank");
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="track-detail-overlay" onClick={onClose}>
      <div className="track-detail-panel" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>

        <div className="panel-content">
          {/* Track Info */}
          <div className="track-detail-header">
            <img
              src={track.album.images[0]?.url}
              alt={track.album.name}
              className="track-detail-image"
            />
            <div className="track-detail-info">
              <h3 className="track-detail-name">{track.name}</h3>
              <p className="track-detail-artist">
                {track.artists.map((a) => a.name).join(", ")}
              </p>
              <p className="track-detail-album">{track.album.name}</p>
              <p className="track-detail-duration">{formatDuration(track.duration_ms)}</p>
            </div>
          </div>

          {/* Play Button */}
          <button className="play-in-spotify" onClick={openInSpotify}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="play-icon">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play in Spotify
          </button>

          {/* Current Match */}
          {match && (
            <div className="current-match-section">
              <div className="section-label">Currently matched to</div>
              <div className="current-match-info">
                <span className="match-playlist-name">{match.playlistName}</span>
                <span className="match-score-badge">
                  {Math.round(match.score * 100)}% match
                </span>
              </div>
            </div>
          )}

          {/* Move to Different Playlist */}
          <div className="move-section">
            <div className="section-label">
              {match ? "Move to different playlist" : "Add to playlist"}
            </div>
            <select
              value={selectedPlaylist}
              onChange={(e) => setSelectedPlaylist(e.target.value)}
              className="playlist-select"
              disabled={loading || success}
            >
              <option value="">Select playlist...</option>
              {playlists
                .filter((p) => p.id !== match?.playlistId)
                .map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name}
                  </option>
                ))}
            </select>

            <button
              className={`move-btn ${success ? "success" : ""}`}
              onClick={handleMove}
              disabled={!selectedPlaylist || loading || success}
            >
              {success ? (
                <>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="check-icon">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                  Moved!
                </>
              ) : loading ? (
                "Moving..."
              ) : (
                match ? "Move Track" : "Add Track"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
