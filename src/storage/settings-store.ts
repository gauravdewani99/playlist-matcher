import fs from "fs/promises";
import path from "path";
import os from "os";

export interface UserSettings {
  songsToMatch: number;
  intervalDays: number;
  scheduleHours: number;
  scheduleMinutes: number; // 0 or 30 only
  lastUpdated: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  songsToMatch: 20,
  intervalDays: 7,
  scheduleHours: 9,
  scheduleMinutes: 0,
  lastUpdated: Date.now(),
};

export class SettingsStore {
  private settingsPath: string;

  constructor(appName: string = "playlist-matcher") {
    const configDir = path.join(os.homedir(), ".config", appName);
    this.settingsPath = path.join(configDir, "settings.json");
  }

  async saveSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    const allSettings = await this.getAllSettings();

    const userSettings: UserSettings = {
      ...DEFAULT_SETTINGS,
      ...allSettings[userId],
      ...settings,
      lastUpdated: Date.now(),
    };

    // Validate and clamp values
    userSettings.songsToMatch = Math.max(1, Math.min(100, userSettings.songsToMatch));
    userSettings.intervalDays = Math.max(1, Math.min(100, userSettings.intervalDays));
    userSettings.scheduleHours = Math.max(0, Math.min(23, userSettings.scheduleHours));

    // Minutes must be 0 or 30
    if (userSettings.scheduleMinutes !== 0 && userSettings.scheduleMinutes !== 30) {
      userSettings.scheduleMinutes = userSettings.scheduleMinutes < 15 ? 0 : 30;
    }

    allSettings[userId] = userSettings;

    const dir = path.dirname(this.settingsPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(allSettings, null, 2), "utf-8");

    return userSettings;
  }

  async getSettings(userId: string): Promise<UserSettings> {
    const allSettings = await this.getAllSettings();
    return { ...DEFAULT_SETTINGS, ...allSettings[userId] };
  }

  async deleteSettings(userId: string): Promise<void> {
    const allSettings = await this.getAllSettings();
    delete allSettings[userId];

    const dir = path.dirname(this.settingsPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(allSettings, null, 2), "utf-8");
  }

  private async getAllSettings(): Promise<Record<string, UserSettings>> {
    try {
      const data = await fs.readFile(this.settingsPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
}
