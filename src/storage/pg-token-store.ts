import { getPool } from "./database.js";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Stateless PostgreSQL token store.
 * All operations require explicit userId - no in-memory state.
 * This ensures proper isolation between different users' requests.
 */
export class PgTokenStore {
  // Save tokens for a specific user (userId is REQUIRED)
  async saveTokens(tokens: StoredTokens, userId: string): Promise<void> {
    if (!userId) {
      throw new Error("userId is required to save tokens");
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO user_tokens (user_id, access_token, refresh_token, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, tokens.accessToken, tokens.refreshToken, tokens.expiresAt]
    );
  }

  // Get tokens for a specific user (userId is REQUIRED)
  async getTokens(userId: string): Promise<StoredTokens | null> {
    if (!userId) {
      throw new Error("userId is required to get tokens");
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT access_token, refresh_token, expires_at FROM user_tokens WHERE user_id = $1`,
      [userId]
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

  // Clear tokens for a specific user
  async clearTokens(userId: string): Promise<void> {
    if (!userId) {
      throw new Error("userId is required to clear tokens");
    }

    const pool = getPool();
    await pool.query(`DELETE FROM user_tokens WHERE user_id = $1`, [userId]);
  }

  // Get all users with tokens (for cron runner)
  async getAllUserIds(): Promise<string[]> {
    const pool = getPool();
    const result = await pool.query(`SELECT user_id FROM user_tokens`);
    return result.rows.map((row) => row.user_id);
  }

  // Check if a user has valid tokens
  async hasValidTokens(userId: string): Promise<boolean> {
    const tokens = await this.getTokens(userId);
    return tokens !== null && tokens.expiresAt > Date.now();
  }
}

/**
 * Temporary token storage for OAuth callback flow.
 * Stores tokens in database keyed by OAuth state, then commits to user after we know userId.
 */
export class OAuthTokenBuffer {
  // Store tokens temporarily with OAuth state as key
  async storeTemporaryTokens(state: string, tokens: StoredTokens): Promise<void> {
    const pool = getPool();

    // Store in a temporary table or use oauth_states table with tokens
    await pool.query(
      `CREATE TABLE IF NOT EXISTS oauth_temp_tokens (
        state VARCHAR(64) PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );

    await pool.query(
      `INSERT INTO oauth_temp_tokens (state, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (state) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at`,
      [state, tokens.accessToken, tokens.refreshToken, tokens.expiresAt]
    );
  }

  // Get temporary tokens by OAuth state
  async getTemporaryTokens(state: string): Promise<StoredTokens | null> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT access_token, refresh_token, expires_at
       FROM oauth_temp_tokens
       WHERE state = $1`,
      [state]
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

  // Commit temporary tokens to user's permanent storage
  async commitToUser(state: string, userId: string, tokenStore: PgTokenStore): Promise<boolean> {
    const tokens = await this.getTemporaryTokens(state);
    if (!tokens) {
      return false;
    }

    // Save to permanent storage
    await tokenStore.saveTokens(tokens, userId);

    // Delete temporary tokens
    const pool = getPool();
    await pool.query(`DELETE FROM oauth_temp_tokens WHERE state = $1`, [state]);

    return true;
  }

  // Cleanup old temporary tokens (older than 10 minutes)
  async cleanup(): Promise<number> {
    const pool = getPool();
    const result = await pool.query(
      `DELETE FROM oauth_temp_tokens WHERE created_at < NOW() - INTERVAL '10 minutes'`
    );
    return result.rowCount || 0;
  }
}
