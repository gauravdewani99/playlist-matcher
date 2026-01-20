import { useState } from "react";
import { Stepper, TimePicker } from "./Stepper";
import type { SpotifyUser } from "../api";
import "./Home.css";

interface HomeProps {
  user: SpotifyUser;
  onViewDashboard: () => void;
  onLogout: () => void;
}

interface Settings {
  songsToMatch: number;
  intervalDays: number;
  scheduleHours: number;
  scheduleMinutes: number;
}

const SETTINGS_KEY = "playlist-matcher-settings";

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return {
    songsToMatch: 20,
    intervalDays: 7,
    scheduleHours: 9,
    scheduleMinutes: 0,
  };
}

function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function Home({ user, onViewDashboard, onLogout }: HomeProps) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [saved, setSaved] = useState(false);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const formatTime = (hours: number, minutes: number) => {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-logo">
          <svg viewBox="0 0 24 24" fill="currentColor" className="logo-icon">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
        </div>

        <div className="home-nav">
          <button className="nav-btn" onClick={onViewDashboard}>
            View Dashboard
          </button>
          <div className="user-menu">
            <span className="user-name">{user.display_name}</span>
            <button className="logout-btn" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="home-main">
        <div className="settings-card">
          <h1 className="settings-title">Playlist Matcher</h1>
          <p className="settings-subtitle">Automatically organize your liked songs</p>

          <div className="settings-sentence">
            <span className="sentence-text">Match my last</span>
            <div className="sentence-control">
              <Stepper
                value={settings.songsToMatch}
                min={1}
                max={100}
                onChange={(v) => updateSetting("songsToMatch", v)}
              />
            </div>
            <span className="sentence-text">liked songs</span>
          </div>

          <div className="settings-sentence">
            <span className="sentence-text">every</span>
            <div className="sentence-control">
              <Stepper
                value={settings.intervalDays}
                min={1}
                max={100}
                onChange={(v) => updateSetting("intervalDays", v)}
                suffix={settings.intervalDays === 1 ? "day" : "days"}
              />
            </div>
          </div>

          <div className="settings-sentence">
            <span className="sentence-text">at</span>
            <div className="sentence-control">
              <TimePicker
                hours={settings.scheduleHours}
                minutes={settings.scheduleMinutes}
                onHoursChange={(v) => updateSetting("scheduleHours", v)}
                onMinutesChange={(v) => updateSetting("scheduleMinutes", v)}
              />
            </div>
          </div>

          <button
            className={`save-btn ${saved ? "saved" : ""}`}
            onClick={handleSave}
          >
            {saved ? (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" className="check-icon">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                </svg>
                Saved
              </>
            ) : (
              "Save Settings"
            )}
          </button>

          <p className="settings-summary">
            Your {settings.songsToMatch} most recent liked songs will be matched to your playlists
            every {settings.intervalDays} {settings.intervalDays === 1 ? "day" : "days"} at{" "}
            {formatTime(settings.scheduleHours, settings.scheduleMinutes)}
          </p>
        </div>
      </main>
    </div>
  );
}
