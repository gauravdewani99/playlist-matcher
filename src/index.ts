#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;

  if (!clientId) {
    console.error("Error: SPOTIFY_CLIENT_ID environment variable is required");
    console.error("Get your Client ID from https://developer.spotify.com/dashboard");
    process.exit(1);
  }

  const server = await createServer(clientId);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("Playlist Matcher MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
