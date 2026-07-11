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
import { eq, desc, ilike, and, or } from "drizzle-orm";

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
  searchVerses(q: string, artist: string, limit: number): Promise<Analysis[]>;
  getDistinctArtists(): Promise<string[]>;

  // Comparisons
  saveComparison(data: InsertComparison): Promise<Comparison>;
  getComparison(resultId: string): Promise<Comparison | undefined>;
  getRecentComparisons(limit: number): Promise<Comparison[]>;
  getDynamicLeaderboard(category: string, limit: number): Promise<any[]>;
  getArtistVerses(artistName: string): Promise<any[]>;

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

  async searchVerses(q: string, artist: string, limit: number = 10): Promise<Analysis[]> {
    let rows: Analysis[];
    const hasQ = q && q.trim().length > 0;
    const hasArtist = artist && artist.trim().length > 0;

    if (hasArtist && hasQ) {
      rows = await db.select().from(analyses)
        .where(and(
          ilike(analyses.artistName, `%${artist.trim()}%`),
          or(
            ilike(analyses.verse, `%${q.trim()}%`),
            ilike(analyses.songName, `%${q.trim()}%`)
          )
        ))
        .orderBy(desc(analyses.createdAt));
    } else if (hasArtist) {
      rows = await db.select().from(analyses)
        .where(ilike(analyses.artistName, `%${artist.trim()}%`))
        .orderBy(desc(analyses.createdAt));
    } else if (hasQ) {
      rows = await db.select().from(analyses)
        .where(or(
          ilike(analyses.artistName, `%${q.trim()}%`),
          ilike(analyses.verse, `%${q.trim()}%`),
          ilike(analyses.songName, `%${q.trim()}%`)
        ))
        .orderBy(desc(analyses.createdAt));
    } else {
      rows = await db.select().from(analyses).orderBy(desc(analyses.createdAt));
    }
    return rows.slice(0, limit);
  }

  async getDistinctArtists(): Promise<string[]> {
    const rows = await db.select({ artistName: analyses.artistName }).from(analyses).orderBy(analyses.artistName);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of rows) {
      const key = r.artistName.toLowerCase().trim();
      if (!seen.has(key)) { seen.add(key); result.push(r.artistName); }
    }
    return result;
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
    const [allComparisons, allAnalyses] = await Promise.all([
      db.select().from(comparisons),
      db.select().from(analyses),
    ]);
    const standardComparisons = allComparisons.filter(c => !c.scoringMode || c.scoringMode === "standard" || c.scoringMode.startsWith("standard-"));
    const NON_VERSE_LABELS = new Set(["hook","chorus","pre_hook","bridge","interlude","intro","outro","spoken","unknown"]);
    const standardAnalyses = allAnalyses.filter(a =>
      (!a.scoringMode || a.scoringMode === "standard" || a.scoringMode.startsWith("standard-")) &&
      a.scoreOverall != null &&
      !NON_VERSE_LABELS.has((a.sectionLabel ?? "").toLowerCase())
    );

    // Title-case helper for display names
    const CANONICAL_NAMES: Record<string,string> = {
      'notorious b.i.g.': 'Notorious B.I.G.', 'notorious big': 'Notorious B.I.G.',
      'biggie smalls': 'Notorious B.I.G.', 'mf doom': 'MF DOOM', 'jid': 'JID',
      'ab-soul': 'Ab-Soul', 'el-p': 'El-P', 'ghostface': 'Ghostface Killah',
      'ghostface killah': 'Ghostface Killah', 'big pun': 'Big Pun',
      'yasiin bey': 'Yasiin Bey', 'mos def': 'Yasiin Bey',
      'your old droog': 'Your Old Droog', 'joell ortiz': 'Joell Ortiz',
      'kool g rap': 'Kool G Rap', 'pharoahe monch': 'Pharoahe Monch',
      'mach-hommy': 'Mach-Hommy', 'j. cole': 'J. Cole', 'jay-z': 'JAY-Z',
      'posdnuos': 'Posdnuos', 'posdnous': 'Posdnuos',
    };
    const toTitleCase = (s: string) => {
      if (!s) return s;
      const key = s.trim().toLowerCase();
      if (CANONICAL_NAMES[key]) return CANONICAL_NAMES[key];
      return s.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    };

    const artistMap: Record<string, {
      artistName: string;
      totalScore: number;
      bestScore: number;   // track best individual score
      flow: number; wordplay: number; storytelling: number; rhyming: number; punchlines: number;
      count: number;        // all entries (battles + solos)
      battleCount: number;  // battles only
      wins: number; losses: number; ties: number;
    }> = {};

    const LEADERBOARD_BLOCKLIST = new Set([
      'test', 'asdf', 'aaa', 'xxx', 'zzz', 'foo', 'bar', 'baz', 'qwerty',
      'kendrick lemar', 'kendrick lamar jr', 'kendrick lamaar', 'kendrick lamer',
      'kendrick lemar lamar', 'kdot', 'k dot',
      'drake aubrey', 'aubrey drake', 'drak',
      'jay z', 'jayz', 'jay-z.',
      'eminem slim', 'slim shady eminem',
      'biggie smalls notorious', 'notorious big', 'biggy',
      'lil wayne weezy', 'weezy f baby',
      'nas nasir', 'nasir jones nas',
    ]);

    // Normalise name for deduplication across entries (e.g. "Kendrick Lamar" vs "kendrick lamar")
    const normKey = (name: string) => name.toLowerCase().trim();

    // win: true=win, false=loss, null=tie/solo
    const upsert = (
      name: string,
      scoreOverall: number,
      flow: number,
      wordplay: number,
      storytelling: number,
      rhyming: number,
      punchlines: number,
      win: boolean | null,
      isBattle: boolean,
    ) => {
      if (!name || !name.trim()) return;
      const key = normKey(name);
      if (LEADERBOARD_BLOCKLIST.has(key)) return;
      if (!artistMap[key]) {
        artistMap[key] = {
          artistName: toTitleCase(name),
          totalScore: 0, bestScore: 0,
          flow: 0, wordplay: 0, storytelling: 0, rhyming: 0, punchlines: 0,
          count: 0, battleCount: 0, wins: 0, losses: 0, ties: 0,
        };
      }
      const e = artistMap[key];
      e.totalScore += scoreOverall;
      if (scoreOverall > e.bestScore) e.bestScore = scoreOverall;
      e.flow += flow;
      e.wordplay += wordplay;
      e.storytelling += storytelling;
      e.rhyming += rhyming;
      e.punchlines += punchlines;
      e.count += 1;
      if (isBattle) {
        e.battleCount += 1;
        if (win === true)  e.wins += 1;
        else if (win === false) e.losses += 1;
        else e.ties += 1;
      }
    };

    // -- Battle comparisons: use direct DB columns, not resultJson parsing --
    for (const c of standardComparisons) {
      // Scores come from resultJson (only for the category breakdown per side)
      // But winner / names come from reliable DB columns
      let resultA: any = null;
      let resultB: any = null;
      try {
        const parsed = JSON.parse(c.resultJson);
        resultA = parsed.artistA;
        resultB = parsed.artistB;
      } catch { /* fall through with null */ }

      const aScores = resultA?.scores ?? null;
      const bScores = resultB?.scores ?? null;

      // Determine W/L from DB column (authoritative)
      const aWon = c.winner === "A";
      const bWon = c.winner === "B";
      // TIE = both get win:null, isBattle:true so battleCount increments but no W/L
      const aWinFlag = c.winner === "TIE" ? null : aWon ? true : false;
      const bWinFlag = c.winner === "TIE" ? null : bWon ? true : false;

      upsert(
        c.artistAName,
        aScores?.overall ?? c.scoreA,
        aScores?.flow ?? 0,
        aScores?.wordplay ?? 0,
        aScores?.storytelling ?? 0,
        aScores?.rhyming ?? 0,
        aScores?.punchlines ?? 0,
        aWinFlag,
        true,
      );
      upsert(
        c.artistBName,
        bScores?.overall ?? c.scoreB,
        bScores?.flow ?? 0,
        bScores?.wordplay ?? 0,
        bScores?.storytelling ?? 0,
        bScores?.rhyming ?? 0,
        bScores?.punchlines ?? 0,
        bWinFlag,
        true,
      );
    }

    // -- Solo analyses: use stored score columns (no JSON parsing needed) --
    for (const a of standardAnalyses) {
      upsert(
        a.artistName,
        a.scoreOverall,
        a.scoreFlow,
        a.scoreWordplay,
        a.scoreStorytelling,
        a.scoreRhyming,
        a.scorePunchlines,
        null,
        false,
      );
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
        case "winRate":     return e.battleCount > 0 ? e.wins / e.battleCount : 0;
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
        avgScore: e.count > 0 ? Math.round((e.totalScore / e.count) * 10) / 10 : 0,
        bestScore: Math.round(e.bestScore * 10) / 10,
        comparisons: e.count,
        wins: e.wins,
        losses: e.losses,
        ties: e.ties,
        battleCount: e.battleCount,
        winRate: e.battleCount > 0 ? Math.round((e.wins / e.battleCount) * 100) : 0,
        category,
      }));
  }

  // Get all verses (both comparisons + analyses) for a given artist name (case-insensitive)
  async getArtistVerses(artistName: string): Promise<any[]> {
    const normName = artistName.toLowerCase().trim();
    const [allComparisons, allAnalyses] = await Promise.all([
      db.select().from(comparisons),
      db.select().from(analyses),
    ]);

    const verses: any[] = [];

    // From comparisons
    for (const c of allComparisons) {
      const isSideA = c.artistAName.toLowerCase().trim() === normName;
      const isSideB = c.artistBName.toLowerCase().trim() === normName;
      if (!isSideA && !isSideB) continue;

      let scores: any = null;
      try {
        const parsed = JSON.parse(c.resultJson);
        scores = isSideA ? parsed.artistA?.scores : parsed.artistB?.scores;
      } catch { /* ignore */ }

      const overall = isSideA ? c.scoreA : c.scoreB;
      const oppName = isSideA ? c.artistBName : c.artistAName;
      const myWinner = c.winner === "TIE" ? "TIE" : (isSideA && c.winner === "A") || (!isSideA && c.winner === "B") ? "W" : "L";

      verses.push({
        type: "battle",
        resultId: c.resultId,
        songName: isSideA ? c.songAName : c.songBName,
        verseLabel: isSideA ? (c as any).verseLabelA || null : (c as any).verseLabelB || null,
        overall: Math.round(overall * 10) / 10,
        flow: Math.round((scores?.flow ?? 0) * 10) / 10,
        wordplay: Math.round((scores?.wordplay ?? 0) * 10) / 10,
        storytelling: Math.round((scores?.storytelling ?? 0) * 10) / 10,
        rhyming: Math.round((scores?.rhyming ?? 0) * 10) / 10,
        punchlines: Math.round((scores?.punchlines ?? 0) * 10) / 10,
        opponent: oppName,
        result: myWinner,
        createdAt: c.createdAt,
      });
    }

    // From solo analyses
    for (const a of allAnalyses) {
      if (a.artistName.toLowerCase().trim() !== normName) continue;
      verses.push({
        type: "solo",
        resultId: a.resultId,
        songName: a.songName,
        verseLabel: a.verseLabel || null,
        overall: Math.round(a.scoreOverall * 10) / 10,
        flow: Math.round(a.scoreFlow * 10) / 10,
        wordplay: Math.round(a.scoreWordplay * 10) / 10,
        storytelling: Math.round(a.scoreStorytelling * 10) / 10,
        rhyming: Math.round(a.scoreRhyming * 10) / 10,
        punchlines: Math.round(a.scorePunchlines * 10) / 10,
        opponent: null,
        result: null,
        createdAt: a.createdAt,
      });
    }

    return verses.sort((a, b) => b.overall - a.overall);
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
