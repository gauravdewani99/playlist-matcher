# Sortify

Automatically sort your Spotify liked songs into playlists based on artist and genre similarity.

## Features

- **Web Interface** - Beautiful Spotify-styled dashboard to manage your settings and view match history
- **Automatic Scheduling** - Set your preferred interval and time, and Sortify handles the rest
- **Genre-based Matching** - Intelligent matching using artist genres, overlap detection, and popularity
- **Match History** - Track all songs that have been sorted into playlists
- **Multi-user Support** - PostgreSQL backend for production deployment
- **MCP Integration** - Also works as an MCP server for Claude Code

## How It Works

Sortify analyzes your recently liked songs and matches them to your existing playlists using this formula:

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

## Quick Start (Local Development)

### 1. Get Spotify API Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add these Redirect URIs:
   - `http://localhost:3001/api/auth/callback` (for web mode)
   - `http://127.0.0.1:8888/callback` (for MCP mode)
4. Copy your **Client ID**

### 2. Install and Run

```bash
# Install dependencies
npm install
cd web && npm install && cd ..

# Build
npm run build
cd web && npm run build && cd ..

# Set environment variable
export SPOTIFY_CLIENT_ID=your_client_id_here

# Run the web server
npm run web
```

### 3. Open the App

Visit `http://localhost:5173` and log in with Spotify.

## Production Deployment

For production, you'll need:

- **PostgreSQL** database
- **Backend** (e.g., Railway)
- **Frontend** (e.g., Vercel)

### Environment Variables

**Backend:**
```
SPOTIFY_CLIENT_ID=your_client_id
DATABASE_URL=postgresql://...
REDIRECT_URI=https://your-backend.com/api/auth/callback
FRONTEND_URL=https://your-frontend.com
BETA_WHITELIST=user1@example.com,user2@example.com  # Optional: comma-separated emails for beta access
```

**Frontend:**
```
VITE_API_URL=https://your-backend.com
```

## MCP Mode (Claude Code)

Sortify also works as an MCP server for Claude Code.

Add to your `~/.claude.json`:

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

### MCP Tools

| Tool | Description |
|------|-------------|
| `spotify_authorize` | Start OAuth login flow |
| `spotify_check_auth` | Check authentication status |
| `spotify_get_liked_songs` | Fetch recent liked songs |
| `spotify_get_liked_songs_with_genres` | Fetch liked songs with genre info |
| `spotify_get_playlists` | Fetch your playlists |
| `spotify_match_songs_to_playlists` | Find best playlist for each liked song |
| `spotify_auto_organize_liked_songs` | Match and add songs to playlists |

## Project Structure

```
sortify/
├── src/                      # Backend (Express + MCP server)
│   ├── web-server.ts         # Express API server
│   ├── server.ts             # MCP server tools
│   ├── scheduler/            # Cron job runner
│   ├── matching/             # Matching algorithm
│   │   └── genre-matcher.ts  # Genre-based matching
│   ├── storage/              # Data persistence
│   │   ├── database.ts       # PostgreSQL setup
│   │   └── pg-*.ts           # PostgreSQL stores
│   ├── spotify/              # Spotify API client
│   └── auth/                 # OAuth handling
│
├── web/                      # Frontend (React + Vite)
│   └── src/
│       ├── components/       # React components
│       │   ├── Home.tsx      # Settings page
│       │   ├── NewDashboard.tsx  # Match history
│       │   └── About.tsx     # About page
│       └── api.ts            # API client
│
└── package.json
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check with uptime and version |
| `GET /api/auth/url` | Get OAuth URL |
| `GET /api/auth/status` | Check if authenticated |
| `POST /api/auth/logout` | Logout |
| `GET /api/settings` | Get user settings |
| `POST /api/settings` | Update settings |
| `GET /api/match-history` | Get match history |
| `POST /api/sync-now` | Trigger manual sync |

## License

MIT
