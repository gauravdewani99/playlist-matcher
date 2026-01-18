#!/bin/bash
# Playlist Matcher Cron Job Script
# Runs every 24 hours to auto-organize liked songs into playlists

export SPOTIFY_CLIENT_ID="aa80e78792c042bc9288e5d47208d68c"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

cd /Users/gauravdewani/playlist-matcher

# Log output to file
LOG_FILE="/Users/gauravdewani/playlist-matcher/cron.log"

echo "========================================" >> "$LOG_FILE"
node dist/cron-job.js >> "$LOG_FILE" 2>&1
echo "" >> "$LOG_FILE"
