import { useEffect, useState } from "react";
import { getLikedSongs, getPlaylists, getSettings } from "../api";
import type { SpotifyTrack, SpotifyPlaylist, SpotifyUser } from "../api";
import { MatchHistory } from "./MatchHistory";
import "./NewDashboard.css";

interface DashboardProps {
  user: SpotifyUser;
  onBack: () => void;
  onLogout: () => void;
}

export function NewDashboard({ user, onBack, onLogout }: DashboardProps) {
  const [songs, setSongs] = useState<SpotifyTrack[]>([]);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [songsLimit, setSongsLimit] = useState(20);
  const [playlistsLimit] = useState(50);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    // Get songs limit from settings
    let limit = 20;
    try {
      const settings = await getSettings();
      limit = Math.min(50, settings.songsToMatch || 20);
      setSongsLimit(limit);
    } catch {
      // Use default
    }

    // Load songs
    setLoadingSongs(true);
    try {
      const data = await getLikedSongs(limit);
      setSongs(data);
    } catch (err) {
      console.error("Failed to load songs:", err);
    } finally {
      setLoadingSongs(false);
    }

    // Load playlists
    setLoadingPlaylists(true);
    try {
      const data = await getPlaylists(50);
      setPlaylists(data);
    } catch (err) {
      console.error("Failed to load playlists:", err);
    } finally {
      setLoadingPlaylists(false);
    }
  }

  function formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function openTrackInSpotify(track: SpotifyTrack) {
    window.open(track.uri, "_blank");
  }

  function openPlaylistInSpotify(playlist: SpotifyPlaylist) {
    window.open(`spotify:playlist:${playlist.id}`, "_blank");
  }

  return (
    <div className="dashboard-new">
      <header className="dashboard-header">
        <button className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
          <span className="back-text">Settings</span>
        </button>

        <h1 className="dashboard-title">Dashboard</h1>

        <div className="dashboard-user">
          <span className="user-name">{user.display_name}</span>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Matches Panel */}
        <section className="panel matches-panel">
          <div className="panel-header">
            <h2 className="panel-title">Matches</h2>
            <span className="panel-hint">Uncheck to remove from playlist</span>
          </div>
          {loadingSongs || loadingPlaylists ? (
            <div className="panel-loading">
              <div className="loader" />
            </div>
          ) : (
            <MatchHistory
              songsLimit={songsLimit}
              playlistsLimit={playlistsLimit}
              playlists={playlists}
              onRefresh={loadData}
            />
          )}
        </section>

        {/* Songs Panel */}
        <section className="panel songs-panel">
          <div className="panel-header">
            <h2 className="panel-title">Liked Songs</h2>
            <span className="panel-count">{songs.length} songs</span>
          </div>

          {loadingSongs ? (
            <div className="panel-loading">
              <div className="loader" />
            </div>
          ) : (
            <div className="tracks-list">
              {songs.map((track, index) => (
                <div key={track.id} className="track-row">
                  <div className="track-index-container">
                    <span className="track-index">{index + 1}</span>
                    <button
                      className="track-play-btn"
                      onClick={() => openTrackInSpotify(track)}
                      aria-label={`Play ${track.name}`}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <div className="track-image">
                    {track.album.images[0] ? (
                      <img
                        src={
                          track.album.images[track.album.images.length - 1]?.url ||
                          track.album.images[0].url
                        }
                        alt={track.album.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="track-placeholder">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="track-info">
                    <span className="track-name">{track.name}</span>
                    <span className="track-artist">
                      {track.artists.map((a) => a.name).join(", ")}
                    </span>
                  </div>
                  <span className="track-duration">{formatDuration(track.duration_ms)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Playlists Panel */}
        <section className="panel playlists-panel">
          <div className="panel-header">
            <h2 className="panel-title">Playlists</h2>
            <span className="panel-count">{playlists.length} playlists</span>
          </div>

          {loadingPlaylists ? (
            <div className="panel-loading">
              <div className="loader" />
            </div>
          ) : (
            <div className="playlists-grid">
              {playlists.map((playlist) => (
                <div
                  key={playlist.id}
                  className="playlist-card"
                  onClick={() => openPlaylistInSpotify(playlist)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openPlaylistInSpotify(playlist);
                  }}
                >
                  <div className="playlist-image">
                    {playlist.images && playlist.images[0] ? (
                      <img
                        src={playlist.images[0].url}
                        alt={playlist.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="playlist-placeholder">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                        </svg>
                      </div>
                    )}
                    <div className="playlist-play">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                  <div className="playlist-info">
                    <span className="playlist-name">{playlist.name}</span>
                    <span className="playlist-meta">{playlist.tracks.total} songs</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
