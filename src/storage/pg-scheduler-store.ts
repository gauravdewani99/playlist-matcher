import { getPool } from "./database.js";

export interface ScheduledJob {
  userId: string;
  nextRunAt: number;
  intervalDays: number;
  scheduleHours: number;
  enabled: boolean;
}

export class PgSchedulerStore {
  async scheduleJob(userId: string, intervalDays: number, scheduleHours: number): Promise<ScheduledJob> {
    const pool = getPool();

    // Calculate next run time
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(scheduleHours, 0, 0, 0);

    // If the scheduled time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const nextRunAt = nextRun.getTime();

    const job: ScheduledJob = {
      userId,
      nextRunAt,
      intervalDays,
      scheduleHours,
      enabled: true,
    };

    await pool.query(
      `INSERT INTO scheduled_jobs (user_id, next_run_at, interval_days, schedule_hours, enabled, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         next_run_at = EXCLUDED.next_run_at,
         interval_days = EXCLUDED.interval_days,
         schedule_hours = EXCLUDED.schedule_hours,
         enabled = EXCLUDED.enabled,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, nextRunAt, intervalDays, scheduleHours, true]
    );

    return job;
  }

  async getJob(userId: string): Promise<ScheduledJob | null> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT user_id, next_run_at, interval_days, schedule_hours, enabled
       FROM scheduled_jobs WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      userId: row.user_id,
      nextRunAt: Number(row.next_run_at),
      intervalDays: row.interval_days,
      scheduleHours: row.schedule_hours,
      enabled: row.enabled,
    };
  }

  async getJobsDueNow(): Promise<ScheduledJob[]> {
    const pool = getPool();
    const now = Date.now();

    const result = await pool.query(
      `SELECT user_id, next_run_at, interval_days, schedule_hours, enabled
       FROM scheduled_jobs WHERE enabled = true AND next_run_at <= $1`,
      [now]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      nextRunAt: Number(row.next_run_at),
      intervalDays: row.interval_days,
      scheduleHours: row.schedule_hours,
      enabled: row.enabled,
    }));
  }

  async updateNextRun(userId: string): Promise<void> {
    const pool = getPool();

    // Get current job to calculate next run
    const job = await this.getJob(userId);
    if (!job) return;

    // Calculate next run time based on interval
    const nextRunAt = Date.now() + job.intervalDays * 24 * 60 * 60 * 1000;

    await pool.query(
      `UPDATE scheduled_jobs SET next_run_at = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
      [nextRunAt, userId]
    );
  }

  async disableJob(userId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE scheduled_jobs SET enabled = false, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
      [userId]
    );
  }

  async enableJob(userId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE scheduled_jobs SET enabled = true, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
      [userId]
    );
  }

  async deleteJob(userId: string): Promise<void> {
    const pool = getPool();
    await pool.query(`DELETE FROM scheduled_jobs WHERE user_id = $1`, [userId]);
  }
}
