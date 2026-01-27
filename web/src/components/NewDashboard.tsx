import { useEffect, useState } from "react";
import { getMatchHistory, getPlaylists, getSchedule, moveTrack, syncNow, getSettings } from "../api";
import type { MatchRecord, MatchHistory, SpotifyPlaylist, SpotifyUser, ScheduledJob, UserSettings } from "../api";
import "./NewDashboard.css";

interface DashboardProps {
  user: SpotifyUser;
  onBack: () => void;
  onLogout: () => void;
  onAbout?: () => void;
}

type ViewMode = "by-track" | "by-playlist";

interface PlaylistGroup {
  playlistId: string;
  playlistName: string;
  tracks: MatchRecord[];
}

interface SyncGroup {
  date: string;
  timestamp: number;
  matches: MatchRecord[];
}

export function NewDashboard({ user, onBack, onLogout, onAbout }: DashboardProps) {
  const [history, setHistory] = useState<MatchHistory | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [schedule, setSchedule] = useState<ScheduledJob | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("by-track");

  // Modal state
  const [modalTrack, setModalTrack] = useState<MatchRecord | null>(null);
  const [selectedPlaylists, setSelectedPlaylists] = useState<Set<string>>(new Set());
  const [modalLoading, setModalLoading] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ matchesAdded: number; unmatched: number; alreadyMatched: number } | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "warning" } | null>(null);

  // Countdown state
  const [countdown, setCountdown] = useState<string>("");

  // Expanded playlists state
  const [expandedPlaylists, setExpandedPlaylists] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  // Auto-hide toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Update countdown every second
  useEffect(() => {
    if (!schedule) {
      setCountdown("");
      return;
    }

    function updateCountdown() {
      if (!schedule) return;

      const now = Date.now();
      const diff = schedule.nextRunAt - now;

      if (diff <= 0) {
        setCountdown("Any moment now");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setCountdown(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${minutes}m ${seconds}s`);
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [schedule]);

  async function loadData() {
    setLoading(true);
    try {
      const [historyData, playlistsData, scheduleData, settingsData] = await Promise.all([
        getMatchHistory(),
        getPlaylists(50),
        getSchedule(),
        getSettings(),
      ]);
      setHistory(historyData);
      setPlaylists(playlistsData);
      setSchedule("enabled" in scheduleData && scheduleData.enabled ? scheduleData : null);
      setSettings(settingsData);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setToast(null);
    try {
      const result = await syncNow();
      setSyncResult({ matchesAdded: result.matchesAdded, unmatched: result.unmatched, alreadyMatched: result.alreadyMatched });
      await loadData(); // Reload to show new matches

      // Show toast based on result
      if (result.matchesAdded > 0) {
        setToast({
          message: `Matched ${result.matchesAdded} ${result.matchesAdded === 1 ? "song" : "songs"} to your playlists`,
          type: "success",
        });
      } else if (result.alreadyMatched > 0) {
        const songsToMatch = settings?.songsToMatch || 10;
        setToast({
          message: `All ${songsToMatch} recent liked songs have already been matched`,
          type: "info",
        });
      } else if (result.unmatched > 0) {
        setToast({
          message: `No matches found. ${result.unmatched} songs didn't match any playlist`,
          type: "warning",
        });
      } else {
        setToast({
          message: "No new songs found to match",
          type: "info",
        });
      }
    } catch (err) {
      console.error("Sync failed:", err);
      setToast({
        message: "Sync failed. Please try again.",
        type: "warning",
      });
    } finally {
      setSyncing(false);
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

  function formatSyncGroupDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } else if (diffDays === 1) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } else {
      return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
  }

  function groupBySyncDate(): SyncGroup[] {
    if (!history) return [];

    // Group matches by their matchedAt timestamp (within 5 minutes = same sync)
    const groups: SyncGroup[] = [];
    let currentGroup: SyncGroup | null = null;

    // Sort by matchedAt descending (newest first)
    const sortedMatches = [...history.matches].sort((a, b) => b.matchedAt - a.matchedAt);

    for (const match of sortedMatches) {
      // If no current group or match is more than 5 minutes from current group
      if (!currentGroup || Math.abs(match.matchedAt - currentGroup.timestamp) > 5 * 60 * 1000) {
        currentGroup = {
          date: formatSyncGroupDate(match.matchedAt),
          timestamp: match.matchedAt,
          matches: [match],
        };
        groups.push(currentGroup);
      } else {
        currentGroup.matches.push(match);
      }
    }

    return groups;
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

  function togglePlaylistExpanded(playlistId: string) {
    setExpandedPlaylists((prev) => {
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

  function openTrackInSpotify(trackId: string) {
    window.open(`spotify:track:${trackId}`, "_blank");
  }

  function openPlaylistInSpotify(playlistId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    window.open(`spotify:playlist:${playlistId}`, "_blank");
  }

  const playlistGroups = groupByPlaylist();
  const syncGroups = groupBySyncDate();

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
          {onAbout && (
            <button className="about-link" onClick={onAbout}>
              About
            </button>
          )}
          <span className="user-name">{user.display_name}</span>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Toast notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      )}

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
                    {schedule ? countdown || "Calculating..." : "Not scheduled"}
                  </span>
                </div>
                <button
                  className={`sync-now-btn ${syncing ? "syncing" : ""}`}
                  onClick={handleSyncNow}
                  disabled={syncing}
                  title="Sync now"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
                  </svg>
                </button>
              </div>
              <div className="sync-stats">
                <span className="stat-value">{history?.matches.length || 0}</span>
                <span className="stat-label">tracks matched</span>
              </div>
            </div>

            {/* Sync Status Message */}
            {syncing && (
              <div className="sync-status-message">
                Analyzing your liked songs and finding the best playlists...
              </div>
            )}

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
                  {syncResult && syncResult.matchesAdded === 0 ? (
                    <span className="empty-hint">
                      {syncResult.unmatched > 0
                        ? "Your liked songs didn't match any of your playlists. Try creating playlists with similar genres or artists."
                        : "No liked songs found. Like some songs on Spotify first!"}
                    </span>
                  ) : (
                    <span className="empty-hint">
                      Click the sync button above to match your liked songs to playlists.
                    </span>
                  )}
                </div>
              ) : viewMode === "by-track" ? (
                <div className="tracks-list">
                  {syncGroups.map((group, groupIndex) => (
                    <div key={group.timestamp} className="sync-group">
                      <div className="sync-group-header">
                        <span className="sync-group-date">{group.date}</span>
                        <span className="sync-group-count">
                          {group.matches.length} {group.matches.length === 1 ? "track" : "tracks"}
                        </span>
                      </div>
                      <div className="sync-group-tracks">
                        {group.matches.map((match, index) => (
                          <div key={match.trackId} className="track-row">
                            <div className="track-index-container">
                              <span className="track-index">{index + 1}</span>
                              <button
                                className="track-play-btn"
                                onClick={() => openTrackInSpotify(match.trackId)}
                                aria-label={`Play ${match.trackName}`}
                              >
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </button>
                            </div>

                            <div className="track-image">
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                              </svg>
                            </div>

                            <div className="track-info">
                              <button
                                className="track-name-link"
                                onClick={() => openTrackInSpotify(match.trackId)}
                              >
                                {match.trackName || match.trackId}
                              </button>
                              {match.artistNames && (
                                <span className="track-artist">{match.artistNames}</span>
                              )}
                            </div>

                            <div className="match-arrow-container">
                              <svg className="match-arrow" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                              </svg>
                            </div>

                            <div
                              className="playlist-chip"
                              onClick={() => openPlaylistInSpotify(match.playlistId)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") openPlaylistInSpotify(match.playlistId);
                              }}
                            >
                              <div className="playlist-chip-image">
                                {getPlaylistImage(match.playlistId) ? (
                                  <img src={getPlaylistImage(match.playlistId)!} alt="" />
                                ) : (
                                  <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                                  </svg>
                                )}
                              </div>
                              <span className="playlist-chip-name">{match.playlistName}</span>
                            </div>

                            <button
                              className="match-checkbox"
                              onClick={() => handleUnmatchClick(match)}
                              aria-label="Unmatch track"
                              title="Move to different playlist"
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      {groupIndex < syncGroups.length - 1 && <div className="sync-group-divider" />}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="playlist-groups">
                  {playlistGroups.map((group) => (
                    <div
                      key={group.playlistId}
                      className={`playlist-group ${expandedPlaylists.has(group.playlistId) ? "expanded" : ""}`}
                    >
                      <div
                        className="playlist-group-header"
                        onClick={() => togglePlaylistExpanded(group.playlistId)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") togglePlaylistExpanded(group.playlistId);
                        }}
                      >
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
                            {group.tracks.length} {group.tracks.length === 1 ? "track" : "tracks"} matched
                          </span>
                        </div>
                        <button
                          className="playlist-open-btn"
                          onClick={(e) => openPlaylistInSpotify(group.playlistId, e)}
                          title="Open in Spotify"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                          </svg>
                        </button>
                        <div className="playlist-expand-icon">
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" />
                          </svg>
                        </div>
                      </div>
                      <div className="playlist-group-tracks">
                        {group.tracks.map((track, index) => (
                          <div key={track.trackId} className="playlist-track-row">
                            <div className="track-index-container small">
                              <span className="track-index">{index + 1}</span>
                              <button
                                className="track-play-btn"
                                onClick={() => openTrackInSpotify(track.trackId)}
                                aria-label={`Play ${track.trackName}`}
                              >
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </button>
                            </div>
                            <div className="track-image small">
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                              </svg>
                            </div>
                            <div className="playlist-track-info">
                              <button
                                className="track-name-link"
                                onClick={() => openTrackInSpotify(track.trackId)}
                              >
                                {track.trackName || track.trackId}
                              </button>
                              {track.artistNames && (
                                <span className="playlist-track-artist">{track.artistNames}</span>
                              )}
                            </div>
                            <span className="playlist-track-date">{formatDate(track.matchedAt)}</span>
                            <button
                              className="match-checkbox small"
                              onClick={() => handleUnmatchClick(track)}
                              aria-label="Unmatch track"
                              title="Move to different playlist"
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                              </svg>
                            </button>
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
        <span>© 2026 Sortify</span>
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
