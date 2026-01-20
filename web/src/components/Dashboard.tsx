import { useState } from "react";
import type { SpotifyUser } from "../api";
import { LikedSongs } from "./LikedSongs";
import { Playlists } from "./Playlists";
import { Matcher } from "./Matcher";
import "./Dashboard.css";

type Tab = "songs" | "playlists" | "match";

interface DashboardProps {
  user: SpotifyUser;
  onLogout: () => void;
  onError: (error: string) => void;
}

export function Dashboard({ user, onLogout, onError }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>("match");

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="header-title">Playlist Matcher</h1>
        </div>
        <nav className="header-nav">
          <button
            className={`nav-tab ${activeTab === "match" ? "active" : ""}`}
            onClick={() => setActiveTab("match")}
          >
            <span className="tab-icon">✨</span>
            Match & Organize
          </button>
          <button
            className={`nav-tab ${activeTab === "songs" ? "active" : ""}`}
            onClick={() => setActiveTab("songs")}
          >
            <span className="tab-icon">❤️</span>
            Liked Songs
          </button>
          <button
            className={`nav-tab ${activeTab === "playlists" ? "active" : ""}`}
            onClick={() => setActiveTab("playlists")}
          >
            <span className="tab-icon">📁</span>
            Playlists
          </button>
        </nav>
        <div className="header-right">
          <span className="user-name">{user.display_name}</span>
          <button onClick={onLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {activeTab === "songs" && <LikedSongs onError={onError} />}
        {activeTab === "playlists" && <Playlists onError={onError} />}
        {activeTab === "match" && <Matcher onError={onError} />}
      </main>
    </div>
  );
}
