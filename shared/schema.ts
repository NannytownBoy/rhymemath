import { pgTable, text, integer, real, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Artists ────────────────────────────────────────────────────────────────
export const artists = pgTable("artists", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  realName: text("real_name"),
  hometown: text("hometown"),
  era: text("era"),
  imageUrl: text("image_url"),
  bio: text("bio"),
  // Composite scores (JSON arrays stored as text)
  categoryAverages: text("category_averages"), // JSON: {flow, wordplay, storytelling, rhyming, punchlines}
  overallAverage: real("overall_average"),
  totalComparisons: integer("total_comparisons").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  bestVerseTitle: text("best_verse_title"),
  bestVerseScore: real("best_verse_score"),
});

export const insertArtistSchema = createInsertSchema(artists).omit({ id: true });
export type InsertArtist = z.infer<typeof insertArtistSchema>;
export type Artist = typeof artists.$inferSelect;

// ─── Comparisons ────────────────────────────────────────────────────────────
export const comparisons = pgTable("comparisons", {
  id: serial("id").primaryKey(),
  resultId: text("result_id").notNull().unique(), // UUID for shareable URL
  artistAName: text("artist_a_name").notNull(),
  songAName: text("song_a_name").notNull(),
  verseA: text("verse_a").notNull(),
  verseLabelA: text("verse_label_a"), // e.g. "Verse 1", "Hook", "Bridge"
  artistBName: text("artist_b_name").notNull(),
  songBName: text("song_b_name").notNull(),
  verseB: text("verse_b").notNull(),
  verseLabelB: text("verse_label_b"), // e.g. "Verse 2", "Hook"
  winner: text("winner").notNull(), // "A" | "B" | "TIE"
  scoringMode: text("scoring_mode").notNull().default("standard"), // "standard" | "custom"
  customWeights: text("custom_weights"), // JSON if custom mode
  winnerName: text("winner_name").notNull(),
  confidence: real("confidence").notNull(),
  scoreA: real("score_a").notNull(),
  scoreB: real("score_b").notNull(),
  // Full result JSON
  resultJson: text("result_json").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const insertComparisonSchema = createInsertSchema(comparisons).omit({ id: true });
export type InsertComparison = z.infer<typeof insertComparisonSchema>;
export type Comparison = typeof comparisons.$inferSelect;

// ─── TypeScript domain types ─────────────────────────────────────────────────

export interface CategoryScore {
  name: string;
  scoreA: number;
  scoreB: number;
  weight: number;
  evidence: Evidence;
  reasoning: string;
}

export interface Evidence {
  artistA: string[];
  artistB: string[];
}

export interface MeasuredMetrics {
  rhymeDensity: number;
  internalRhymes: number;
  endRhymes: number;
  repeatedSounds: number;
  lineLengthConsistency: number;
  syllableApproximation: number;
  verseStructure: string;
  lineCount: number;
  avgLineLength: number;
  lineLengthVariance: number;
}

export interface JudgedMetrics {
  flowQuality: number;
  wordplay: number;
  storytelling: number;
  punchlines: number;
  originality: number;
  setupPayoff: number;
  thematicProgression: number;
}

export interface VerseAnalysis {
  measured: MeasuredMetrics;
  judged: JudgedMetrics;
}

export interface ScoreBreakdown {
  flow: number;
  wordplay: number;
  storytelling: number;
  rhyming: number;
  punchlines: number;
  overall: number;
}

export interface ArtistResult {
  artistName: string;
  songName: string;
  verse: string;
  scores: ScoreBreakdown;
  analysis: VerseAnalysis;
}

export interface RhymeMathResult {
  resultId: string;
  artistA: ArtistResult;
  artistB: ArtistResult;
  winner: "A" | "B" | "TIE";
  winnerName: string;
  confidence: number;
  categories: CategoryScore[];
  explanation: string;
  whyTheyWon: string;
  scoreDiff: number;
}

export interface LeaderboardEntry {
  rank: number;
  artistName: string;
  slug: string;
  score: number;
  category: string;
  comparisons: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface SoloAnalysisResult {
  resultId: string;
  artistName: string;
  songName: string;
  verseLabel?: string;
  verse: string;
  scores: ScoreBreakdown;
  analysis: VerseAnalysis;
  categories: CategoryScore[];
  explanation: string;
  scoringMode: string;
  customWeights?: any;
}

export interface CompareRequest {
  artistA: string;
  songA: string;
  verseA: string;
  artistB: string;
  songB: string;
  verseB: string;
}

// ─── Solo Analyses ──────────────────────────────────────────────────────────
export const analyses = pgTable("analyses", {
  id: serial("id").primaryKey(),
  resultId: text("result_id").notNull().unique(),
  artistName: text("artist_name").notNull(),
  songName: text("song_name").notNull(),
  verseLabel: text("verse_label"),
  // v5: section identity
  sectionLabel: text("section_label"),   // canonical: verse_1|verse_2|hook|bridge|outro|unknown
  sectionIndex: integer("section_index"), // numeric index when known (verse_1=1, verse_2=2, etc.)
  // v5: deduplication
  textHash: text("text_hash"),           // SHA-256 of normalized verse text
  // v5: provenance
  source: text("source"),                // "genius"|"manual"|"miner"
  sourceId: text("source_id"),           // Genius song ID or other external ref
  verse: text("verse").notNull(),
  scoringMode: text("scoring_mode").notNull().default("standard"),
  customWeights: text("custom_weights"),
  resultJson: text("result_json").notNull(),
  // Score snapshot for leaderboard
  scoreOverall: real("score_overall").notNull(),
  scoreFlow: real("score_flow").notNull(),
  scoreWordplay: real("score_wordplay").notNull(),
  scoreStorytelling: real("score_storytelling").notNull(),
  scoreRhyming: real("score_rhyming").notNull(),
  scorePunchlines: real("score_punchlines").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at"),
});

export const insertAnalysisSchema = createInsertSchema(analyses).omit({ id: true });
export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analyses.$inferSelect;

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"), // "member" | "moderator" | "admin"
  points: integer("points").notNull().default(0),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  resetToken: text("reset_token"),
  resetTokenExpiry: integer("reset_token_expiry"),
  createdAt: integer("created_at").notNull(),
  lastLoginAt: integer("last_login_at"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, points: true, role: true, resetToken: true, resetTokenExpiry: true, lastLoginAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Annotations ─────────────────────────────────────────────────────────────
// Users flag a specific line/phrase in a scored verse and explain its meaning
export const annotations = pgTable("annotations", {
  id: serial("id").primaryKey(),
  // What verse this annotation belongs to
  analysisId: text("analysis_id"),     // resultId from analyses table (solo)
  comparisonId: text("comparison_id"), // resultId from comparisons table (battle)
  side: text("side"),                  // "A" | "B" | null (battle only)
  // The annotated content
  anchorText: text("anchor_text").notNull(),       // exact phrase highlighted
  startIndex: integer("start_index"),              // char offset in verse
  endIndex: integer("end_index"),                  // char offset in verse
  meaning: text("meaning").notNull(),              // what does it mean
  meaningType: text("meaning_type").notNull(),     // "double_entendre"|"punchline"|"cultural_ref"|"wordplay"|"metaphor"|"historical_ref"
  interpretation1: text("interpretation_1"),       // surface reading
  interpretation2: text("interpretation_2"),       // deeper/hidden reading
  interpretation3: text("interpretation_3"),       // third layer if any
  domainTags: text("domain_tags"),                 // comma-separated: street,luxury,religion,etc.
  // Curation
  status: text("status").notNull().default("pending"), // "pending"|"approved"|"rejected"
  reviewedBy: text("reviewed_by"),                 // username of moderator/admin
  reviewNote: text("review_note"),                 // optional note from reviewer
  promoteToCID: boolean("promote_to_cid").default(false), // if approved, push to CID?
  // Authorship
  submittedBy: integer("submitted_by").notNull(),  // users.id
  submittedByUsername: text("submitted_by_username").notNull(),
  pointsAwarded: integer("points_awarded").default(0),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
});

export const insertAnnotationSchema = createInsertSchema(annotations).omit({ id: true, status: true, reviewedBy: true, reviewNote: true, reviewedAt: true, pointsAwarded: true });
export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type Annotation = typeof annotations.$inferSelect;

// ─── Points ledger ────────────────────────────────────────────────────────────
export const pointsLedger = pgTable("points_ledger", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  delta: integer("delta").notNull(),           // positive = earned, negative = spent
  reason: text("reason").notNull(),            // "profile_created"|"annotation_submitted"|"annotation_approved"|"annotation_rejected"
  referenceId: integer("reference_id"),        // annotations.id if relevant
  createdAt: integer("created_at").notNull(),
});

export const insertPointsLedgerSchema = createInsertSchema(pointsLedger).omit({ id: true });
export type InsertPointsLedger = z.infer<typeof insertPointsLedgerSchema>;
export type PointsLedger = typeof pointsLedger.$inferSelect;

// Points config
export const POINTS = {
  PROFILE_CREATED:        50,
  ANNOTATION_SUBMITTED:   10,
  ANNOTATION_APPROVED:    25,
  ANNOTATION_REJECTED:    -5,
  ANNOTATION_CID_PROMOTED: 50,
} as const;

// ─── Community Users (legacy alias) ──────────────────────────────────────────
export const communityUsers = pgTable("community_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

export const insertCommunityUserSchema = createInsertSchema(communityUsers).omit({ id: true });
export type InsertCommunityUser = z.infer<typeof insertCommunityUserSchema>;
export type CommunityUser = typeof communityUsers.$inferSelect;

// ─── Threads ─────────────────────────────────────────────────────────────────
export const threads = pgTable("threads", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  authorUsername: text("author_username").notNull(),
  category: text("category").notNull().default("general"), // "general" | "artist" | "beef" | "goat" | "analysis"
  artistTag: text("artist_tag"), // optional: artist slug this thread is about
  resultId: text("result_id"),   // optional: links thread to a specific analysis/comparison
  resultType: text("result_type"), // "solo" | "battle" | null
  resultLabel: text("result_label"), // e.g. "Twinz — Verse 1 (42.7)" — denormalized for display
  replyCount: integer("reply_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const insertThreadSchema = createInsertSchema(threads).omit({ id: true, replyCount: true });
export type InsertThread = z.infer<typeof insertThreadSchema>;
export type Thread = typeof threads.$inferSelect;

// ─── Posts (replies) ──────────────────────────────────────────────────────────
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  body: text("body").notNull(),
  authorUsername: text("author_username").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const insertPostSchema = createInsertSchema(posts).omit({ id: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;
