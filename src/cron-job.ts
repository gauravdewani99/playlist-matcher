#!/usr/bin/env node
/**
 * Standalone script for cron job execution
 * Runs the playlist matcher and adds songs automatically
 */

import { SpotifyOAuth } from "./auth/oauth.js";
import { TokenStore } from "./auth/token-store.js";
import { SpotifyClient } from "./spotify/client.js";
import { GenreMatcher } from "./matching/genre-matcher.js";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;

async function main() {
  console.log(`[${new Date().toISOString()}] Starting playlist matcher cron job...`);

  if (!CLIENT_ID) {
    console.error("Error: SPOTIFY_CLIENT_ID environment variable is required");
    process.exit(1);
  }

  const tokenStore = new TokenStore();
  const oauth = new SpotifyOAuth({ clientId: CLIENT_ID }, tokenStore);

  // Check if authenticated
  const isAuth = await oauth.isAuthenticated();
  if (!isAuth) {
    console.error("Error: Not authenticated with Spotify. Run the MCP server and use spotify_authorize first.");
    process.exit(1);
  }

  const spotifyClient = new SpotifyClient(oauth);
  const genreMatcher = new GenreMatcher(spotifyClient);

  try {
    // Get current user for logging
    const user = await spotifyClient.getCurrentUser();
    console.log(`Authenticated as: ${user.display_name}`);

    // Run the auto-organize with dryRun=false
    const result = await genreMatcher.autoOrganize(
      20,    // likedSongsLimit
      20,    // playlistLimit
      0.15,  // similarityThreshold
      false  // dryRun - actually add the tracks
    );

    console.log(`\n=== Results ===`);
    console.log(`Matched: ${result.matches.length} songs`);
    console.log(`Unmatched: ${result.unmatched.length} songs`);
    console.log(`Playlists affected: ${result.added.length}`);

    if (result.added.length > 0) {
      console.log(`\n=== Added to Playlists ===`);
      for (const addition of result.added) {
        console.log(`\n${addition.playlistName}:`);
        for (const track of addition.tracks) {
          console.log(`  - ${track}`);
        }
      }
    }

    if (result.unmatched.length > 0) {
      console.log(`\n=== Unmatched Songs ===`);
      for (const unmatched of result.unmatched) {
        console.log(`  - ${unmatched.trackName} (${unmatched.artistNames}): ${unmatched.reason}`);
      }
    }

    console.log(`\n[${new Date().toISOString()}] Cron job completed successfully.`);
  } catch (error) {
    console.error(`Error running playlist matcher:`, error);
    process.exit(1);
  }
}

main();
