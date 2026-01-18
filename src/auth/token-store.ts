import fs from "fs/promises";
import path from "path";
import os from "os";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class TokenStore {
  private tokenPath: string;

  constructor(appName: string = "playlist-matcher") {
    const configDir = path.join(os.homedir(), ".config", appName);
    this.tokenPath = path.join(configDir, "tokens.json");
  }

  async saveTokens(tokens: StoredTokens): Promise<void> {
    const dir = path.dirname(this.tokenPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), "utf-8");
  }

  async getTokens(): Promise<StoredTokens | null> {
    try {
      const data = await fs.readFile(this.tokenPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async clearTokens(): Promise<void> {
    try {
      await fs.unlink(this.tokenPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
