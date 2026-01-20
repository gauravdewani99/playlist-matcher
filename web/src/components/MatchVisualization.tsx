import { useEffect, useState, useCallback } from "react";
import { matchSongs } from "../api";
import type { MatchResult, SpotifyTrack, SpotifyPlaylist } from "../api";
import "./MatchVisualization.css";

interface MatchVisualizationProps {
  songs: SpotifyTrack[];
  playlists: SpotifyPlaylist[];
  onSongClick: (track: SpotifyTrack, match: MatchResult | null) => void;
  onPlaylistClick: (playlist: SpotifyPlaylist) => void;
}

interface SongNode {
  track: SpotifyTrack;
  match: MatchResult | null;
  angle: number;
}

interface PlaylistNode {
  playlist: SpotifyPlaylist;
  matchedSongs: MatchResult[];
  angle: number;
}

export function MatchVisualization({
  songs,
  playlists,
  onSongClick,
  onPlaylistClick,
}: MatchVisualizationProps) {
  const [songNodes, setSongNodes] = useState<SongNode[]>([]);
  const [playlistNodes, setPlaylistNodes] = useState<PlaylistNode[]>([]);
  const [hoveredSong, setHoveredSong] = useState<string | null>(null);
  const [hoveredPlaylist, setHoveredPlaylist] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Calculate sizes based on number of songs
  const getSizes = useCallback(() => {
    const count = songs.length;
    if (count <= 20) {
      return { songSize: 52, songRadius: 180, playlistSize: 72, playlistRadius: 320 };
    } else if (count <= 50) {
      return { songSize: 40, songRadius: 220, playlistSize: 68, playlistRadius: 380 };
    } else {
      return { songSize: 32, songRadius: 260, playlistSize: 64, playlistRadius: 420 };
    }
  }, [songs.length]);

  const sizes = getSizes();

  useEffect(() => {
    loadMatches();
  }, [songs.length, playlists.length]);

  async function loadMatches() {
    if (songs.length === 0 || playlists.length === 0) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await matchSongs(songs.length, playlists.length, 0.1);

      // Create song nodes positioned in an orbit
      const nodes: SongNode[] = songs.map((track, index) => {
        const match = result.matches.find((m) => m.trackId === track.id) || null;
        const angle = (index / songs.length) * Math.PI * 2 - Math.PI / 2;
        return { track, match, angle };
      });
      setSongNodes(nodes);

      // Get unique playlists from matches
      const matchedPlaylistIds = [...new Set(result.matches.map((m) => m.playlistId))];
      const pNodes: PlaylistNode[] = matchedPlaylistIds.map((playlistId, index) => {
        const playlist = playlists.find((p) => p.id === playlistId)!;
        const matchedSongs = result.matches.filter((m) => m.playlistId === playlistId);
        const angle = (index / matchedPlaylistIds.length) * Math.PI * 2 - Math.PI / 2;
        return { playlist, matchedSongs, angle };
      });
      setPlaylistNodes(pNodes);
    } catch (error) {
      console.error("Failed to load matches:", error);
    } finally {
      setLoading(false);
    }
  }

  const getNodePosition = (angle: number, radius: number) => {
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  };

  if (loading) {
    return (
      <div className="match-visualization match-visualization-loading">
        <div className="visualization-loader">
          <div className="loader-ring" />
          <span>Analyzing matches...</span>
        </div>
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="match-visualization match-visualization-empty">
        <p>No liked songs to visualize</p>
      </div>
    );
  }

  return (
    <div className="match-visualization">
      {/* SVG for connection lines */}
      <svg className="connections-layer" viewBox="-500 -400 1000 800">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--spotify-green)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--spotify-green)" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {songNodes.map((song) => {
          if (!song.match) return null;
          const playlistNode = playlistNodes.find(
            (p) => p.playlist.id === song.match!.playlistId
          );
          if (!playlistNode) return null;

          const songPos = getNodePosition(song.angle, sizes.songRadius);
          const playlistPos = getNodePosition(playlistNode.angle, sizes.playlistRadius);
          const isHighlighted =
            hoveredSong === song.track.id ||
            hoveredPlaylist === playlistNode.playlist.id;

          return (
            <g key={song.track.id}>
              <line
                className={`connection-line ${isHighlighted ? "highlighted" : ""}`}
                x1={songPos.x}
                y1={songPos.y}
                x2={playlistPos.x}
                y2={playlistPos.y}
              />
              {isHighlighted && (
                <circle className="connection-particle" r="4">
                  <animateMotion
                    dur="1.5s"
                    repeatCount="indefinite"
                    path={`M${songPos.x},${songPos.y} L${playlistPos.x},${playlistPos.y}`}
                  />
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {/* Song nodes */}
      <div className="songs-orbit">
        {songNodes.map((node, index) => {
          const pos = getNodePosition(node.angle, sizes.songRadius);
          const isHovered = hoveredSong === node.track.id;
          const isConnected =
            node.match && hoveredPlaylist === node.match.playlistId;

          return (
            <div
              key={node.track.id}
              className={`song-node ${node.match ? "matched" : "unmatched"} ${
                isHovered || isConnected ? "highlighted" : ""
              }`}
              style={{
                width: sizes.songSize,
                height: sizes.songSize,
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                animationDelay: `${index * 0.03}s`,
              }}
              onMouseEnter={() => setHoveredSong(node.track.id)}
              onMouseLeave={() => setHoveredSong(null)}
              onClick={() => onSongClick(node.track, node.match)}
            >
              <img
                src={
                  node.track.album.images[node.track.album.images.length - 1]?.url ||
                  node.track.album.images[0]?.url
                }
                alt={node.track.name}
                className="song-node-image"
              />
              {isHovered && (
                <div className="song-node-tooltip">
                  <div className="tooltip-title">{node.track.name}</div>
                  <div className="tooltip-artist">
                    {node.track.artists.map((a) => a.name).join(", ")}
                  </div>
                  {node.match && (
                    <div className="tooltip-match">
                      <span className="match-arrow">→</span>
                      <span className="match-playlist">{node.match.playlistName}</span>
                      <span className="match-score">
                        {Math.round(node.match.score * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Playlist nodes */}
      <div className="playlists-ring">
        {playlistNodes.map((node) => {
          const pos = getNodePosition(node.angle, sizes.playlistRadius);
          const isHovered = hoveredPlaylist === node.playlist.id;

          return (
            <div
              key={node.playlist.id}
              className={`playlist-node ${isHovered ? "highlighted" : ""}`}
              style={{
                width: sizes.playlistSize,
                transform: `translate(${pos.x}px, ${pos.y}px)`,
              }}
              onMouseEnter={() => setHoveredPlaylist(node.playlist.id)}
              onMouseLeave={() => setHoveredPlaylist(null)}
              onClick={() => onPlaylistClick(node.playlist)}
            >
              <div
                className="playlist-node-image"
                style={{ width: sizes.playlistSize, height: sizes.playlistSize }}
              >
                {node.playlist.images && node.playlist.images[0] ? (
                  <img src={node.playlist.images[0].url} alt={node.playlist.name} />
                ) : (
                  <div className="playlist-placeholder-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="playlist-node-label">
                <span className="playlist-name">{node.playlist.name}</span>
                <span className="playlist-match-count">
                  {node.matchedSongs.length} match{node.matchedSongs.length !== 1 ? "es" : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Center hub */}
      <div className="visualization-center">
        <svg viewBox="0 0 24 24" fill="currentColor" className="center-icon">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
        <span className="center-label">{songs.length} songs</span>
      </div>
    </div>
  );
}
