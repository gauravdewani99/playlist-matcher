import fs from "fs/promises";
import path from "path";
import os from "os";

export interface ScheduledJob {
  userId: string;
  nextRunAt: number;
  intervalDays: number;
  scheduleHours: number;
  enabled: boolean;
}

export class SchedulerStore {
  private schedulerPath: string;

  constructor(appName: string = "playlist-matcher") {
    const configDir = path.join(os.homedir(), ".config", appName);
    this.schedulerPath = path.join(configDir, "scheduler.json");
  }

  async getJob(userId: string): Promise<ScheduledJob | null> {
    const allJobs = await this.getAllJobs();
    return allJobs[userId] || null;
  }

  async scheduleJob(
    userId: string,
    intervalDays: number,
    scheduleHours: number
  ): Promise<ScheduledJob> {
    const allJobs = await this.getAllJobs();

    // Calculate next run time
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(scheduleHours, 0, 0, 0);

    // If the scheduled time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const job: ScheduledJob = {
      userId,
      nextRunAt: nextRun.getTime(),
      intervalDays,
      scheduleHours,
      enabled: true,
    };

    allJobs[userId] = job;
    await this.saveAllJobs(allJobs);

    return job;
  }

  async updateNextRun(userId: string): Promise<ScheduledJob | null> {
    const allJobs = await this.getAllJobs();
    const job = allJobs[userId];

    if (!job) return null;

    // Calculate next run based on interval
    const nextRun = new Date(job.nextRunAt);
    nextRun.setDate(nextRun.getDate() + job.intervalDays);

    job.nextRunAt = nextRun.getTime();
    allJobs[userId] = job;
    await this.saveAllJobs(allJobs);

    return job;
  }

  async disableJob(userId: string): Promise<void> {
    const allJobs = await this.getAllJobs();
    if (allJobs[userId]) {
      allJobs[userId].enabled = false;
      await this.saveAllJobs(allJobs);
    }
  }

  async enableJob(userId: string): Promise<void> {
    const allJobs = await this.getAllJobs();
    if (allJobs[userId]) {
      allJobs[userId].enabled = true;
      await this.saveAllJobs(allJobs);
    }
  }

  async getJobsDueNow(): Promise<ScheduledJob[]> {
    const allJobs = await this.getAllJobs();
    const now = Date.now();

    return Object.values(allJobs).filter(
      (job) => job.enabled && job.nextRunAt <= now
    );
  }

  async deleteJob(userId: string): Promise<void> {
    const allJobs = await this.getAllJobs();
    delete allJobs[userId];
    await this.saveAllJobs(allJobs);
  }

  private async getAllJobs(): Promise<Record<string, ScheduledJob>> {
    try {
      const data = await fs.readFile(this.schedulerPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  private async saveAllJobs(jobs: Record<string, ScheduledJob>): Promise<void> {
    const dir = path.dirname(this.schedulerPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.schedulerPath, JSON.stringify(jobs, null, 2), "utf-8");
  }
}
