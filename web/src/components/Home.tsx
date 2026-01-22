import { useState, useEffect } from "react";
import { Stepper, HourStepper } from "./Stepper";
import { getSettings, saveSettings as saveSettingsApi } from "../api";
import type { SpotifyUser, UserSettings } from "../api";
import "./Home.css";

interface HomeProps {
  user: SpotifyUser | null;
  onViewDashboard?: () => void;
  onLogout?: () => void;
  onLogin?: () => void;
}

const DEFAULT_SETTINGS: UserSettings = {
  songsToMatch: 20,
  intervalDays: 7,
  scheduleHours: 9,
  scheduleMinutes: 0,
  lastUpdated: 0,
};

function formatHourAmPm(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

export function Home({ user, onViewDashboard, onLogout, onLogin }: HomeProps) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!user);

  useEffect(() => {
    if (user) {
      loadSettingsFromServer();
    }
  }, [user]);

  async function loadSettingsFromServer() {
    try {
      setLoading(true);
      const serverSettings = await getSettings();
      setSettings(serverSettings);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!user) {
      onLogin?.();
      return;
    }

    try {
      setSaving(true);
      await saveSettingsApi(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-logo">
          <svg viewBox="0 0 24 24" fill="currentColor" className="logo-icon">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
        </div>

        {user ? (
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
        ) : (
          <div className="home-nav">
            <button className="nav-btn" onClick={onLogin}>
              Login
            </button>
          </div>
        )}
      </header>

      <main className="home-main">
        <div className="settings-card">
          <h1 className="settings-title">Sortify</h1>
          <p className="settings-subtitle">Automatically sort your Spotify liked songs into playlists.</p>

          {loading ? (
            <div className="settings-loading">
              <div className="loader" />
            </div>
          ) : (
            <>
              <p className="settings-rhythm">Set your rhythm. We'll handle the rest.</p>

              <div className="settings-rows">
                <div className="settings-row">
                  <span className="row-text">Match my last</span>
                  <Stepper
                    value={settings.songsToMatch}
                    min={1}
                    max={100}
                    onChange={(v) => updateSetting("songsToMatch", v)}
                  />
                  <span className="row-text">{settings.songsToMatch === 1 ? "liked song" : "liked songs"}</span>
                </div>

                <div className="settings-row">
                  <span className="row-text">every</span>
                  <Stepper
                    value={settings.intervalDays}
                    min={1}
                    max={100}
                    onChange={(v) => updateSetting("intervalDays", v)}
                  />
                  <span className="row-text">{settings.intervalDays === 1 ? "day" : "days"}</span>
                </div>

                <div className="settings-row">
                  <span className="row-text">at</span>
                  <HourStepper
                    value={settings.scheduleHours}
                    onChange={(v) => updateSetting("scheduleHours", v)}
                  />
                  <span className="row-text">o'clock</span>
                </div>
              </div>

              <button
                className={`save-btn ${saved ? "saved" : ""}`}
                onClick={handleSave}
                disabled={saving}
              >
                {user ? (
                  saved ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="check-icon">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                      </svg>
                      Saved
                    </>
                  ) : saving ? (
                    "Saving..."
                  ) : (
                    "Save Settings"
                  )
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="spotify-btn-icon">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                    Continue with Spotify
                  </>
                )}
              </button>

              <p className="settings-summary">
                Your {settings.songsToMatch} most recent liked {settings.songsToMatch === 1 ? "song" : "songs"} will be matched to your playlists
                every {settings.intervalDays} {settings.intervalDays === 1 ? "day" : "days"} at {formatHourAmPm(settings.scheduleHours)}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
