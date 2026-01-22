import { getPool } from "./database.js";

export interface UserSettings {
  songsToMatch: number;
  intervalDays: number;
  scheduleHours: number;
  scheduleMinutes: number;
  lastUpdated: number;
}

const DEFAULT_SETTINGS: UserSettings = {
  songsToMatch: 20,
  intervalDays: 1,
  scheduleHours: 9,
  scheduleMinutes: 0,
  lastUpdated: 0,
};

export class PgSettingsStore {
  async getSettings(userId: string): Promise<UserSettings> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT songs_to_match, interval_days, schedule_hours, schedule_minutes, last_updated
       FROM user_settings WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return { ...DEFAULT_SETTINGS };
    }

    const row = result.rows[0];
    return {
      songsToMatch: row.songs_to_match,
      intervalDays: row.interval_days,
      scheduleHours: row.schedule_hours,
      scheduleMinutes: row.schedule_minutes,
      lastUpdated: Number(row.last_updated),
    };
  }

  async saveSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings> {
    const pool = getPool();

    // Get current settings or defaults
    const current = await this.getSettings(userId);

    // Merge updates
    const settings: UserSettings = {
      songsToMatch: updates.songsToMatch ?? current.songsToMatch,
      intervalDays: updates.intervalDays ?? current.intervalDays,
      scheduleHours: updates.scheduleHours ?? current.scheduleHours,
      scheduleMinutes: updates.scheduleMinutes ?? current.scheduleMinutes,
      lastUpdated: Date.now(),
    };

    // Upsert settings
    await pool.query(
      `INSERT INTO user_settings (user_id, songs_to_match, interval_days, schedule_hours, schedule_minutes, last_updated, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         songs_to_match = EXCLUDED.songs_to_match,
         interval_days = EXCLUDED.interval_days,
         schedule_hours = EXCLUDED.schedule_hours,
         schedule_minutes = EXCLUDED.schedule_minutes,
         last_updated = EXCLUDED.last_updated,
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        settings.songsToMatch,
        settings.intervalDays,
        settings.scheduleHours,
        settings.scheduleMinutes,
        settings.lastUpdated,
      ]
    );

    return settings;
  }
}
