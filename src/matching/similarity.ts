import { AudioFeatures } from "../spotify/client.js";

// Feature weights - customize based on what matters most for "vibe"
const FEATURE_WEIGHTS = {
  energy: 1.0,
  danceability: 1.0,
  valence: 0.9, // Mood is important but slightly less than energy
  tempo: 0.6, // Tempo matters less (normalized)
  acousticness: 0.8,
  instrumentalness: 0.7,
};

// Normalize tempo to 0-1 range (assuming 50-200 BPM typical range)
function normalizeTempo(tempo: number): number {
  const minTempo = 50;
  const maxTempo = 200;
  return Math.max(0, Math.min(1, (tempo - minTempo) / (maxTempo - minTempo)));
}

// Convert features to normalized vector
function featuresToVector(features: AudioFeatures): number[] {
  return [
    features.energy * FEATURE_WEIGHTS.energy,
    features.danceability * FEATURE_WEIGHTS.danceability,
    features.valence * FEATURE_WEIGHTS.valence,
    normalizeTempo(features.tempo) * FEATURE_WEIGHTS.tempo,
    features.acousticness * FEATURE_WEIGHTS.acousticness,
    features.instrumentalness * FEATURE_WEIGHTS.instrumentalness,
  ];
}

// Euclidean distance between two feature vectors
export function euclideanDistance(a: AudioFeatures, b: AudioFeatures): number {
  const vectorA = featuresToVector(a);
  const vectorB = featuresToVector(b);

  const sumSquares = vectorA.reduce((sum, val, i) => {
    return sum + Math.pow(val - vectorB[i], 2);
  }, 0);

  return Math.sqrt(sumSquares);
}

// Cosine similarity between two feature vectors
export function cosineSimilarity(a: AudioFeatures, b: AudioFeatures): number {
  const vectorA = featuresToVector(a);
  const vectorB = featuresToVector(b);

  const dotProduct = vectorA.reduce((sum, val, i) => sum + val * vectorB[i], 0);
  const magnitudeA = Math.sqrt(vectorA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vectorB.reduce((sum, val) => sum + val * val, 0));

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

// Combined similarity score (higher is more similar)
export function calculateSimilarity(
  songFeatures: AudioFeatures,
  playlistAverage: AudioFeatures
): number {
  // Cosine similarity (0-1, higher = more similar)
  const cosine = cosineSimilarity(songFeatures, playlistAverage);

  // Euclidean distance converted to similarity (0-1, higher = more similar)
  const maxDistance = 2.5;
  const distance = euclideanDistance(songFeatures, playlistAverage);
  const euclideanSimilarity = Math.max(0, 1 - distance / maxDistance);

  // Weighted combination (favor cosine for direction, euclidean for magnitude)
  return 0.6 * cosine + 0.4 * euclideanSimilarity;
}

// Calculate average features from multiple tracks
export function calculateAverageFeatures(features: AudioFeatures[]): AudioFeatures {
  if (features.length === 0) {
    throw new Error("Cannot calculate average of empty feature set");
  }

  const sum = features.reduce(
    (acc, f) => ({
      id: "average",
      energy: acc.energy + f.energy,
      danceability: acc.danceability + f.danceability,
      tempo: acc.tempo + f.tempo,
      valence: acc.valence + f.valence,
      acousticness: acc.acousticness + f.acousticness,
      instrumentalness: acc.instrumentalness + f.instrumentalness,
      speechiness: acc.speechiness + f.speechiness,
      liveness: acc.liveness + f.liveness,
      loudness: acc.loudness + f.loudness,
      key: 0,
      mode: 0,
      time_signature: 0,
    }),
    {
      id: "average",
      energy: 0,
      danceability: 0,
      tempo: 0,
      valence: 0,
      acousticness: 0,
      instrumentalness: 0,
      speechiness: 0,
      liveness: 0,
      loudness: 0,
      key: 0,
      mode: 0,
      time_signature: 0,
    }
  );

  const count = features.length;
  return {
    id: "average",
    energy: sum.energy / count,
    danceability: sum.danceability / count,
    tempo: sum.tempo / count,
    valence: sum.valence / count,
    acousticness: sum.acousticness / count,
    instrumentalness: sum.instrumentalness / count,
    speechiness: sum.speechiness / count,
    liveness: sum.liveness / count,
    loudness: sum.loudness / count,
    key: 0,
    mode: 0,
    time_signature: 4,
  };
}

// Format audio features for display
export function formatFeatures(features: AudioFeatures): Record<string, string> {
  return {
    energy: `${(features.energy * 100).toFixed(0)}%`,
    danceability: `${(features.danceability * 100).toFixed(0)}%`,
    valence: `${(features.valence * 100).toFixed(0)}%`,
    tempo: `${features.tempo.toFixed(0)} BPM`,
    acousticness: `${(features.acousticness * 100).toFixed(0)}%`,
    instrumentalness: `${(features.instrumentalness * 100).toFixed(0)}%`,
  };
}
