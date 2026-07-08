import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { scoreComparison, analyzeVerseSolo } from "./scoring/scoreComparison";
import { MOCK_ARTISTS } from "./mockData";
import type { CompareRequest } from "@shared/schema";
import { runIntegrityCheck } from "./integrity";

// ── Scoring version — bump when formula changes significantly ─────────────────
const SCORING_VERSION = "v4";

// ── Title-case helper for artist names and song titles ────────────────────────
function toTitleCase(s: string): string {
  if (!s) return s;
  const MINORS = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','is','it','if']);
  // Known all-caps rapper names / acronyms that must NOT be lowercased
  const PRESERVE_CAPS = new Set(['JID','DMX','AZ','BIG','UGK','TDE','NYC','LA','DJ','MC','OG','RZA','GZA','MF','MCA','BDP','KRS','NWA','EPMD','LL','JAY','WC']);
  const PRESERVE_HYPHENATED: Record<string,string> = { 'mach-hommy': 'Mach-Hommy' };
  // Check full string against hyphenated lookup first
  const fullLower = s.trim().toLowerCase();
  if (PRESERVE_HYPHENATED[fullLower]) return PRESERVE_HYPHENATED[fullLower];
  return s.trim().replace(/\w\S*/g, (word, offset) => {
    // Preserve known all-caps names and acronyms (2-5 all-uppercase letters)
    const upper = word.toUpperCase();
    if (PRESERVE_CAPS.has(upper) || (word === upper && word.length >= 2 && word.length <= 5 && /^[A-Z]+$/.test(word))) {
      return upper; // keep fully uppercase
    }
    const lower = word.toLowerCase();
    if (offset === 0 || !MINORS.has(lower)) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return lower;
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {

  // ── POST /api/score ───────────────────────────────────────────────────────
  // Input sanitization helpers
  function sanitizeText(input: unknown, maxLength: number): string {
    if (typeof input !== "string") return "";
    return input
      .replace(/<[^>]*>/g, "")
      .replace(/[\x00-\x08\x0b-\x1f]/g, "")
      .trim()
      .slice(0, maxLength);
  }

  function validateWeights(w: unknown): { flow: number; wordplay: number; storytelling: number; rhyming: number; punchlines: number } | null {
    if (!w || typeof w !== "object") return null;
    const wObj = w as Record<string, unknown>;
    const keys = ["flow", "wordplay", "storytelling", "rhyming", "punchlines"];
    for (const k of keys) {
      if (typeof wObj[k] !== "number" || isNaN(wObj[k] as number) || (wObj[k] as number) < 0) return null;
    }
    const total = keys.reduce((s, k) => s + (wObj[k] as number), 0);
    if (total <= 0) return null;
    return {
      flow: wObj.flow as number,
      wordplay: wObj.wordplay as number,
      storytelling: wObj.storytelling as number,
      rhyming: wObj.rhyming as number,
      punchlines: wObj.punchlines as number,
    };
  }

  app.post("/api/score", async (req, res) => {
    try {
      // Sanitize all text inputs with length limits
      const artistA    = sanitizeText(req.body?.artistA, 100);
      const songA      = sanitizeText(req.body?.songA, 150);
      const verseA     = sanitizeText(req.body?.verseA, 8000);
      const artistB    = sanitizeText(req.body?.artistB, 100);
      const songB      = sanitizeText(req.body?.songB, 150);
      const verseB     = sanitizeText(req.body?.verseB, 8000);
      const verseLabelA = sanitizeText(req.body?.verseLabelA, 50);
      const verseLabelB = sanitizeText(req.body?.verseLabelB, 50);
      const scoringMode = req.body?.scoringMode === "custom" ? "custom" : "standard";
      const rawWeights  = validateWeights(req.body?.weights);
      const isCustom    = scoringMode === "custom" && rawWeights !== null;

      // Validate required fields
      if (!artistA || !songA || !artistB || !songB) {
        return res.status(400).json({ error: "Artist name and song title are required for both sides." });
      }

      // Verse is optional — use name-based placeholder if not provided
      const effectiveVerseA = verseA.length >= 5 ? verseA : `[No verse provided for ${artistA} on ${songA}]`;
      const effectiveVerseB = verseB.length >= 5 ? verseB : `[No verse provided for ${artistB} on ${songB}]`;

      // Run scoring engine (stateless — each call is isolated)
      const finalResult = scoreComparison({
        artistA, songA, verseA: effectiveVerseA,
        artistB, songB, verseB: effectiveVerseB,
        weights: isCustom ? rawWeights! : undefined,
      });

      const resultWithMode = {
        ...finalResult,
        scoringMode: isCustom ? "custom" : "standard",
        customWeights: isCustom ? rawWeights : null,
      };

      // Persist result — DB failure is non-fatal, user still gets their result
      const cleanArtistA = toTitleCase(artistA);
      const cleanSongA   = toTitleCase(songA);
      const cleanArtistB = toTitleCase(artistB);
      const cleanSongB   = toTitleCase(songB);
      try {
        await storage.saveComparison({
          resultId: finalResult.resultId,
          artistAName: cleanArtistA,
          songAName: cleanSongA,
          verseA: effectiveVerseA,
          verseLabelA: verseLabelA || null,
          artistBName: cleanArtistB,
          songBName: cleanSongB,
          verseB: effectiveVerseB,
          verseLabelB: verseLabelB || null,
          winner: finalResult.winner,
          winnerName: finalResult.winnerName,
          confidence: finalResult.confidence,
          scoreA: finalResult.artistA.scores.overall,
          scoreB: finalResult.artistB.scores.overall,
          scoringMode: isCustom ? `custom-${SCORING_VERSION}` : `standard-${SCORING_VERSION}`,
          customWeights: isCustom ? JSON.stringify(rawWeights) : null,
          resultJson: JSON.stringify(resultWithMode),
          createdAt: Date.now(),
        });
      } catch (dbErr: any) {
        console.error("DB write error (non-fatal):", dbErr?.message ?? dbErr);
      }

      res.json(resultWithMode);
      return;
    } catch (err: any) {
      console.error("Scoring error:", err?.message ?? err);
      res.status(500).json({
        error: "Scoring failed. Please check your inputs and try again.",
        detail: err?.message ?? "Unknown error",
      });
    }
  });

  // -- POST /api/analyze (Solo Analysis) ------------------------------------
  app.post("/api/analyze", async (req, res) => {
    try {
      const artistName = sanitizeText(req.body?.artistName, 100);
      const songName   = sanitizeText(req.body?.songName, 150);
      const verse      = sanitizeText(req.body?.verse, 8000);
      const verseLabel = sanitizeText(req.body?.verseLabel, 50);
      const scoringMode = req.body?.scoringMode === "custom" ? "custom" : "standard";
      const rawWeights  = validateWeights(req.body?.weights);
      const isCustom    = scoringMode === "custom" && rawWeights !== null;

      if (!artistName || !songName) {
        return res.status(400).json({ error: "Artist name and song title are required." });
      }

      const effectiveVerse = verse.length >= 5 ? verse : `[No verse provided for ${artistName} on ${songName}]`;

      const result = analyzeVerseSolo({
        artistName, songName,
        verseLabel: verseLabel || undefined,
        verse: effectiveVerse,
        weights: isCustom ? rawWeights! : undefined,
      });

      try {
        const cleanArtistName = toTitleCase(artistName);
        const cleanSongName   = toTitleCase(songName);
        await storage.saveAnalysis({
          resultId: result.resultId,
          artistName: cleanArtistName,
          songName: cleanSongName,
          verseLabel: verseLabel || null,
          verse: effectiveVerse,
          scoringMode: isCustom ? `custom-${SCORING_VERSION}` : `standard-${SCORING_VERSION}`,
          customWeights: isCustom ? JSON.stringify(rawWeights) : null,
          resultJson: JSON.stringify(result),
          scoreOverall: result.scores.overall,
          scoreFlow: result.scores.flow,
          scoreWordplay: result.scores.wordplay,
          scoreStorytelling: result.scores.storytelling,
          scoreRhyming: result.scores.rhyming,
          scorePunchlines: result.scores.punchlines,
          createdAt: Date.now(),
        });
      } catch (dbErr: any) {
        console.error("Analysis DB write error (non-fatal):", dbErr?.message ?? dbErr);
      }

      res.json(result);
    } catch (err: any) {
      console.error("Analysis error:", err?.message ?? err);
      res.status(500).json({ error: "Analysis failed.", detail: err?.message });
    }
  });

  // -- GET /api/verses/search?q=&artist=&limit= --------------------------------
  app.get("/api/verses/search", async (req, res) => {
    try {
      const q = (req.query.q as string) ?? "";
      const artist = (req.query.artist as string) ?? "";
      const limit = Math.min(parseInt((req.query.limit as string) ?? "10", 10), 25);
      const results = await storage.searchVerses(q, artist, limit);
      res.json(results.map(a => ({
        resultId: a.resultId,
        artistName: a.artistName,
        songName: a.songName,
        verseLabel: a.verseLabel,
        verse: a.verse,
        scoreOverall: a.scoreOverall,
        scoreFlow: a.scoreFlow,
        scoreWordplay: a.scoreWordplay,
        scoreStorytelling: a.scoreStorytelling,
        scoreRhyming: a.scoreRhyming,
        scorePunchlines: a.scorePunchlines,
        createdAt: a.createdAt,
      })));
    } catch (err) {
      res.status(500).json({ error: "Search failed." });
    }
  });

  // -- GET /api/verses/artists ------------------------------------------------
  app.get("/api/verses/artists", async (_req, res) => {
    try {
      const artists = await storage.getDistinctArtists();
      res.json(artists);
    } catch (err) {
      res.status(500).json({ error: "Failed to load artists." });
    }
  });

  // -- GET /api/analysis/:id ------------------------------------------------
  app.get("/api/analysis/:id", async (req, res) => {
    try {
      const analysis = await storage.getAnalysis(req.params.id);
      if (!analysis) return res.status(404).json({ error: "Analysis not found." });
      res.json(JSON.parse(analysis.resultJson));
    } catch (err) {
      res.status(500).json({ error: "Failed to load analysis." });
    }
  });

  // ── GET /api/results/:id ──────────────────────────────────────────────────
  // Checks both comparisons (battle) and analyses (solo) tables
  app.get("/api/results/:id", async (req, res) => {
    try {
      const id = req.params.id;
      // Try battle comparison first
      const comparison = await storage.getComparison(id);
      if (comparison) {
        return res.json({ type: "battle", ...JSON.parse(comparison.resultJson) });
      }
      // Fall back to solo analysis
      const analysis = await storage.getAnalysis(id);
      if (analysis) {
        return res.json({ type: "solo", ...JSON.parse(analysis.resultJson) });
      }
      return res.status(404).json({ error: "Result not found." });
    } catch (err) {
      res.status(500).json({ error: "Failed to load result." });
    }
  });

  // ── GET /api/rappers ──────────────────────────────────────────────────────
  app.get("/api/rappers", (req, res) => {
    const query = (req.query.q as string ?? "").toLowerCase();
    const filtered = query
      ? MOCK_ARTISTS.filter(a =>
          a.name.toLowerCase().includes(query) ||
          a.hometown.toLowerCase().includes(query) ||
          a.era.toLowerCase().includes(query)
        )
      : MOCK_ARTISTS;
    res.json(filtered);
  });

  // ── GET /api/rappers/:slug ────────────────────────────────────────────────
  app.get("/api/rappers/:slug", (req, res) => {
    const artist = MOCK_ARTISTS.find(a => a.slug === req.params.slug);
    if (!artist) return res.status(404).json({ error: "Artist not found." });
    res.json(artist);
  });

  // ── GET /api/leaderboard ──────────────────────────────────────────────────
  app.get("/api/leaderboard", async (req, res) => {
    const category = (req.query.category as string) ?? "overall";
    const sortBy = (req.query.sortBy as string) ?? "score"; // "score" | "winRate" | "comparisons"

    // Leaderboard ONLY uses standard scoring mode comparisons
    const dynamic = await storage.getDynamicLeaderboard(category, 200);

    if (dynamic.length > 0) {
      // Apply secondary sort if requested
      let sorted = [...dynamic];
      if (sortBy === "winRate") sorted.sort((a, b) => b.winRate - a.winRate);
      else if (sortBy === "comparisons") sorted.sort((a, b) => b.comparisons - a.comparisons);
      else if (sortBy === "bestScore") sorted.sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));
      // re-rank after sort
      sorted = sorted.map((e, i) => ({ ...e, rank: i + 1 }));
      return res.json(sorted);
    }

    // Fallback: empty — no mock data, encourage real comparisons
    res.json([]);
  });

  // ── GET /api/artist-verses ─────────────────────────────────────────────────
  // Returns all verses (battles + solos) for a given artist name
  app.get("/api/artist-verses", async (req, res) => {
    try {
      const name = (req.query.name as string ?? "").trim();
      if (!name) return res.status(400).json({ error: "Artist name required." });
      const verses = await storage.getArtistVerses(name);
      res.json(verses);
    } catch (err) {
      console.error("Artist verses error:", err);
      res.status(500).json({ error: "Failed to load artist verses." });
    }
  });

  // ── GET /api/recent ───────────────────────────────────────────────────────
  app.get("/api/recent", async (req, res) => {
    const recent = await storage.getRecentComparisons(10);
    res.json(recent.map(c => ({
      resultId: c.resultId,
      artistA: c.artistAName,
      songA: c.songAName,
      verseLabelA: (c as any).verseLabelA || null,
      artistB: c.artistBName,
      songB: c.songBName,
      verseLabelB: (c as any).verseLabelB || null,
      winner: c.winner,
      winnerName: c.winnerName,
      scoreA: c.scoreA,
      scoreB: c.scoreB,
      createdAt: c.createdAt,
    })));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNITY ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /api/community/register ─────────────────────────────────────────
  app.post("/api/community/register", async (req, res) => {
    try {
      const { username } = req.body;
      if (!username || typeof username !== "string" || username.trim().length < 2) {
        return res.status(400).json({ error: "Username must be at least 2 characters." });
      }
      const clean = username.trim().replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 24);
      if (clean.length < 2) return res.status(400).json({ error: "Username can only contain letters, numbers, underscores, hyphens." });

      const existing = await storage.getUserByUsername(clean);
      if (existing) return res.status(409).json({ error: "Username already taken." });

      const user = await storage.createUser(clean);
      res.json(user);
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ error: "Registration failed." });
    }
  });

  // ── GET /api/community/check-username ────────────────────────────────────
  app.get("/api/community/check-username", async (req, res) => {
    const username = (req.query.username as string ?? "").trim();
    if (!username) return res.json({ available: false });
    const existing = await storage.getUserByUsername(username);
    res.json({ available: !existing });
  });

  // ── GET /api/community/threads ────────────────────────────────────────────
  app.get("/api/community/threads", async (req, res) => {
    const category = req.query.category as string | undefined;
    const allThreads = await storage.getThreads(category);
    res.json(allThreads);
  });

  // ── POST /api/community/threads ───────────────────────────────────────────
  app.post("/api/community/threads", async (req, res) => {
    try {
      const { title, body, authorUsername, category, artistTag } = req.body;
      if (!title?.trim() || !body?.trim() || !authorUsername?.trim()) {
        return res.status(400).json({ error: "Title, body, and username are required." });
      }
      const validCategories = ["general", "artist", "beef", "goat"];
      const cat = validCategories.includes(category) ? category : "general";

      const thread = await storage.createThread({
        title: title.trim().slice(0, 120),
        body: body.trim().slice(0, 5000),
        authorUsername: authorUsername.trim(),
        category: cat,
        artistTag: artistTag?.trim() || null,
        createdAt: Date.now(),
      });
      res.json(thread);
    } catch (err) {
      console.error("Thread create error:", err);
      res.status(500).json({ error: "Failed to create thread." });
    }
  });

  // ── GET /api/community/threads/:id ───────────────────────────────────────
  app.get("/api/community/threads/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid thread ID." });
    const thread = await storage.getThread(id);
    if (!thread) return res.status(404).json({ error: "Thread not found." });
    const threadPosts = await storage.getPostsByThread(id);
    res.json({ thread, posts: threadPosts });
  });

  // ── POST /api/community/threads/:id/reply ────────────────────────────────
  app.post("/api/community/threads/:id/reply", async (req, res) => {
    try {
      const threadId = parseInt(req.params.id);
      if (isNaN(threadId)) return res.status(400).json({ error: "Invalid thread ID." });
      const { body, authorUsername } = req.body;
      if (!body?.trim() || !authorUsername?.trim()) {
        return res.status(400).json({ error: "Reply body and username are required." });
      }
      const thread = await storage.getThread(threadId);
      if (!thread) return res.status(404).json({ error: "Thread not found." });

      const post = await storage.createPost({
        threadId,
        body: body.trim().slice(0, 3000),
        authorUsername: authorUsername.trim(),
        createdAt: Date.now(),
      });
      res.json(post);
    } catch (err) {
      console.error("Reply error:", err);
      res.status(500).json({ error: "Failed to post reply." });
    }
  });

  // ── GET /api/rappers/search/live ──────────────────────────────────────────
  // Returns artists from BOTH analyses + comparisons with full category breakdowns
    // ── GET /api/community/results/:resultId/comments ────────────────────────
  app.get("/api/community/results/:resultId/comments", async (req, res) => {
    try {
      const allThreads = await storage.getThreads("analysis");
      const linked = allThreads
        .filter((t: any) => t.resultId === req.params.resultId)
        .sort((a: any, b: any) => b.createdAt - a.createdAt);
      res.json(linked.map((t: any) => ({
        id: t.id,
        body: t.body,
        authorUsername: t.authorUsername,
        replyCount: t.replyCount,
        createdAt: t.createdAt,
        resultLabel: t.resultLabel,
      })));
    } catch (err) {
      res.status(500).json({ error: "Failed to load comments." });
    }
  });

  // ── POST /api/community/results/:resultId/comments ────────────────────────
  app.post("/api/community/results/:resultId/comments", async (req, res) => {
    try {
      const { body, authorUsername, resultType, resultLabel } = req.body;
      const resultId = req.params.resultId;
      if (!body?.trim() || !authorUsername?.trim()) {
        return res.status(400).json({ error: "Comment and username required." });
      }
      const user = await storage.getUserByUsername(authorUsername.trim());
      if (!user) return res.status(403).json({ error: "Register in the Community tab first to comment." });

      const thread = await storage.createThread({
        title: resultLabel ?? "Analysis Comment",
        body: body.trim().slice(0, 3000),
        authorUsername: authorUsername.trim(),
        category: "analysis",
        artistTag: null,
        resultId,
        resultType: resultType ?? null,
        resultLabel: resultLabel ?? null,
        createdAt: Date.now(),
      } as any);
      res.json(thread);
    } catch (err) {
      console.error("Comment post error:", err);
      res.status(500).json({ error: "Failed to post comment." });
    }
  });

  // ── GET /api/community/analysis-threads ──────────────────────────────────
  app.get("/api/community/analysis-threads", async (req, res) => {
    try {
      const all = await storage.getThreads("analysis");
      res.json(all.sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, 50));
    } catch (err) {
      res.status(500).json({ error: "Failed to load analysis threads." });
    }
  });

  app.get("/api/rappers/search/live", async (req, res) => {
    try {
      const query = ((req.query.q as string) ?? "").toLowerCase();
      const trending = req.query.trending === "1"; // if true, return top 10 by 24h activity
      const toSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const toTitleCase = (s: string) => s.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      const BLOCKLIST = new Set([
        'test','asdf','aaa','xxx','zzz','foo','bar','baz','qwerty',
        'kendrick lemar','kendrick lamaar','kendrick lamer','kdot','k dot',
        'drake aubrey','aubrey drake','drak','jay z','jayz',
      ]);

      const artistMap: Record<string, {
        name: string; slug: string;
        totalScore: number; flow: number; wordplay: number;
        storytelling: number; rhyming: number; punchlines: number;
        count: number; recentCount: number; battleCount: number; wins: number; losses: number;
        tracks: Array<{ song: string; score: number }>;
      }> = {};

      const upsert = (name: string, scores: any, win: boolean | null, createdAt: number, isBattle: boolean = true, songName?: string) => {
        if (!name?.trim()) return;
        const key = name.toLowerCase().trim();
        if (BLOCKLIST.has(key)) return;
        const slug = toSlug(name);
        if (!artistMap[slug]) {
          artistMap[slug] = { name: toTitleCase(name), slug, totalScore: 0, flow: 0, wordplay: 0, storytelling: 0, rhyming: 0, punchlines: 0, count: 0, recentCount: 0, battleCount: 0, wins: 0, losses: 0, tracks: [] };
        }
        const e = artistMap[slug];
        e.totalScore += scores?.overall ?? 0;
        e.flow += scores?.flow ?? 0;
        e.wordplay += scores?.wordplay ?? 0;
        e.storytelling += scores?.storytelling ?? 0;
        e.rhyming += scores?.rhyming ?? 0;
        e.punchlines += scores?.punchlines ?? 0;
        e.count += 1;
        if (createdAt >= oneDayAgo) e.recentCount += 1;
        if (isBattle) {
          e.battleCount += 1;
          if (win === true) e.wins += 1;
          else if (win === false) e.losses += 1;
          // null = TIE, battleCount still increments
        }
        // Track analyzed songs (deduplicated by song name)
        if (songName?.trim()) {
          const normalSong = toTitleCase(songName.trim());
          if (!e.tracks.some(t => t.song.toLowerCase() === normalSong.toLowerCase())) {
            e.tracks.push({ song: normalSong, score: Math.round((scores?.overall ?? 0) * 10) / 10 });
          }
        }
      };

      // Pull comparisons + analyses in parallel
      const [allComparisons, allAnalyses] = await Promise.all([
        storage.getRecentComparisons(1000),
        storage.getRecentAnalyses(1000),
      ]);

      // -- Battle comparisons: use DB columns for names/winner, JSON for category scores --
      for (const c of allComparisons) {
        const cMode = c.scoringMode ?? "standard";
        if (cMode !== "standard" && cMode !== `standard-${SCORING_VERSION}`) continue;
        let aScores: any = null;
        let bScores: any = null;
        try {
          const parsed = JSON.parse((c as any).resultJson);
          aScores = parsed?.artistA?.scores ?? null;
          bScores = parsed?.artistB?.scores ?? null;
        } catch { /* use nulls */ }
        const ts = typeof c.createdAt === "number" ? c.createdAt : Date.parse(c.createdAt as any);
        // Use DB columns for names and winner — authoritative
        const aWinFlag = c.winner === "TIE" ? null : c.winner === "A" ? true : false;
        const bWinFlag = c.winner === "TIE" ? null : c.winner === "B" ? true : false;
        upsert(c.artistAName, aScores ?? { overall: c.scoreA }, aWinFlag, ts, true, c.songAName);
        upsert(c.artistBName, bScores ?? { overall: c.scoreB }, bWinFlag, ts, true, c.songBName);
      }

      // -- Solo analyses: use stored score columns --
      for (const a of allAnalyses) {
        const aMode = a.scoringMode ?? "standard";
        if (aMode !== "standard" && aMode !== `standard-${SCORING_VERSION}`) continue;
        const ts = typeof a.createdAt === "number" ? a.createdAt : Date.parse(a.createdAt as any);
        upsert(a.artistName, {
          overall: a.scoreOverall,
          flow: a.scoreFlow,
          wordplay: a.scoreWordplay,
          storytelling: a.scoreStorytelling,
          rhyming: a.scoreRhyming,
          punchlines: a.scorePunchlines,
        }, null, ts, false, a.songName);
      }

      let results = Object.values(artistMap)
        .filter(e => e.count > 0)
        .map(e => ({
          name: e.name,
          slug: e.slug,
          comparisons: e.count,
          recentCount: e.recentCount,
          battleCount: e.battleCount,
          wins: e.wins,
          losses: e.losses,
          winRate: e.battleCount > 0 ? Math.round((e.wins / e.battleCount) * 100) : 0,
          avgScore:        e.count > 0 ? Math.round((e.totalScore   / e.count) * 10) / 10 : 0,
          avgFlow:         e.count > 0 ? Math.round((e.flow         / e.count) * 10) / 10 : 0,
          avgWordplay:     e.count > 0 ? Math.round((e.wordplay     / e.count) * 10) / 10 : 0,
          avgStorytelling: e.count > 0 ? Math.round((e.storytelling / e.count) * 10) / 10 : 0,
          avgRhyming:      e.count > 0 ? Math.round((e.rhyming      / e.count) * 10) / 10 : 0,
          avgPunchlines:   e.count > 0 ? Math.round((e.punchlines   / e.count) * 10) / 10 : 0,
          tracks: e.tracks.sort((a, b) => b.score - a.score).slice(0, 5), // top 5 by score
        }));

      if (query) {
        // Search mode: filter by name, return up to 50 sorted by avg score
        results = results.filter(a => a.name.toLowerCase().includes(query));
        results.sort((a, b) => b.avgScore - a.avgScore);
        return res.json(results.slice(0, 50));
      }

      if (trending) {
        // Trending mode: top 10 by 24h activity, fall back to all-time if <10 recent
        const hasRecent = results.some(r => r.recentCount > 0);
        if (hasRecent) {
          results = results.filter(r => r.recentCount > 0);
          results.sort((a, b) => b.recentCount - a.recentCount);
        } else {
          results.sort((a, b) => b.comparisons - a.comparisons);
        }
        return res.json(results.slice(0, 10));
      }

      // Default: sort by avg score, cap at 50
      results.sort((a, b) => b.avgScore - a.avgScore);
      res.json(results.slice(0, 50));
    } catch (err: any) {
      console.error("Live search error:", err?.message);
      res.status(500).json({ error: "Search failed." });
    }
  });

  // ── GET /api/rappers/:slug/live ───────────────────────────────────────────
  // Computes a live artist profile from real DB data (battles + solo analyses)
  app.get("/api/rappers/:slug/live", async (req, res) => {
    try {
      const slug = req.params.slug;
      const toSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

      // Pull both battles and solos in parallel
      const [allComparisons, allAnalyses] = await Promise.all([
        storage.getRecentComparisons(1000),
        storage.getRecentAnalyses(1000),
      ]);

      const matchedComparisons = allComparisons.filter(c =>
        toSlug(c.artistAName) === slug || toSlug(c.artistBName) === slug
      );
      const matchedAnalyses = allAnalyses.filter(a => toSlug(a.artistName) === slug);

      if (matchedComparisons.length === 0 && matchedAnalyses.length === 0) {
        return res.status(404).json({ error: "No data found for this artist." });
      }

      // Figure out the canonical name — prefer battle data, fall back to solos
      let canonicalName: string;
      if (matchedComparisons.length > 0) {
        const firstMatch = matchedComparisons[0];
        canonicalName = toSlug(firstMatch.artistAName) === slug ? firstMatch.artistAName : firstMatch.artistBName;
      } else {
        canonicalName = matchedAnalyses[0].artistName;
      }

      // Aggregate stats — battles + solos both contribute to score averages
      let wins = 0, losses = 0, ties = 0;
      let totalFlow = 0, totalWordplay = 0, totalStorytelling = 0, totalRhyming = 0, totalPunchlines = 0, totalOverall = 0;
      let scoreCount = 0; // separate from matchup count — solos count for averages
      let bestScore = 0;
      let bestVerseTitle = "";
      let bestVerseLabel = "";
      const analyzedTracks: { song: string; score: number; resultId?: string }[] = [];

      const recentMatchups: any[] = [];

      for (const c of matchedComparisons) {
        let result: any;
        try { result = JSON.parse(c.resultJson); } catch { continue; }

        const isSideA = toSlug(c.artistAName) === slug;
        const myScores = isSideA ? result.artistA?.scores : result.artistB?.scores;
        const oppName = isSideA ? c.artistBName : c.artistAName;
        const oppScore = isSideA ? c.scoreB : c.scoreA;
        const myScore = isSideA ? c.scoreA : c.scoreB;
        const verseSong = isSideA ? c.songAName : c.songBName;
        const verseLabel = isSideA ? (c as any).verseLabelA : (c as any).verseLabelB;

        if (!myScores) continue;

        totalFlow += myScores.flow ?? 0;
        totalWordplay += myScores.wordplay ?? 0;
        totalStorytelling += myScores.storytelling ?? 0;
        totalRhyming += myScores.rhyming ?? 0;
        totalPunchlines += myScores.punchlines ?? 0;
        totalOverall += myScores.overall ?? 0;
        scoreCount++;

        if ((myScores.overall ?? 0) > bestScore) {
          bestScore = myScores.overall ?? 0;
          bestVerseTitle = verseSong;
          bestVerseLabel = verseLabel || "";
        }

        if (verseSong?.trim()) {
          const norm = verseSong.trim();
          if (!analyzedTracks.some(t => t.song.toLowerCase() === norm.toLowerCase())) {
            analyzedTracks.push({ song: norm, score: Math.round((myScores.overall ?? 0) * 10) / 10, resultId: c.resultId });
          }
        }

        const myResult = result.winner === "TIE" ? "TIE"
          : (isSideA && result.winner === "A") || (!isSideA && result.winner === "B") ? "W" : "L";
        if (myResult === "W") wins++;
        else if (myResult === "L") losses++;
        else ties++;

        recentMatchups.push({
          resultId: c.resultId,
          opponent: oppName,
          opponentSong: isSideA ? c.songBName : c.songAName,
          song: verseSong,
          verseLabel: verseLabel || null,
          myScore: Math.round(myScore * 10) / 10,
          oppScore: Math.round(oppScore * 10) / 10,
          result: myResult,
          date: c.createdAt,
        });
      }

      // Solo analyses — contribute to score averages and track list, not W/L
      for (const a of matchedAnalyses) {
        const overall = a.scoreOverall ?? 0;
        totalFlow += a.scoreFlow ?? 0;
        totalWordplay += a.scoreWordplay ?? 0;
        totalStorytelling += a.scoreStorytelling ?? 0;
        totalRhyming += a.scoreRhyming ?? 0;
        totalPunchlines += a.scorePunchlines ?? 0;
        totalOverall += overall;
        scoreCount++;

        if (overall > bestScore) {
          bestScore = overall;
          bestVerseTitle = a.songName ?? "";
          bestVerseLabel = a.verseLabel ?? "";
        }

        if (a.songName?.trim()) {
          const norm = a.songName.trim();
          if (!analyzedTracks.some(t => t.song.toLowerCase() === norm.toLowerCase())) {
            analyzedTracks.push({ song: norm, score: Math.round(overall * 10) / 10, resultId: a.resultId });
          }
        }
      }

      const n = scoreCount;
      const liveProfile = {
        name: canonicalName,
        slug,
        isLive: true,
        wins,
        losses,
        ties,
        totalComparisons: matchedComparisons.length + matchedAnalyses.length,
        totalVerses: n,
        winRate: matchedComparisons.length > 0 ? Math.round((wins / matchedComparisons.length) * 100) : 0,
        overallAverage: n > 0 ? Math.round((totalOverall / n) * 10) / 10 : 0,
        categoryAverages: {
          flow: n > 0 ? Math.round((totalFlow / n) * 10) / 10 : 0,
          wordplay: n > 0 ? Math.round((totalWordplay / n) * 10) / 10 : 0,
          storytelling: n > 0 ? Math.round((totalStorytelling / n) * 10) / 10 : 0,
          rhyming: n > 0 ? Math.round((totalRhyming / n) * 10) / 10 : 0,
          punchlines: n > 0 ? Math.round((totalPunchlines / n) * 10) / 10 : 0,
        },
        bestVerseScore: Math.round(bestScore * 10) / 10,
        bestVerseTitle,
        bestVerseLabel,
        analyzedTracks: analyzedTracks.sort((a, b) => b.score - a.score).slice(0, 10),
        recentMatchups: recentMatchups.sort((a, b) => b.date - a.date).slice(0, 10),
      };

      res.json(liveProfile);
    } catch (err) {
      console.error("Live profile error:", err);
      res.status(500).json({ error: "Failed to build live profile." });
    }
  });

  // ── Admin: on-demand integrity check ──────────────────────────────────────
  app.post("/api/admin/integrity-check", async (_req, res) => {
    try {
      const report = await runIntegrityCheck();
      console.log(`[integrity] Manual run: removed ${report.total_removed} bad rows.`);
      res.json({ success: true, report });
    } catch (err) {
      console.error("[integrity] Manual check failed:", err);
      res.status(500).json({ error: "Integrity check failed." });
    }
  });

  // ── Admin: view current DB health (non-destructive) ───────────────────────
  app.get("/api/admin/db-health", async (_req, res) => {
    try {
      const { db } = await import("./storage");
      const { analyses, comparisons } = await import("@shared/schema");
      const { sql, count } = await import("drizzle-orm");

      const [analysisCount] = await db.select({ count: count() }).from(analyses).all
        ? db.select({ count: count() }).from(analyses)
        : [];

      // Use raw SQL for complex health check
      const { Pool } = await import("pg");
      const p = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      });

      const health = await p.query(`
        SELECT
          (SELECT COUNT(*) FROM analyses) AS total_analyses,
          (SELECT COUNT(*) FROM analyses WHERE LENGTH(TRIM(verse)) < 20) AS short_verse_count,
          (SELECT COUNT(*) FROM analyses WHERE verse ILIKE '[No verse provided%' OR verse ILIKE '(No verse%') AS placeholder_count,
          (SELECT COUNT(*) FROM comparisons) AS total_comparisons,
          (SELECT COUNT(DISTINCT LOWER(TRIM(artist_name))) FROM analyses) AS unique_artists,
          (SELECT MAX(created_at) FROM analyses) AS last_analysis_at,
          (SELECT MAX(created_at) FROM comparisons) AS last_comparison_at;
      `);

      await p.end();
      res.json({ success: true, health: health.rows[0] });
    } catch (err) {
      console.error("[db-health] failed:", err);
      res.status(500).json({ error: "DB health check failed." });
    }
  });


}
