import { useState } from "react";
import { autoOrganize } from "../api";
import type { OrganizeResponse, MatchResult } from "../api";
import "./Matcher.css";

interface MatcherProps {
  onError: (error: string) => void;
}

export function Matcher({ onError }: MatcherProps) {
  const [likedSongsLimit, setLikedSongsLimit] = useState(20);
  const [playlistLimit, setPlaylistLimit] = useState(10);
  const [threshold, setThreshold] = useState(0.2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrganizeResponse | null>(null);
  const [executing, setExecuting] = useState(false);

  async function handlePreview() {
    try {
      setLoading(true);
      setResult(null);
      const data = await autoOrganize(likedSongsLimit, playlistLimit, threshold, true);
      setResult(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to preview matches");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!result || result.matches.length === 0) return;

    try {
      setExecuting(true);
      const data = await autoOrganize(likedSongsLimit, playlistLimit, threshold, false);
      setResult(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add tracks to playlists");
    } finally {
      setExecuting(false);
    }
  }

  function getScoreColor(score: number): string {
    if (score >= 0.5) return "var(--spotify-green)";
    if (score >= 0.3) return "#f59e0b";
    return "#ef4444";
  }

  function formatScore(score: number): string {
    return `${Math.round(score * 100)}%`;
  }

  return (
    <div className="matcher">
      <div className="section-header">
        <div>
          <h2 className="section-title">Match & Organize</h2>
          <p className="section-subtitle">
            Automatically match your liked songs to playlists based on genre and artist similarity
          </p>
        </div>
      </div>

      <div className="matcher-layout">
        <div className="matcher-controls">
          <div className="control-group">
            <label className="control-label">
              <span className="label-text">Liked Songs to Analyze</span>
              <span className="label-value">{likedSongsLimit}</span>
            </label>
            <input
              type="range"
              min={5}
              max={50}
              value={likedSongsLimit}
              onChange={(e) => setLikedSongsLimit(Number(e.target.value))}
              className="control-slider"
            />
          </div>

          <div className="control-group">
            <label className="control-label">
              <span className="label-text">Playlists to Consider</span>
              <span className="label-value">{playlistLimit}</span>
            </label>
            <input
              type="range"
              min={3}
              max={20}
              value={playlistLimit}
              onChange={(e) => setPlaylistLimit(Number(e.target.value))}
              className="control-slider"
            />
          </div>

          <div className="control-group">
            <label className="control-label">
              <span className="label-text">Match Threshold</span>
              <span className="label-value">{formatScore(threshold)}</span>
            </label>
            <input
              type="range"
              min={0.1}
              max={0.5}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="control-slider"
            />
            <p className="control-hint">
              Lower = more matches, Higher = stricter matching
            </p>
          </div>

          <div className="control-actions">
            <button
              onClick={handlePreview}
              className="action-button preview"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner small" /> Analyzing...
                </>
              ) : (
                <>Preview Matches</>
              )}
            </button>
          </div>

          <div className="formula-info">
            <h4>Matching Formula</h4>
            <p>
              Score = Artist Overlap (35%) + Genre Overlap (25%) +
              Weighted Genre (25%) + Popularity Match (15%)
            </p>
          </div>
        </div>

        <div className="matcher-results">
          {!result && !loading && (
            <div className="empty-results">
              <span className="empty-icon">🎵</span>
              <h3>Ready to Match</h3>
              <p>Adjust the settings and click "Preview Matches" to see which songs match your playlists</p>
            </div>
          )}

          {loading && (
            <div className="loading-results">
              <div className="spinner" />
              <p>Analyzing your music library...</p>
              <p className="loading-subtitle">This may take a moment</p>
            </div>
          )}

          {result && !loading && (
            <div className="results-content">
              <div className="results-summary">
                <div className="summary-stat">
                  <span className="stat-value">{result.matches.length}</span>
                  <span className="stat-label">Matched</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-value">{result.unmatched.length}</span>
                  <span className="stat-label">Unmatched</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-value">{result.added.length}</span>
                  <span className="stat-label">Playlists</span>
                </div>
              </div>

              {result.dryRun && result.matches.length > 0 && (
                <button
                  onClick={handleExecute}
                  className="action-button execute"
                  disabled={executing}
                >
                  {executing ? (
                    <>
                      <span className="spinner small" /> Adding to Playlists...
                    </>
                  ) : (
                    <>Add {result.matches.length} Songs to Playlists</>
                  )}
                </button>
              )}

              {!result.dryRun && (
                <div className="success-message">
                  Successfully added {result.matches.length} songs to {result.added.length} playlists!
                </div>
              )}

              {result.added.length > 0 && (
                <div className="results-section">
                  <h3>Playlist Assignments</h3>
                  {result.added.map((assignment) => (
                    <div key={assignment.playlistId} className="assignment-card">
                      <div className="assignment-header">
                        <span className="playlist-name">{assignment.playlistName}</span>
                        <span className="track-count">{assignment.tracks.length} songs</span>
                      </div>
                      <div className="assignment-tracks">
                        {assignment.tracks.map((track, i) => (
                          <div key={i} className="assigned-track">{track}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {result.matches.length > 0 && (
                <div className="results-section">
                  <h3>Match Details</h3>
                  <div className="matches-list">
                    {result.matches.map((match) => (
                      <MatchCard key={match.trackId} match={match} getScoreColor={getScoreColor} formatScore={formatScore} />
                    ))}
                  </div>
                </div>
              )}

              {result.unmatched.length > 0 && (
                <div className="results-section">
                  <h3>Unmatched Songs</h3>
                  <div className="unmatched-list">
                    {result.unmatched.map((item, i) => (
                      <div key={i} className="unmatched-item">
                        <div className="unmatched-track">
                          {item.trackName} - {item.artistNames}
                        </div>
                        <div className="unmatched-reason">{item.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MatchCardProps {
  match: MatchResult;
  getScoreColor: (score: number) => string;
  formatScore: (score: number) => string;
}

function MatchCard({ match, getScoreColor, formatScore }: MatchCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="match-card" onClick={() => setExpanded(!expanded)}>
      <div className="match-header">
        <div className="match-info">
          <div className="match-track">{match.trackName}</div>
          <div className="match-artist">{match.artistNames}</div>
        </div>
        <div className="match-arrow">
          <span className="arrow-icon">→</span>
        </div>
        <div className="match-playlist">
          <span className="playlist-badge">{match.playlistName}</span>
        </div>
        <div
          className="match-score"
          style={{ color: getScoreColor(match.score) }}
        >
          {formatScore(match.score)}
        </div>
      </div>

      {expanded && (
        <div className="match-breakdown">
          <div className="breakdown-item">
            <span className="breakdown-label">Artist Overlap</span>
            <div className="breakdown-bar">
              <div
                className="breakdown-fill"
                style={{ width: `${match.breakdown.artistOverlap * 100}%` }}
              />
            </div>
            <span className="breakdown-value">{formatScore(match.breakdown.artistOverlap)}</span>
          </div>
          <div className="breakdown-item">
            <span className="breakdown-label">Genre Overlap</span>
            <div className="breakdown-bar">
              <div
                className="breakdown-fill"
                style={{ width: `${match.breakdown.genreOverlap * 100}%` }}
              />
            </div>
            <span className="breakdown-value">{formatScore(match.breakdown.genreOverlap)}</span>
          </div>
          <div className="breakdown-item">
            <span className="breakdown-label">Weighted Genre</span>
            <div className="breakdown-bar">
              <div
                className="breakdown-fill"
                style={{ width: `${match.breakdown.weightedGenreScore * 100}%` }}
              />
            </div>
            <span className="breakdown-value">{formatScore(match.breakdown.weightedGenreScore)}</span>
          </div>
          <div className="breakdown-item">
            <span className="breakdown-label">Popularity</span>
            <div className="breakdown-bar">
              <div
                className="breakdown-fill"
                style={{ width: `${match.breakdown.popularitySimilarity * 100}%` }}
              />
            </div>
            <span className="breakdown-value">{formatScore(match.breakdown.popularitySimilarity)}</span>
          </div>
          {match.trackGenres.length > 0 && (
            <div className="match-genres">
              {match.trackGenres.slice(0, 5).map((genre) => (
                <span key={genre} className="genre-tag">{genre}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
