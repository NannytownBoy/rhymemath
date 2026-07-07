import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { scoreComparison, analyzeVerseSolo } from "./scoring/scoreComparison";
import { MOCK_ARTISTS } from "./mockData";
import type { CompareRequest } from "@shared/schema";

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
      try {
        await storage.saveComparison({
          resultId: finalResult.resultId,
          artistAName: artistA,
          songAName: songA,
          verseA: effectiveVerseA,
          verseLabelA: verseLabelA || null,
          artistBName: artistB,
          songBName: songB,
          verseB: effectiveVerseB,
          verseLabelB: verseLabelB || null,
          winner: finalResult.winner,
          winnerName: finalResult.winnerName,
          confidence: finalResult.confidence,
          scoreA: finalResult.artistA.scores.overall,
          scoreB: finalResult.artistB.scores.overall,
          scoringMode: isCustom ? "custom" : "standard",
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
        await storage.saveAnalysis({
          resultId: result.resultId,
          artistName,
          songName,
          verseLabel: verseLabel || null,
          verse: effectiveVerse,
          scoringMode: isCustom ? "custom" : "standard",
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
  app.get("/api/results/:id", async (req, res) => {
    try {
      const comparison = await storage.getComparison(req.params.id);
      if (!comparison) return res.status(404).json({ error: "Result not found." });
      res.json(JSON.parse(comparison.resultJson));
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
    const dynamic = await storage.getDynamicLeaderboard(category, 25);

    if (dynamic.length > 0) {
      // Apply secondary sort if requested
      let sorted = [...dynamic];
      if (sortBy === "winRate") sorted.sort((a, b) => b.winRate - a.winRate);
      else if (sortBy === "comparisons") sorted.sort((a, b) => b.comparisons - a.comparisons);
      // re-rank after sort
      sorted = sorted.map((e, i) => ({ ...e, rank: i + 1 }));
      return res.json(sorted);
    }

    // Fallback: empty — no mock data, encourage real comparisons
    res.json([]);
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

  // ── GET /api/rappers/:slug/live ───────────────────────────────────────────
  // Computes a live artist profile from real comparison data
  app.get("/api/rappers/:slug/live", async (req, res) => {
    try {
      const slug = req.params.slug;
      const all = await storage.getRecentComparisons(1000);

      // Match by slug (normalized name) or direct name match
      const toSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

      const matchedComparisons = all.filter(c =>
        toSlug(c.artistAName) === slug || toSlug(c.artistBName) === slug
      );

      if (matchedComparisons.length === 0) {
        return res.status(404).json({ error: "No comparison data found for this artist." });
      }

      // Figure out the canonical name from the first match
      const firstMatch = matchedComparisons[0];
      const canonicalName = toSlug(firstMatch.artistAName) === slug
        ? firstMatch.artistAName
        : firstMatch.artistBName;

      // Aggregate stats
      let wins = 0, losses = 0, ties = 0;
      let totalFlow = 0, totalWordplay = 0, totalStorytelling = 0, totalRhyming = 0, totalPunchlines = 0, totalOverall = 0;
      let bestScore = 0;
      let bestVerseTitle = "";
      let bestVerseLabel = "";

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

        if ((myScores.overall ?? 0) > bestScore) {
          bestScore = myScores.overall ?? 0;
          bestVerseTitle = verseSong;
          bestVerseLabel = verseLabel || "";
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

      const n = matchedComparisons.length;
      const liveProfile = {
        name: canonicalName,
        slug,
        isLive: true,
        wins,
        losses,
        ties,
        totalComparisons: n,
        winRate: n > 0 ? Math.round((wins / n) * 100) : 0,
        overallAverage: Math.round((totalOverall / n) * 10) / 10,
        categoryAverages: {
          flow: Math.round((totalFlow / n) * 10) / 10,
          wordplay: Math.round((totalWordplay / n) * 10) / 10,
          storytelling: Math.round((totalStorytelling / n) * 10) / 10,
          rhyming: Math.round((totalRhyming / n) * 10) / 10,
          punchlines: Math.round((totalPunchlines / n) * 10) / 10,
        },
        bestVerseScore: Math.round(bestScore * 10) / 10,
        bestVerseTitle,
        bestVerseLabel,
        recentMatchups: recentMatchups.sort((a, b) => b.date - a.date).slice(0, 10),
      };

      res.json(liveProfile);
    } catch (err) {
      console.error("Live profile error:", err);
      res.status(500).json({ error: "Failed to build live profile." });
    }
  });

  // ── GET /api/rappers/search/live ──────────────────────────────────────────
  // Returns artists from BOTH analyses + comparisons with full category breakdowns
  app.get("/api/rappers/search/live", async (req, res) => {
    try {
      const query = ((req.query.q as string) ?? "").toLowerCase();
      const toSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const toTitleCase = (s: string) => s.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

      const BLOCKLIST = new Set([
        'test','asdf','aaa','xxx','zzz','foo','bar','baz','qwerty',
        'kendrick lemar','kendrick lamaar','kendrick lamer','kdot','k dot',
        'drake aubrey','aubrey drake','drak','jay z','jayz',
      ]);

      const artistMap: Record<string, {
        name: string; slug: string;
        totalScore: number; flow: number; wordplay: number;
        storytelling: number; rhyming: number; punchlines: number;
        count: number; battleCount: number; wins: number; losses: number;
      }> = {};

      const upsert = (name: string, scores: any, win: boolean | null) => {
        if (!name?.trim()) return;
        const key = name.toLowerCase().trim();
        if (BLOCKLIST.has(key)) return;
        const slug = toSlug(name);
        if (!artistMap[slug]) {
          artistMap[slug] = { name: toTitleCase(name), slug, totalScore: 0, flow: 0, wordplay: 0, storytelling: 0, rhyming: 0, punchlines: 0, count: 0, battleCount: 0, wins: 0, losses: 0 };
        }
        const e = artistMap[slug];
        e.totalScore += scores?.overall ?? 0;
        e.flow += scores?.flow ?? 0;
        e.wordplay += scores?.wordplay ?? 0;
        e.storytelling += scores?.storytelling ?? 0;
        e.rhyming += scores?.rhyming ?? 0;
        e.punchlines += scores?.punchlines ?? 0;
        e.count += 1;
        if (win === true) { e.wins += 1; e.battleCount += 1; }
        else if (win === false) { e.losses += 1; e.battleCount += 1; }
      };

      // Pull comparisons + analyses in parallel
      const [allComparisons, allAnalyses] = await Promise.all([
        storage.getRecentComparisons(1000),
        storage.getRecentAnalyses(1000),
      ]);

      // -- Battle comparisons --
      for (const c of allComparisons) {
        if (c.scoringMode && c.scoringMode !== "standard") continue;
        let result: any = null;
        try { result = JSON.parse((c as any).resultJson); } catch { continue; }
        const aWon = result?.winner === "A";
        const bWon = result?.winner === "B";
        upsert(result?.artistA?.artistName ?? c.artistAName, result?.artistA?.scores, aWon);
        upsert(result?.artistB?.artistName ?? c.artistBName, result?.artistB?.scores, bWon);
      }

      // -- Solo analyses --
      for (const a of allAnalyses) {
        if (a.scoringMode && a.scoringMode !== "standard") continue;
        let result: any = null;
        try { result = JSON.parse((a as any).resultJson); } catch { continue; }
        upsert(a.artistName, result?.scores, null);
      }

      let results = Object.values(artistMap)
        .filter(e => e.count > 0)
        .map(e => ({
          name: e.name,
          slug: e.slug,
          comparisons: e.count,
          battleCount: e.battleCount,
          wins: e.wins,
          losses: e.losses,
          winRate: e.battleCount > 0 ? Math.round((e.wins / e.battleCount) * 100) : 0,
          avgScore:       e.count > 0 ? Math.round((e.totalScore  / e.count) * 10) / 10 : 0,
          avgFlow:        e.count > 0 ? Math.round((e.flow        / e.count) * 10) / 10 : 0,
          avgWordplay:    e.count > 0 ? Math.round((e.wordplay    / e.count) * 10) / 10 : 0,
          avgStorytelling:e.count > 0 ? Math.round((e.storytelling/ e.count) * 10) / 10 : 0,
          avgRhyming:     e.count > 0 ? Math.round((e.rhyming     / e.count) * 10) / 10 : 0,
          avgPunchlines:  e.count > 0 ? Math.round((e.punchlines  / e.count) * 10) / 10 : 0,
        }));

      if (query) results = results.filter(a => a.name.toLowerCase().includes(query));
      results.sort((a, b) => b.avgScore - a.avgScore);

      res.json(results.slice(0, 50)); // cap at 50 for perf
    } catch (err: any) {
      console.error("Live search error:", err?.message);
      res.status(500).json({ error: "Search failed." });
    }
  });

}
