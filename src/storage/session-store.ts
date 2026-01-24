import crypto from "crypto";
import { getPool } from "./database.js";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface Session {
  sessionId: string;
  userId: string;
  expiresAt: Date;
}

export class SessionStore {
  // Generate a secure session ID
  generateSessionId(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  // Create a new session for a user
  async createSession(userId: string): Promise<Session> {
    const pool = getPool();
    const sessionId = this.generateSessionId();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await pool.query(
      `INSERT INTO user_sessions (session_id, user_id, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         expires_at = EXCLUDED.expires_at`,
      [sessionId, userId, expiresAt]
    );

    return { sessionId, userId, expiresAt };
  }

  // Get session by ID (returns null if expired or not found)
  async getSession(sessionId: string): Promise<Session | null> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT session_id, user_id, expires_at
       FROM user_sessions
       WHERE session_id = $1 AND expires_at > NOW()`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      expiresAt: new Date(row.expires_at),
    };
  }

  // Delete a session (logout)
  async deleteSession(sessionId: string): Promise<void> {
    const pool = getPool();
    await pool.query(`DELETE FROM user_sessions WHERE session_id = $1`, [sessionId]);
  }

  // Delete all sessions for a user
  async deleteUserSessions(userId: string): Promise<void> {
    const pool = getPool();
    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
  }

  // Cleanup expired sessions (call periodically)
  async cleanupExpiredSessions(): Promise<number> {
    const pool = getPool();
    const result = await pool.query(
      `DELETE FROM user_sessions WHERE expires_at < NOW()`
    );
    return result.rowCount || 0;
  }

  // Extend session expiration
  async extendSession(sessionId: string): Promise<void> {
    const pool = getPool();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await pool.query(
      `UPDATE user_sessions SET expires_at = $2 WHERE session_id = $1`,
      [sessionId, expiresAt]
    );
  }
}

// OAuth state store for PKCE (replaces in-memory pkceStore)
export class OAuthStateStore {
  // Store PKCE verifier with state
  async saveState(state: string, codeVerifier: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO oauth_states (state, code_verifier)
       VALUES ($1, $2)
       ON CONFLICT (state) DO UPDATE SET code_verifier = EXCLUDED.code_verifier`,
      [state, codeVerifier]
    );
  }

  // Get and delete state (one-time use)
  async consumeState(state: string): Promise<string | null> {
    const pool = getPool();

    // Get the verifier
    const result = await pool.query(
      `SELECT code_verifier FROM oauth_states WHERE state = $1`,
      [state]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Delete after retrieving (one-time use)
    await pool.query(`DELETE FROM oauth_states WHERE state = $1`, [state]);

    return result.rows[0].code_verifier;
  }

  // Cleanup old states (older than 10 minutes)
  async cleanupOldStates(): Promise<number> {
    const pool = getPool();
    const result = await pool.query(
      `DELETE FROM oauth_states WHERE created_at < NOW() - INTERVAL '10 minutes'`
    );
    return result.rowCount || 0;
  }
}
