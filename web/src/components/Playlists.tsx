import { useEffect, useState } from "react";
import { getPlaylists, getPlaylistTracks } from "../api";
import type { SpotifyPlaylist, SpotifyTrack } from "../api";
import "./Playlists.css";

interface PlaylistsProps {
  onError: (error: string) => void;
}

export function Playlists({ onError }: PlaylistsProps) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  useEffect(() => {
    loadPlaylists();
  }, []);

  async function loadPlaylists() {
    try {
      setLoading(true);
      console.log("Fetching playlists...");
      const data = await getPlaylists(50);
      console.log("Playlists received:", data);
      setPlaylists(data);
    } catch (err) {
      console.error("Playlists error:", err);
      onError(err instanceof Error ? err.message : "Failed to load playlists");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPlaylist(playlist: SpotifyPlaylist) {
    if (selectedPlaylist?.id === playlist.id) {
      setSelectedPlaylist(null);
      setPlaylistTracks([]);
      return;
    }

    setSelectedPlaylist(playlist);
    setLoadingTracks(true);
    try {
      const tracks = await getPlaylistTracks(playlist.id, 50);
      setPlaylistTracks(tracks);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load playlist tracks");
    } finally {
      setLoadingTracks(false);
    }
  }

  return (
    <div className="playlists">
      <div className="section-header">
        <div>
          <h2 className="section-title">Your Playlists</h2>
          <p className="section-subtitle">Click a playlist to view its tracks</p>
        </div>
        <button onClick={loadPlaylists} className="refresh-button" disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="playlists-layout">
        <div className="playlists-grid">
          {loading && playlists.length === 0 ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading playlists...</p>
            </div>
          ) : playlists.length === 0 ? (
            <div className="empty-state">
              <p>No playlists found. Create some playlists on Spotify!</p>
            </div>
          ) : (
            playlists.map((playlist) => (
              <div
                key={playlist.id}
                className={`playlist-card ${selectedPlaylist?.id === playlist.id ? "selected" : ""}`}
                onClick={() => handleSelectPlaylist(playlist)}
              >
                <div className="playlist-image">
                  {playlist.images && playlist.images[0] ? (
                    <img src={playlist.images[0].url} alt={playlist.name} />
                  ) : (
                    <div className="playlist-placeholder">
                      <span>🎵</span>
                    </div>
                  )}
                </div>
                <div className="playlist-info">
                  <div className="playlist-name">{playlist.name}</div>
                  <div className="playlist-meta">
                    {playlist.tracks.total} tracks
                    {!playlist.public && <span className="private-badge">Private</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedPlaylist && (
          <div className="playlist-detail">
            <div className="detail-header">
              <h3>{selectedPlaylist.name}</h3>
              <span className="track-count">{selectedPlaylist.tracks.total} tracks</span>
            </div>
            {loadingTracks ? (
              <div className="loading-state small">
                <div className="spinner" />
              </div>
            ) : (
              <div className="tracks-list">
                {playlistTracks.map((track, index) => (
                  <div key={`${track.id}-${index}`} className="track-item">
                    <span className="track-number">{index + 1}</span>
                    <div className="track-info">
                      <div className="track-name">{track.name}</div>
                      <div className="track-artist">
                        {track.artists.map((a) => a.name).join(", ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
