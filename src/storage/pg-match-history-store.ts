import { getPool } from "./database.js";

export interface MatchRecord {
  trackId: string;
  trackName: string;
  artistNames: string;
  playlistId: string;
  playlistName: string;
  matchedAt: number;
}

export interface UserMatchHistory {
  matches: MatchRecord[];
  lastMatchRun: number;
}

export class PgMatchHistoryStore {
  async getHistory(userId: string): Promise<UserMatchHistory> {
    const pool = getPool();

    // Get all matches for user
    const matchesResult = await pool.query(
      `SELECT track_id, track_name, artist_names, playlist_id, playlist_name, matched_at
       FROM match_history WHERE user_id = $1 ORDER BY matched_at DESC`,
      [userId]
    );

    // Get last match run time
    const runResult = await pool.query(
      `SELECT last_match_run FROM user_match_runs WHERE user_id = $1`,
      [userId]
    );

    const matches: MatchRecord[] = matchesResult.rows.map((row) => ({
      trackId: row.track_id,
      trackName: row.track_name || "",
      artistNames: row.artist_names || "",
      playlistId: row.playlist_id,
      playlistName: row.playlist_name || "",
      matchedAt: Number(row.matched_at),
    }));

    const lastMatchRun = runResult.rows.length > 0 ? Number(runResult.rows[0].last_match_run) : 0;

    return { matches, lastMatchRun };
  }

  async addMatches(userId: string, matches: MatchRecord[]): Promise<void> {
    const pool = getPool();

    // Insert matches (ignore duplicates)
    for (const match of matches) {
      await pool.query(
        `INSERT INTO match_history (user_id, track_id, track_name, artist_names, playlist_id, playlist_name, matched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, track_id) DO UPDATE SET
           track_name = EXCLUDED.track_name,
           artist_names = EXCLUDED.artist_names,
           playlist_id = EXCLUDED.playlist_id,
           playlist_name = EXCLUDED.playlist_name,
           matched_at = EXCLUDED.matched_at`,
        [
          userId,
          match.trackId,
          match.trackName,
          match.artistNames,
          match.playlistId,
          match.playlistName,
          match.matchedAt,
        ]
      );
    }

    // Update last match run time
    await pool.query(
      `INSERT INTO user_match_runs (user_id, last_match_run, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         last_match_run = EXCLUDED.last_match_run,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, Date.now()]
    );
  }

  async removeMatch(userId: string, trackId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `DELETE FROM match_history WHERE user_id = $1 AND track_id = $2`,
      [userId, trackId]
    );
  }

  async getMatchedTrackIds(userId: string): Promise<Set<string>> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT track_id FROM match_history WHERE user_id = $1`,
      [userId]
    );
    return new Set(result.rows.map((row) => row.track_id));
  }

  async clearHistory(userId: string): Promise<void> {
    const pool = getPool();
    await pool.query(`DELETE FROM match_history WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM user_match_runs WHERE user_id = $1`, [userId]);
  }

  async updateLastMatchRun(userId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO user_match_runs (user_id, last_match_run, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         last_match_run = EXCLUDED.last_match_run,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, Date.now()]
    );
  }
}
