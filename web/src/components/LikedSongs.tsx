import { useEffect, useState } from "react";
import { getLikedSongsWithGenres } from "../api";
import type { TrackWithGenres } from "../api";
import "./LikedSongs.css";

interface LikedSongsProps {
  onError: (error: string) => void;
}

export function LikedSongs({ onError }: LikedSongsProps) {
  const [songs, setSongs] = useState<TrackWithGenres[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    loadSongs();
  }, [limit]);

  async function loadSongs() {
    try {
      setLoading(true);
      const data = await getLikedSongsWithGenres(limit);
      setSongs(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load songs");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="liked-songs">
      <div className="section-header">
        <div>
          <h2 className="section-title">Liked Songs</h2>
          <p className="section-subtitle">Your recently liked songs with genre information</p>
        </div>
        <div className="section-controls">
          <label className="control-label">
            Show:
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="control-select"
            >
              <option value={10}>10 songs</option>
              <option value={20}>20 songs</option>
              <option value={30}>30 songs</option>
              <option value={50}>50 songs</option>
            </select>
          </label>
          <button onClick={loadSongs} className="refresh-button" disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {loading && songs.length === 0 ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading your liked songs...</p>
        </div>
      ) : songs.length === 0 ? (
        <div className="empty-state">
          <p>No liked songs found. Start liking some songs on Spotify!</p>
        </div>
      ) : (
        <div className="songs-list">
          {songs.map((song, index) => (
            <div key={song.id} className="song-card">
              <div className="song-number">{index + 1}</div>
              <div className="song-info">
                <div className="song-name">{song.name}</div>
                <div className="song-artist">{song.artistNames.join(", ")}</div>
              </div>
              <div className="song-genres">
                {song.genres.length > 0 ? (
                  song.genres.slice(0, 4).map((genre) => (
                    <span key={genre} className="genre-tag">
                      {genre}
                    </span>
                  ))
                ) : (
                  <span className="no-genres">No genre data</span>
                )}
                {song.genres.length > 4 && (
                  <span className="genre-more">+{song.genres.length - 4}</span>
                )}
              </div>
              <div className="song-popularity" title={`Popularity: ${song.popularity}/100`}>
                <div className="popularity-bar">
                  <div
                    className="popularity-fill"
                    style={{ width: `${song.popularity}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
