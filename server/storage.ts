import { comparisons, analyses, communityUsers, threads, posts } from "@shared/schema";
import type {
  InsertComparison, Comparison,
  InsertAnalysis, Analysis,
  InsertCommunityUser, CommunityUser,
  InsertThread, Thread,
  InsertPost, Post,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc } from "drizzle-orm";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool);

export interface IStorage {
  // Solo Analyses
  saveAnalysis(data: InsertAnalysis): Promise<Analysis>;
  getAnalysis(resultId: string): Promise<Analysis | undefined>;
  getRecentAnalyses(limit: number): Promise<Analysis[]>;

  // Comparisons
  saveComparison(data: InsertComparison): Promise<Comparison>;
  getComparison(resultId: string): Promise<Comparison | undefined>;
  getRecentComparisons(limit: number): Promise<Comparison[]>;
  getDynamicLeaderboard(category: string, limit: number): Promise<any[]>;

  // Community users
  createUser(username: string): Promise<CommunityUser>;
  getUserByUsername(username: string): Promise<CommunityUser | undefined>;

  // Threads
  createThread(data: InsertThread): Promise<Thread>;
  getThreads(category?: string): Promise<Thread[]>;
  getThread(id: number): Promise<Thread | undefined>;

  // Posts
  createPost(data: InsertPost): Promise<Post>;
  getPostsByThread(threadId: number): Promise<Post[]>;
}

export class DatabaseStorage implements IStorage {
  // Solo Analyses
  async saveAnalysis(data: InsertAnalysis): Promise<Analysis> {
    const rows = await db.insert(analyses).values(data).returning();
    return rows[0];
  }

  async getAnalysis(resultId: string): Promise<Analysis | undefined> {
    const rows = await db.select().from(analyses).where(eq(analyses.resultId, resultId));
    return rows[0];
  }

  async getRecentAnalyses(limit: number): Promise<Analysis[]> {
    const rows = await db.select().from(analyses).orderBy(desc(analyses.createdAt));
    return rows.slice(0, limit);
  }

  // Comparisons
  async saveComparison(data: InsertComparison): Promise<Comparison> {
    const rows = await db.insert(comparisons).values(data).returning();
    return rows[0];
  }

  async getComparison(resultId: string): Promise<Comparison | undefined> {
    const rows = await db.select().from(comparisons).where(eq(comparisons.resultId, resultId));
    return rows[0];
  }

  async getRecentComparisons(limit: number): Promise<Comparison[]> {
    const rows = await db.select().from(comparisons).orderBy(desc(comparisons.createdAt));
    return rows.slice(0, limit);
  }

  async getDynamicLeaderboard(category: string, limit: number = 20): Promise<any[]> {
    const all = await db.select().from(comparisons);
    const standardOnly = all.filter(c => !c.scoringMode || c.scoringMode === "standard");

    const artistMap: Record<string, {
      artistName: string;
      totalScore: number;
      flow: number; wordplay: number; storytelling: number; rhyming: number; punchlines: number;
      count: number; wins: number; losses: number;
    }> = {};

    for (const c of standardOnly) {
      let result: any;
      try { result = JSON.parse(c.resultJson); } catch { continue; }

      const addArtist = (name: string, scores: any, isWinner: boolean) => {
        if (!name) return;
        const key = name.toLowerCase().trim();
        if (!artistMap[key]) {
          artistMap[key] = { artistName: name, totalScore: 0, flow: 0, wordplay: 0, storytelling: 0, rhyming: 0, punchlines: 0, count: 0, wins: 0, losses: 0 };
        }
        const e = artistMap[key];
        e.totalScore += scores?.overall ?? 0;
        e.flow += scores?.flow ?? 0;
        e.wordplay += scores?.wordplay ?? 0;
        e.storytelling += scores?.storytelling ?? 0;
        e.rhyming += scores?.rhyming ?? 0;
        e.punchlines += scores?.punchlines ?? 0;
        e.count += 1;
        if (isWinner) e.wins += 1; else e.losses += 1;
      };

      const aWon = result.winner === "A";
      const bWon = result.winner === "B";
      addArtist(result.artistA?.artistName, result.artistA?.scores, aWon);
      addArtist(result.artistB?.artistName, result.artistB?.scores, bWon);
    }

    const entries = Object.values(artistMap).filter(e => e.count > 0);

    const getSortScore = (e: typeof entries[0]) => {
      switch (category) {
        case "flow":        return e.count > 0 ? e.flow / e.count : 0;
        case "wordplay":    return e.count > 0 ? e.wordplay / e.count : 0;
        case "storytelling": return e.count > 0 ? e.storytelling / e.count : 0;
        case "rhyming":     return e.count > 0 ? e.rhyming / e.count : 0;
        case "punchlines":  return e.count > 0 ? e.punchlines / e.count : 0;
        case "mostCompared": return e.count;
        case "winRate":     return e.count > 0 ? e.wins / e.count : 0;
        default:            return e.count > 0 ? e.totalScore / e.count : 0;
      }
    };

    return entries
      .sort((a, b) => getSortScore(b) - getSortScore(a))
      .slice(0, limit)
      .map((e, i) => ({
        rank: i + 1,
        artistName: e.artistName,
        slug: e.artistName.toLowerCase().replace(/\s+/g, "-"),
        score: Math.round(getSortScore(e) * 10) / 10,
        comparisons: e.count,
        wins: e.wins,
        losses: e.losses,
        winRate: e.count > 0 ? Math.round((e.wins / e.count) * 100) : 0,
        category,
      }));
  }

  // Community Users
  async createUser(username: string): Promise<CommunityUser> {
    const rows = await db.insert(communityUsers).values({ username, createdAt: Date.now() }).returning();
    return rows[0];
  }

  async getUserByUsername(username: string): Promise<CommunityUser | undefined> {
    const rows = await db.select().from(communityUsers).where(eq(communityUsers.username, username));
    return rows[0];
  }

  // Threads
  async createThread(data: InsertThread): Promise<Thread> {
    const rows = await db.insert(threads).values({ ...data, replyCount: 0 }).returning();
    return rows[0];
  }

  async getThreads(category?: string): Promise<Thread[]> {
    const all = await db.select().from(threads);
    const filtered = category && category !== "all" ? all.filter(t => t.category === category) : all;
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getThread(id: number): Promise<Thread | undefined> {
    const rows = await db.select().from(threads).where(eq(threads.id, id));
    return rows[0];
  }

  // Posts
  async createPost(data: InsertPost): Promise<Post> {
    const rows = await db.insert(posts).values(data).returning();
    const post = rows[0];
    const thread = await this.getThread(data.threadId);
    if (thread) {
      await db.update(threads)
        .set({ replyCount: thread.replyCount + 1 })
        .where(eq(threads.id, data.threadId));
    }
    return post;
  }

  async getPostsByThread(threadId: number): Promise<Post[]> {
    const rows = await db.select().from(posts).where(eq(posts.threadId, threadId));
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
}

export const storage = new DatabaseStorage();
