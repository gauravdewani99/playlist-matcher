# Playlist Matcher

An MCP (Model Context Protocol) server that automatically matches your liked Spotify songs to your playlists based on artist and genre similarity.

## Features

- **OAuth PKCE Authentication** - Secure local authentication with Spotify
- **Genre-based Matching** - Matches songs using artist genres, not just audio features
- **Artist Overlap Detection** - Prioritizes playlists that already contain the same artists
- **Automatic Organization** - Runs on a schedule to keep your playlists updated
- **MCP Integration** - Works with Claude Code and other MCP-compatible AI assistants

## Matching Formula

```
score = (artistOverlap × 0.35) +
        (genreOverlap × 0.25) +
        (weightedGenreScore × 0.25) +
        (popularitySimilarity × 0.15)
```

| Component | Weight | Description |
|-----------|--------|-------------|
| Artist Overlap | 35% | Direct match if track artist appears in playlist |
| Genre Overlap | 25% | Jaccard similarity of genre sets |
| Weighted Genre | 25% | Bonus for genres that appear frequently in playlist |
| Popularity | 15% | Tracks with similar popularity to playlist average |

## Setup

### 1. Get Spotify API Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add `http://127.0.0.1:8888/callback` to Redirect URIs
4. Copy your **Client ID**

### 2. Install Dependencies

```bash
npm install
npm run build
```

### 3. Configure Claude Code

Add to your `~/.claude.json` under the project's `mcpServers`:

```json
{
  "playlist-matcher": {
    "command": "node",
    "args": ["/path/to/playlist-matcher/dist/index.js"],
    "env": {
      "SPOTIFY_CLIENT_ID": "your_client_id_here"
    }
  }
}
```

### 4. Authenticate

In Claude Code, run:
```
spotify_authorize
```

This opens a browser for Spotify login. Tokens are stored in `~/.config/playlist-matcher/`.

## MCP Tools

| Tool | Description |
|------|-------------|
| `spotify_authorize` | Start OAuth login flow |
| `spotify_check_auth` | Check authentication status |
| `spotify_get_liked_songs` | Fetch recent liked songs |
| `spotify_get_liked_songs_with_genres` | Fetch liked songs with genre info |
| `spotify_get_playlists` | Fetch your playlists |
| `spotify_get_playlist_tracks` | Get tracks from a playlist |
| `spotify_get_artist_genres` | Get genres for artists |
| `spotify_add_tracks_to_playlist` | Add tracks to a playlist |
| `spotify_analyze_playlist_vibe` | Calculate playlist's average audio features |
| `spotify_match_songs_to_playlists` | Find best playlist for each liked song |
| `spotify_auto_organize_liked_songs` | Match and add songs to playlists |

## Scheduled Job (macOS)

A launchd job runs daily at midnight to auto-organize your liked songs.

```bash
# Check status
launchctl list | grep playlist-matcher

# Stop
launchctl unload ~/Library/LaunchAgents/com.gauravdewani.playlist-matcher.plist

# Start
launchctl load ~/Library/LaunchAgents/com.gauravdewani.playlist-matcher.plist

# Run manually
./run-cron.sh

# View logs
cat cron.log
```

## Project Structure

```
playlist-matcher/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # Tool definitions
│   ├── cron-job.ts           # Standalone cron script
│   ├── auth/
│   │   ├── oauth.ts          # Spotify OAuth PKCE
│   │   └── token-store.ts    # Token persistence
│   ├── spotify/
│   │   └── client.ts         # Spotify API wrapper
│   └── matching/
│       ├── genre-matcher.ts  # Genre-based matching
│       ├── matcher.ts        # Audio feature matching (deprecated)
│       └── similarity.ts     # Similarity algorithms
├── run-cron.sh               # Cron job wrapper
├── package.json
└── tsconfig.json
```

## License

MIT
