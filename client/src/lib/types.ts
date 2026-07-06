// Re-export types for frontend use
export type { 
  CategoryScore, 
  Evidence, 
  MeasuredMetrics, 
  JudgedMetrics,
  VerseAnalysis,
  ScoreBreakdown,
  ArtistResult,
  RhymeMathResult,
  LeaderboardEntry,
  CompareRequest,
} from "../../../shared/schema.js";

export interface MockArtist {
  id: number;
  slug: string;
  name: string;
  realName: string;
  hometown: string;
  era: string;
  bio: string;
  imageUrl: string;
  overallAverage: number;
  totalComparisons: number;
  wins: number;
  losses: number;
  bestVerseTitle: string;
  bestVerseScore: number;
  categoryAverages: {
    flow: number;
    wordplay: number;
    storytelling: number;
    rhyming: number;
    punchlines: number;
  };
  recentComparisons: { opponent: string; result: "W" | "L" | "T"; score: string }[];
}

export type LeaderboardCategory =
  | "overall"
  | "flow"
  | "wordplay"
  | "storytelling"
  | "rhyming"
  | "punchlines"
  | "bestVerse"
  | "mostCompared"
  | "trending";
