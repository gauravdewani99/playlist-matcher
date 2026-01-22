import { getPool } from "./database.js";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class PgTokenStore {
  private userId: string | null = null;

  // Set the current user context (called after we know who the user is)
  setUserId(userId: string): void {
    this.userId = userId;
  }

  getUserId(): string | null {
    return this.userId;
  }

  async saveTokens(tokens: StoredTokens, userId?: string): Promise<void> {
    const pool = getPool();
    const uid = userId || this.userId;

    if (!uid) {
      // If we don't have a user ID yet, store temporarily
      // This happens during initial OAuth when we don't know the user yet
      this.tempTokens = tokens;
      return;
    }

    await pool.query(
      `INSERT INTO user_tokens (user_id, access_token, refresh_token, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
      [uid, tokens.accessToken, tokens.refreshToken, tokens.expiresAt]
    );

    // Clear temp tokens if we had them
    this.tempTokens = null;
  }

  // Temporary storage for tokens before we know user ID
  private tempTokens: StoredTokens | null = null;

  async getTokens(userId?: string): Promise<StoredTokens | null> {
    const uid = userId || this.userId;

    // Return temp tokens if we have them and no user context yet
    if (!uid && this.tempTokens) {
      return this.tempTokens;
    }

    if (!uid) {
      return null;
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT access_token, refresh_token, expires_at FROM user_tokens WHERE user_id = $1`,
      [uid]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: Number(row.expires_at),
    };
  }

  async clearTokens(userId?: string): Promise<void> {
    const uid = userId || this.userId;
    this.tempTokens = null;

    if (!uid) {
      return;
    }

    const pool = getPool();
    await pool.query(`DELETE FROM user_tokens WHERE user_id = $1`, [uid]);
  }

  // Get all users with tokens (for cron runner)
  async getAllUserIds(): Promise<string[]> {
    const pool = getPool();
    const result = await pool.query(`SELECT user_id FROM user_tokens`);
    return result.rows.map((row) => row.user_id);
  }

  // Commit temp tokens to database once we know the user ID
  async commitTempTokens(userId: string): Promise<void> {
    if (this.tempTokens) {
      await this.saveTokens(this.tempTokens, userId);
      this.userId = userId;
      this.tempTokens = null;
    }
  }
}
