# Sortify - Implementation Checklist

## Phase 1: Cleanup (Priority 1)

### Dead Code Removal
- [x] Delete `web/src/components/Dashboard.tsx`
- [x] Delete `web/src/components/Dashboard.css`
- [x] Delete `web/src/components/LikedSongs.tsx`
- [x] Delete `web/src/components/LikedSongs.css`
- [x] Delete `web/src/components/LoginScreen.tsx`
- [x] Delete `web/src/components/LoginScreen.css`
- [x] Delete `web/src/components/Matcher.tsx`
- [x] Delete `web/src/components/Matcher.css`
- [x] Delete `web/src/components/MatchVisualization.tsx`
- [x] Delete `web/src/components/MatchVisualization.css`
- [x] Delete `web/src/components/Playlists.tsx`
- [x] Delete `web/src/components/Playlists.css`
- [x] Delete `web/src/components/TrackDetailPanel.tsx`
- [x] Delete `web/src/components/TrackDetailPanel.css`
- [x] Delete `src/matching/matcher.ts` (deprecated audio-based matcher)
- [x] Delete `src/matching/similarity.ts` (only used by deprecated matcher)
- [x] Run build to verify no breaks

### Security: Remove Debug Endpoints
- [x] Remove `/api/debug/user/:userId` endpoint from `web-server.ts`
- [x] Remove `/api/debug/test-match` endpoint from `web-server.ts`
- [x] Remove `debugTestMatch` function from `web/src/api.ts`

### Code Cleanup
- [x] Remove all `console.log` statements (except error logging)
- [x] Remove commented-out code blocks (none found - all are documentation)
- [x] Fix unused import warnings
- [x] Add `cron.log` to `.gitignore` (already covered by `*.log`)

---

## Phase 2: Engineering Improvements (Priority 1-2)

### Error Handling
- [x] Add React Error Boundary component to `App.tsx`
- [x] Create consistent API error response format in `web-server.ts`
- [x] Add try-catch to all async handlers (already present)

### Performance Optimization
- [x] Add playlist profile caching with 1-hour TTL in `genre-matcher.ts`
- [ ] Implement parallel artist fetching in `enrichTracksWithGenres`
- [ ] Add database indexes for frequently queried columns

### Observability
- [ ] Add request logging middleware to Express
- [ ] Add response timing to API endpoints
- [ ] Create structured logging format (JSON)
- [x] Add `/api/health` metrics (uptime, version, storage mode)

### Code Refactoring
- [ ] Extract auth middleware to `src/middleware/auth.ts`
- [ ] Create shared types file `src/types/index.ts`
- [ ] Split routes into modules (`src/routes/*.ts`)

---

## Phase 3: Design Polish (Priority 2)

### Consistency Fixes
- [ ] Audit and replace hardcoded colors with CSS variables
- [ ] Ensure all buttons have hover/active states
- [ ] Add focus states for keyboard navigation

### Loading States
- [ ] Add skeleton loader for Home page settings
- [ ] Add skeleton loader for Dashboard match history
- [ ] Add loading spinner during sync operation

### Mobile Experience
- [ ] Improve About page mobile layout
- [ ] Add tooltips for truncated playlist/track names
- [ ] Verify all touch targets are 44px minimum

### Visual Polish
- [ ] Add empty state illustration for "no matches"
- [ ] Add sync progress animation
- [ ] Improve toast notification with icons

---

## Phase 4: QA & Testing (Priority 2-3)

### Edge Case Handling
- [ ] Handle 0 liked songs gracefully
- [ ] Handle 0 playlists gracefully
- [ ] Handle OAuth denial/failure
- [ ] Handle token refresh during API call
- [ ] Handle session expiry during use

### Unit Tests
- [ ] Set up Jest for backend
- [ ] Test Jaccard similarity function
- [ ] Test score calculation formula
- [ ] Test settings validation/clamping
- [ ] Set up Vitest for frontend
- [ ] Test date formatting functions

### Integration Tests
- [ ] Test OAuth complete flow
- [ ] Test settings save and reload
- [ ] Test sync and history update
- [ ] Test move track between playlists

### Documentation
- [ ] Update README with current features
- [ ] Document matching algorithm in code comments
- [ ] Create deployment guide

---

## Product: Analytics Setup (Priority 3)

### Event Logging
- [ ] Log `AUTH_SUCCESS` / `AUTH_FAILED` events
- [ ] Log `SYNC_STARTED` / `SYNC_COMPLETED` events
- [ ] Log `SETTINGS_CHANGED` events
- [ ] Log `MATCH_MOVED` / `MATCH_REMOVED` events

### Metrics Tracking
- [ ] Track match success rate
- [ ] Track average match score
- [ ] Track API latency (p95)
- [ ] Track sync failure rate

---

## Quick Wins (Do Now)

These can be done immediately with minimal risk:

1. [x] Delete 14 deprecated component files (~2,800 lines)
2. [x] Delete 2 deprecated matching files (~375 lines)
3. [x] Remove 2 debug endpoints (~80 lines)
4. [x] Add Error Boundary component
5. [x] Add `cron.log` to `.gitignore` (already covered by `*.log`)

---

## Verification Checklist

After each phase, verify:

### Phase 1 Complete
- [x] `npm run build` succeeds (backend)
- [x] `npm run build` succeeds (frontend)
- [x] No TypeScript errors
- [ ] App loads and functions correctly
- [x] Debug endpoints return 404

### Phase 2 Complete
- [ ] API responses include timing headers
- [ ] Errors return consistent format
- [ ] Playlist caching reduces API calls

### Phase 3 Complete
- [ ] All screens render on mobile (375px)
- [ ] All screens render on desktop (1440px)
- [ ] No visual regressions

### Phase 4 Complete
- [ ] All unit tests pass
- [ ] Edge cases handled gracefully
- [ ] README is accurate

---

*Last updated: 2026-01-30*
