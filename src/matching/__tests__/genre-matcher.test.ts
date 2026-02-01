import {
  jaccardSimilarity,
  artistOverlapScore,
  genreOverlapScore,
  weightedGenreScore,
  popularitySimilarity,
  calculateMatchScore,
  type TrackWithGenres,
  type PlaylistProfile,
} from "../genre-matcher.js";

describe("jaccardSimilarity", () => {
  it("returns 0 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("returns 0 when sets have no overlap", () => {
    const setA = new Set(["rock", "metal"]);
    const setB = new Set(["jazz", "blues"]);
    expect(jaccardSimilarity(setA, setB)).toBe(0);
  });

  it("returns 1 for identical sets", () => {
    const setA = new Set(["rock", "metal", "punk"]);
    const setB = new Set(["rock", "metal", "punk"]);
    expect(jaccardSimilarity(setA, setB)).toBe(1);
  });

  it("calculates correct similarity for partial overlap", () => {
    // A = {rock, metal}, B = {rock, jazz}
    // Intersection = {rock} = 1
    // Union = {rock, metal, jazz} = 3
    // Jaccard = 1/3
    const setA = new Set(["rock", "metal"]);
    const setB = new Set(["rock", "jazz"]);
    expect(jaccardSimilarity(setA, setB)).toBeCloseTo(1 / 3);
  });

  it("handles subset relationship correctly", () => {
    // A = {rock}, B = {rock, metal, punk}
    // Intersection = 1, Union = 3
    const setA = new Set(["rock"]);
    const setB = new Set(["rock", "metal", "punk"]);
    expect(jaccardSimilarity(setA, setB)).toBeCloseTo(1 / 3);
  });

  it("is symmetric", () => {
    const setA = new Set(["rock", "metal", "punk"]);
    const setB = new Set(["rock", "jazz"]);
    expect(jaccardSimilarity(setA, setB)).toBe(jaccardSimilarity(setB, setA));
  });
});

describe("artistOverlapScore", () => {
  it("returns 0 when track has no artists", () => {
    const playlistArtists = new Set(["artist1", "artist2"]);
    expect(artistOverlapScore([], playlistArtists)).toBe(0);
  });

  it("returns 0 when playlist has no artists", () => {
    expect(artistOverlapScore(["artist1"], new Set())).toBe(0);
  });

  it("returns 0 when no artists overlap", () => {
    const trackArtists = ["artist1", "artist2"];
    const playlistArtists = new Set(["artist3", "artist4"]);
    expect(artistOverlapScore(trackArtists, playlistArtists)).toBe(0);
  });

  it("returns high score when single artist matches", () => {
    const trackArtists = ["artist1"];
    const playlistArtists = new Set(["artist1", "artist2"]);
    // 1/1 + 0.5 = 1.5, capped at 1.0
    expect(artistOverlapScore(trackArtists, playlistArtists)).toBe(1.0);
  });

  it("returns high score when one of multiple artists matches", () => {
    const trackArtists = ["artist1", "artist2"];
    const playlistArtists = new Set(["artist1", "artist3"]);
    // 1/2 + 0.5 = 1.0
    expect(artistOverlapScore(trackArtists, playlistArtists)).toBe(1.0);
  });

  it("returns capped score when all artists match", () => {
    const trackArtists = ["artist1", "artist2"];
    const playlistArtists = new Set(["artist1", "artist2", "artist3"]);
    // 2/2 + 0.5 = 1.5, capped at 1.0
    expect(artistOverlapScore(trackArtists, playlistArtists)).toBe(1.0);
  });
});

describe("genreOverlapScore", () => {
  it("returns 0 when track has no genres", () => {
    const playlistGenres = new Set(["rock", "metal"]);
    expect(genreOverlapScore([], playlistGenres)).toBe(0);
  });

  it("returns 0 when playlist has no genres", () => {
    expect(genreOverlapScore(["rock"], new Set())).toBe(0);
  });

  it("returns 0 when no genres overlap", () => {
    expect(genreOverlapScore(["rock", "metal"], new Set(["jazz", "blues"]))).toBe(0);
  });

  it("returns 1 for identical genre sets", () => {
    expect(genreOverlapScore(["rock", "metal"], new Set(["rock", "metal"]))).toBe(1);
  });

  it("calculates correct overlap for partial match", () => {
    // Track: [rock, metal], Playlist: {rock, jazz}
    // Jaccard = 1/3
    expect(genreOverlapScore(["rock", "metal"], new Set(["rock", "jazz"]))).toBeCloseTo(1 / 3);
  });
});

describe("weightedGenreScore", () => {
  it("returns 0 when track has no genres", () => {
    const freq = new Map([["rock", 5]]);
    expect(weightedGenreScore([], freq)).toBe(0);
  });

  it("returns 0 when playlist has no genre frequencies", () => {
    expect(weightedGenreScore(["rock"], new Map())).toBe(0);
  });

  it("returns 0 when no genres match", () => {
    const freq = new Map([["jazz", 5]]);
    expect(weightedGenreScore(["rock", "metal"], freq)).toBe(0);
  });

  it("scores higher for frequently occurring genres", () => {
    // Playlist with rock appearing 10 times, metal 2 times
    const freq = new Map([
      ["rock", 10],
      ["metal", 2],
    ]);

    // Track with rock should score higher than track with metal
    const rockScore = weightedGenreScore(["rock"], freq);
    const metalScore = weightedGenreScore(["metal"], freq);

    expect(rockScore).toBeGreaterThan(metalScore);
    expect(rockScore).toBeGreaterThan(0);
    expect(metalScore).toBeGreaterThan(0);
  });

  it("applies bonus for multiple matching genres", () => {
    const freq = new Map([
      ["rock", 5],
      ["metal", 5],
      ["punk", 5],
    ]);

    // Track with multiple matching genres should score higher
    const singleGenreScore = weightedGenreScore(["rock"], freq);
    const multiGenreScore = weightedGenreScore(["rock", "metal"], freq);

    expect(multiGenreScore).toBeGreaterThan(singleGenreScore);
  });
});

