import { useEffect, useState } from "react";
import { getMatchHistory, getPlaylists, getSchedule, moveTrack } from "../api";
import type { MatchRecord, MatchHistory, SpotifyPlaylist, SpotifyUser, ScheduledJob } from "../api";
import "./NewDashboard.css";

interface DashboardProps {
  user: SpotifyUser;
  onBack: () => void;
  onLogout: () => void;
}

type ViewMode = "by-track" | "by-playlist";

interface PlaylistGroup {
  playlistId: string;
  playlistName: string;
  tracks: MatchRecord[];
}

export function NewDashboard({ user, onBack, onLogout }: DashboardProps) {
  const [history, setHistory] = useState<MatchHistory | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [schedule, setSchedule] = useState<ScheduledJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("by-track");
  const [removing, setRemoving] = useState<string | null>(null);

  // Modal state
  const [modalTrack, setModalTrack] = useState<MatchRecord | null>(null);
  const [selectedPlaylists, setSelectedPlaylists] = useState<Set<string>>(new Set());
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [historyData, playlistsData, scheduleData] = await Promise.all([
        getMatchHistory(),
        getPlaylists(50),
        getSchedule(),
      ]);
      setHistory(historyData);
      setPlaylists(playlistsData);
      setSchedule("enabled" in scheduleData && scheduleData.enabled ? scheduleData : null);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }

  function getPlaylistImage(playlistId: string): string | null {
    const playlist = playlists.find((p) => p.id === playlistId);
    return playlist?.images?.[0]?.url || null;
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  }

  function formatNextSync(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs <= 0) return "Any moment now";

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours === 0) {
      return `${diffMins}m`;
    } else if (diffHours < 24) {
      return `${diffHours}h ${diffMins}m`;
    } else {
      const days = Math.floor(diffHours / 24);
      const hours = diffHours % 24;
      return `${days}d ${hours}h`;
    }
  }

  function handleUnmatchClick(match: MatchRecord) {
    setModalTrack(match);
    setSelectedPlaylists(new Set());
  }

  function closeModal() {
    setModalTrack(null);
    setSelectedPlaylists(new Set());
    setModalLoading(false);
  }

  function togglePlaylistSelection(playlistId: string) {
    setSelectedPlaylists((prev) => {
      const next = new Set(prev);
      if (next.has(playlistId)) {
        next.delete(playlistId);
      } else {
        next.add(playlistId);
      }
      return next;
    });
  }

  async function handleConfirmUnmatch() {
    if (!modalTrack) return;

    setModalLoading(true);
    try {
      // Remove from current playlist
      await moveTrack(modalTrack.trackId, modalTrack.playlistId, null);

      // Add to selected playlists
      for (const playlistId of selectedPlaylists) {
        await moveTrack(modalTrack.trackId, null, playlistId);
      }

      // Remove from local state
      setHistory((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          matches: prev.matches.filter((m) => m.trackId !== modalTrack.trackId),
        };
      });

      closeModal();
    } catch (error) {
      console.error("Failed to move track:", error);
    } finally {
      setModalLoading(false);
    }
  }

  function groupByPlaylist(): PlaylistGroup[] {
    if (!history) return [];

    const groups = new Map<string, PlaylistGroup>();

    for (const match of history.matches) {
      if (!groups.has(match.playlistId)) {
        groups.set(match.playlistId, {
          playlistId: match.playlistId,
          playlistName: match.playlistName,
          tracks: [],
        });
      }
      groups.get(match.playlistId)!.tracks.push(match);
    }

    return Array.from(groups.values()).sort((a, b) => b.tracks.length - a.tracks.length);
  }

  const playlistGroups = groupByPlaylist();

  return (
    <div className="dashboard-new">
      <header className="dashboard-header">
        <button className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
          <span className="back-text">Settings</span>
        </button>

        <h1 className="dashboard-title">Sortify</h1>

        <div className="dashboard-user">
          <span className="user-name">{user.display_name}</span>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {loading ? (
          <div className="dashboard-loading">
            <div className="loader" />
          </div>
        ) : (
          <>
            {/* Sync Status Bar */}
            <div className="sync-status-bar">
              <div className="sync-info">
                <div className="sync-item">
                  <span className="sync-label">Last sync</span>
                  <span className="sync-value">
                    {history?.lastMatchRun ? formatDate(history.lastMatchRun) : "Never"}
                  </span>
                </div>
                <div className="sync-divider" />
                <div className="sync-item">
                  <span className="sync-label">Next sync</span>
                  <span className="sync-value sync-countdown">
                    {schedule ? formatNextSync(schedule.nextRunAt) : "Not scheduled"}
                  </span>
                </div>
              </div>
              <div className="sync-stats">
                <span className="stat-value">{history?.matches.length || 0}</span>
                <span className="stat-label">tracks matched</span>
              </div>
            </div>

            {/* View Toggle */}
            <div className="view-toggle-container">
              <div className="view-toggle">
                <button
                  className={`view-toggle-btn ${viewMode === "by-track" ? "active" : ""}`}
                  onClick={() => setViewMode("by-track")}
                >
                  By Track
                </button>
                <button
                  className={`view-toggle-btn ${viewMode === "by-playlist" ? "active" : ""}`}
                  onClick={() => setViewMode("by-playlist")}
                >
                  By Playlist
                </button>
              </div>
            </div>

            {/* Matches Section */}
            <section className="matches-section">
              {history?.matches.length === 0 ? (
                <div className="empty-state">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="empty-icon">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                  <p>No matches yet</p>
                  <span className="empty-hint">
                    Your liked songs will be automatically matched to playlists at the next sync
                  </span>
                </div>
              ) : viewMode === "by-track" ? (
                <div className="matches-list">
                  {history?.matches.map((match) => (
                    <div
                      key={match.trackId}
                      className={`match-row ${removing === match.trackId ? "removing" : ""}`}
                    >
                      <button
                        className="match-checkbox"
                        onClick={() => handleUnmatchClick(match)}
                        disabled={removing === match.trackId}
                        aria-label="Unmatch track"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                      </button>

                      <div className="match-track-info">
                        <span className="match-track-name">{match.trackName || match.trackId}</span>
                        {match.artistNames && (
                          <span className="match-track-artist">{match.artistNames}</span>
                        )}
                      </div>

                      <svg className="match-arrow" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                      </svg>

                      <div className="match-playlist-info">
                        <div className="match-playlist-image">
                          {getPlaylistImage(match.playlistId) ? (
                            <img src={getPlaylistImage(match.playlistId)!} alt="" />
                          ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                            </svg>
                          )}
                        </div>
                        <span className="match-playlist-name">{match.playlistName}</span>
                      </div>

                      <span className="match-date">{formatDate(match.matchedAt)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="playlist-groups">
                  {playlistGroups.map((group) => (
                    <div key={group.playlistId} className="playlist-group">
                      <div className="playlist-group-header">
                        <div className="playlist-group-image">
                          {getPlaylistImage(group.playlistId) ? (
                            <img src={getPlaylistImage(group.playlistId)!} alt="" />
                          ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                            </svg>
                          )}
                        </div>
                        <div className="playlist-group-info">
                          <span className="playlist-group-name">{group.playlistName}</span>
                          <span className="playlist-group-count">
                            {group.tracks.length} {group.tracks.length === 1 ? "track" : "tracks"}
                          </span>
                        </div>
                      </div>
                      <div className="playlist-group-tracks">
                        {group.tracks.map((track) => (
                          <div key={track.trackId} className="playlist-track-row">
                            <button
                              className="match-checkbox small"
                              onClick={() => handleUnmatchClick(track)}
                              aria-label="Unmatch track"
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                              </svg>
                            </button>
                            <span className="playlist-track-name">{track.trackName || track.trackId}</span>
                            <span className="playlist-track-date">{formatDate(track.matchedAt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="dashboard-footer">
        <span>© 2025 Sortify. All rights reserved.</span>
      </footer>

      {/* Unmatch Modal */}
      {modalTrack && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Move Track</h3>
              <button className="modal-close" onClick={closeModal}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-description">
                Remove from <strong>{modalTrack.playlistName}</strong> and optionally add to other playlists:
              </p>

              <div className="modal-playlist-list">
                {playlists
                  .filter((p) => p.id !== modalTrack.playlistId)
                  .map((playlist) => (
                    <label key={playlist.id} className="modal-playlist-option">
                      <input
                        type="checkbox"
                        checked={selectedPlaylists.has(playlist.id)}
                        onChange={() => togglePlaylistSelection(playlist.id)}
                      />
                      <div className="modal-playlist-image">
                        {playlist.images?.[0]?.url ? (
                          <img src={playlist.images[0].url} alt="" />
                        ) : (
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                          </svg>
                        )}
                      </div>
                      <span className="modal-playlist-name">{playlist.name}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-btn secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="modal-btn primary"
                onClick={handleConfirmUnmatch}
                disabled={modalLoading}
              >
                {modalLoading ? "Moving..." : selectedPlaylists.size > 0 ? "Move Track" : "Remove Only"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
