import pg from "pg";

const { Pool } = pg;

// Database connection pool
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required for PostgreSQL storage");
    }

    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on("error", (err) => {
      console.error("[Database] Unexpected error on idle client:", err);
    });
  }

  return pool;
}

// Initialize database schema
export async function initializeDatabase(): Promise<void> {
  const pool = getPool();

  // Create tables if they don't exist
  await pool.query(`
    -- User tokens table (OAuth tokens)
    CREATE TABLE IF NOT EXISTS user_tokens (
      user_id VARCHAR(255) PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- User settings table
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id VARCHAR(255) PRIMARY KEY,
      songs_to_match INTEGER NOT NULL DEFAULT 20,
      interval_days INTEGER NOT NULL DEFAULT 1,
      schedule_hours INTEGER NOT NULL DEFAULT 9,
      schedule_minutes INTEGER NOT NULL DEFAULT 0,
      last_updated BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Match history table
    CREATE TABLE IF NOT EXISTS match_history (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      track_id VARCHAR(255) NOT NULL,
      track_name VARCHAR(500),
      artist_names VARCHAR(500),
      track_image_url VARCHAR(500),
      playlist_id VARCHAR(255) NOT NULL,
      playlist_name VARCHAR(500),
      matched_at BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, track_id)
    );

    -- Create index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_match_history_user_id ON match_history(user_id);

    -- Add track_image_url column if it doesn't exist (migration)
    DO $$ BEGIN
      ALTER TABLE match_history ADD COLUMN IF NOT EXISTS track_image_url VARCHAR(500);
    EXCEPTION
      WHEN duplicate_column THEN NULL;
    END $$;

    -- Scheduled jobs table
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      user_id VARCHAR(255) PRIMARY KEY,
      next_run_at BIGINT NOT NULL,
      interval_days INTEGER NOT NULL DEFAULT 1,
      schedule_hours INTEGER NOT NULL DEFAULT 9,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Last match run tracking (separate from individual matches)
    CREATE TABLE IF NOT EXISTS user_match_runs (
      user_id VARCHAR(255) PRIMARY KEY,
      last_match_run BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- User sessions table (for secure per-user authentication)
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL
    );

    -- Drop foreign key constraint if it exists (migration from previous schema)
    DO $$ BEGIN
      ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END $$;

    -- Index for session cleanup
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);

    -- Temporary OAuth state storage (for PKCE flow)
    CREATE TABLE IF NOT EXISTS oauth_states (
      state VARCHAR(64) PRIMARY KEY,
      code_verifier VARCHAR(128) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("[Database] Schema initialized successfully");
}

// Close database connection
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("[Database] Connection pool closed");
  }
}

// Check if database is available
export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
