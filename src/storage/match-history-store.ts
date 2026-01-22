import fs from "fs/promises";
import path from "path";
import os from "os";

export interface MatchRecord {
  trackId: string;
  playlistId: string;
  playlistName: string;
  matchedAt: number;
}

export interface UserMatchHistory {
  matches: MatchRecord[];
  lastMatchRun: number;
}

export class MatchHistoryStore {
  private historyPath: string;

  constructor(appName: string = "playlist-matcher") {
    const configDir = path.join(os.homedir(), ".config", appName);
    this.historyPath = path.join(configDir, "match-history.json");
  }

  async getHistory(userId: string): Promise<UserMatchHistory> {
    const allHistory = await this.getAllHistory();
    return allHistory[userId] || { matches: [], lastMatchRun: 0 };
  }

  async addMatches(userId: string, matches: MatchRecord[]): Promise<void> {
    const allHistory = await this.getAllHistory();
    const userHistory = allHistory[userId] || { matches: [], lastMatchRun: 0 };

    // Add new matches (avoid duplicates by trackId)
    const existingTrackIds = new Set(userHistory.matches.map(m => m.trackId));
    for (const match of matches) {
      if (!existingTrackIds.has(match.trackId)) {
        userHistory.matches.push(match);
        existingTrackIds.add(match.trackId);
      }
    }

    userHistory.lastMatchRun = Date.now();
    allHistory[userId] = userHistory;

    await this.saveAllHistory(allHistory);
  }

  async removeMatch(userId: string, trackId: string): Promise<void> {
    const allHistory = await this.getAllHistory();
    const userHistory = allHistory[userId];

    if (userHistory) {
      userHistory.matches = userHistory.matches.filter(m => m.trackId !== trackId);
      allHistory[userId] = userHistory;
      await this.saveAllHistory(allHistory);
    }
  }

  async getMatchedTrackIds(userId: string): Promise<Set<string>> {
    const history = await this.getHistory(userId);
    return new Set(history.matches.map(m => m.trackId));
  }

  async clearHistory(userId: string): Promise<void> {
    const allHistory = await this.getAllHistory();
    delete allHistory[userId];
    await this.saveAllHistory(allHistory);
  }

  private async getAllHistory(): Promise<Record<string, UserMatchHistory>> {
    try {
      const data = await fs.readFile(this.historyPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  private async saveAllHistory(history: Record<string, UserMatchHistory>): Promise<void> {
    const dir = path.dirname(this.historyPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.historyPath, JSON.stringify(history, null, 2), "utf-8");
  }
}