describe("popularitySimilarity", () => {
  it("returns 1 for identical popularity", () => {
    expect(popularitySimilarity(50, 50)).toBe(1);
  });

  it("returns 0 for difference of 40 or more", () => {
    expect(popularitySimilarity(0, 40)).toBe(0);
    expect(popularitySimilarity(100, 60)).toBe(0);
  });

  it("returns 0.5 for difference of 20", () => {
    expect(popularitySimilarity(50, 70)).toBe(0.5);
    expect(popularitySimilarity(30, 50)).toBe(0.5);
  });

  it("returns values between 0 and 1 for intermediate differences", () => {
    expect(popularitySimilarity(50, 60)).toBeCloseTo(0.75);
    expect(popularitySimilarity(50, 80)).toBeCloseTo(0.25);
  });

  it("is symmetric", () => {
    expect(popularitySimilarity(30, 50)).toBe(popularitySimilarity(50, 30));
  });
});

describe("calculateMatchScore", () => {
  const createTrack = (overrides: Partial<TrackWithGenres> = {}): TrackWithGenres => ({
    id: "track1",
    uri: "spotify:track:track1",
    name: "Test Track",
    artistIds: ["artist1"],
    artistNames: ["Artist One"],
    genres: ["rock", "metal"],
    popularity: 50,
    ...overrides,
  });

  const createPlaylist = (overrides: Partial<PlaylistProfile> = {}): PlaylistProfile => ({
    playlistId: "playlist1",
    playlistName: "Test Playlist",
    trackCount: 100,
    sampledCount: 50,
    artistIds: new Set(["artist2", "artist3"]),
    artistNames: new Set(["Artist Two", "Artist Three"]),
    genres: new Map([
      ["rock", 10],
      ["indie", 5],
    ]),
    avgPopularity: 50,
    ...overrides,
  });

  it("returns score between 0 and 1", () => {
    const track = createTrack();
    const playlist = createPlaylist();
    const { score } = calculateMatchScore(track, playlist);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("returns high score for perfect artist match", () => {
    const track = createTrack({ artistIds: ["artist1"] });
    const playlist = createPlaylist({ artistIds: new Set(["artist1", "artist2"]) });
    const { score, breakdown } = calculateMatchScore(track, playlist);

    expect(breakdown.artistOverlap).toBe(1);
    expect(score).toBeGreaterThan(0.35); // At least the artist weight
  });

  it("returns low score for no matches", () => {
    const track = createTrack({
      artistIds: ["unknown"],
      genres: ["country"],
      popularity: 10,
    });
    const playlist = createPlaylist({
      artistIds: new Set(["artist1"]),
      genres: new Map([["electronic", 5]]),
      avgPopularity: 90,
    });
    const { score } = calculateMatchScore(track, playlist);

    expect(score).toBeLessThan(0.2);
  });

  it("includes all breakdown components", () => {
    const track = createTrack();
    const playlist = createPlaylist();
    const { breakdown } = calculateMatchScore(track, playlist);

    expect(breakdown).toHaveProperty("artistOverlap");
    expect(breakdown).toHaveProperty("genreOverlap");
    expect(breakdown).toHaveProperty("weightedGenreScore");
    expect(breakdown).toHaveProperty("popularitySimilarity");
  });

  it("weights components correctly (35% artist, 25% genre, 25% weighted, 15% popularity)", () => {
    // Create a track and playlist with known scores
    const track = createTrack({
      artistIds: ["artist1"],
      genres: ["rock"],
      popularity: 50,
    });
    const playlist = createPlaylist({
      artistIds: new Set(["artist1"]), // Perfect artist match = 1.0
      genres: new Map([["rock", 10]]), // Perfect genre match = 1.0
      avgPopularity: 50, // Perfect popularity match = 1.0
    });

    const { score, breakdown } = calculateMatchScore(track, playlist);

    // All components should be 1.0, so score should be 1.0
    expect(breakdown.artistOverlap).toBe(1);
    expect(breakdown.genreOverlap).toBe(1);
    expect(breakdown.popularitySimilarity).toBe(1);
    expect(score).toBeCloseTo(1, 1);
  });

  it("rounds scores to 2 decimal places", () => {
    const track = createTrack();
    const playlist = createPlaylist();
    const { score, breakdown } = calculateMatchScore(track, playlist);

    // Check that scores have at most 2 decimal places (with tolerance for floating point)
    const hasValidPrecision = (n: number) => {
      const rounded = Math.round(n * 100) / 100;
      return Math.abs(n - rounded) < 0.0001;
    };

    expect(hasValidPrecision(score)).toBe(true);
    expect(hasValidPrecision(breakdown.artistOverlap)).toBe(true);
    expect(hasValidPrecision(breakdown.genreOverlap)).toBe(true);
    expect(hasValidPrecision(breakdown.weightedGenreScore)).toBe(true);
    expect(hasValidPrecision(breakdown.popularitySimilarity)).toBe(true);
  });
});
