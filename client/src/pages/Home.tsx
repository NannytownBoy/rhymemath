import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { cacheResult } from "../lib/resultCache.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient.js";
import type { RhymeMathResult } from "../lib/types.js";
import ArtistTypeahead, { type VerseSearchResult } from "../components/ArtistTypeahead.js";
import SongTypeahead from "../components/SongTypeahead.js";

const VERSE_LABEL_OPTIONS = ["Verse 1", "Verse 2", "Verse 3", "Hook", "Bridge", "Outro", "Intro", "Guest Verse"];

// Standard weights (non-negotiable for leaderboard)
const STANDARD_WEIGHTS = { flow: 30, wordplay: 20, storytelling: 20, rhyming: 15, punchlines: 15 };

type WeightKey = keyof typeof STANDARD_WEIGHTS;

const WEIGHT_LABELS: Record<WeightKey, string> = {
  flow: "Flow",
  wordplay: "Wordplay",
  storytelling: "Storytelling",
  rhyming: "Rhyming",
  punchlines: "Punchlines",
};

function totalWeights(w: typeof STANDARD_WEIGHTS) {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

export default function Home() {
  const [, setLocation] = useLocation();
  const search = useSearch();

  // App mode: solo analysis or battle
  const [appMode, setAppMode] = useState<"solo" | "battle">(
    search?.includes("mode=battle") ? "battle" : "solo"
  );

  // Verse fields — Solo
  const [artistA, setArtistA] = useState("");
  const [songA, setSongA] = useState("");
  const [verseA, setVerseA] = useState("");
  const [verseLabelA, setVerseLabelA] = useState("");

  // Verse fields — Battle (B side)
  const [artistB, setArtistB] = useState("");
  const [songB, setSongB] = useState("");
  const [verseB, setVerseB] = useState("");
  const [verseLabelB, setVerseLabelB] = useState("");

  const [error, setError] = useState<string | null>(null);

  // Scoring mode
  const [scoringMode, setScoringMode] = useState<"standard" | "custom">("standard");
  const [customWeights, setCustomWeights] = useState({ ...STANDARD_WEIGHTS });
  const [showWeights, setShowWeights] = useState(false);

  const activeWeights = scoringMode === "standard" ? STANDARD_WEIGHTS : customWeights;
  const weightTotal = totalWeights(activeWeights);
  const weightValid = weightTotal === 100;

  const { data: recentComparisons } = useQuery<any[]>({
    queryKey: ["/api/recent"],
    staleTime: 30000,
  });

  // ── Solo Analysis Mutation ─────────────────────────────────────────────────
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      let res: Response;
      try {
        res = await apiRequest("POST", "/api/analyze", {
          artistName: artistA, songName: songA, verse: verseA, verseLabel: verseLabelA,
          scoringMode,
          weights: scoringMode === "custom" ? customWeights : undefined,
        });
      } catch {
        throw new Error("NETWORK");
      }
      return res.json() as Promise<any>;
    },
    onSuccess: (result) => { cacheResult(result.resultId, result); setLocation(`/analysis/${result.resultId}`); },
    onError: (err: any) => {
      if (err?.message === "NETWORK") {
        setError("Could not reach the RhymeMath server. Make sure you are on www.rhymemath.com.");
      } else {
        setError("Something went wrong. Check your inputs and try again.");
      }
    },
  });

  // ── Battle Comparison Mutation ─────────────────────────────────────────────
  const compareMutation = useMutation({
    mutationFn: async () => {
      let res: Response;
      try {
        res = await apiRequest("POST", "/api/score", {
          artistA, songA, verseA, verseLabelA,
          artistB, songB, verseB, verseLabelB,
          scoringMode,
          weights: scoringMode === "custom" ? customWeights : undefined,
        });
      } catch {
        throw new Error("NETWORK");
      }
      const data = await res.json() as RhymeMathResult;
      return data;
    },
    onSuccess: (result) => { cacheResult((result as any).resultId, result); setLocation(`/results/${(result as any).resultId}`); },
    onError: (err: any) => {
      if (err?.message === "NETWORK") {
        setError("Could not reach the RhymeMath server. Make sure you are on www.rhymemath.com, not a preview link.");
      } else if (err?.message?.includes("400")) {
        setError("Missing required fields. Enter artist names and song titles for both sides.");
      } else {
        setError("Something went wrong scoring these verses. Check your inputs and try again.");
      }
    },
  });

  const handleSubmit = () => {
    setError(null);
    if (!artistA.trim() || !songA.trim()) {
      setError("Artist name and song title are required.");
      return;
    }
    if (!verseA.trim()) {
      setError("Lyrics are required. Paste the verse before submitting.");
      return;
    }
    if (appMode === "battle" && (!artistB.trim() || !songB.trim())) {
      setError("Artist name and song title are required for both sides.");
      return;
    }
    if (appMode === "battle" && !verseB.trim()) {
      setError("Lyrics are required for both sides. Paste the verse before submitting.");
      return;
    }
    if (scoringMode === "custom" && !weightValid) {
      setError(`Custom weights must add up to 100. Current total: ${weightTotal}.`);
      return;
    }
    if (appMode === "solo") {
      analyzeMutation.mutate();
    } else {
      compareMutation.mutate();
    }
  };

  const isPending = analyzeMutation.isPending || compareMutation.isPending;

  const adjustWeight = (key: WeightKey, val: number) => {
    setCustomWeights(prev => ({ ...prev, [key]: Math.max(0, Math.min(100, val)) }));
  };

  const resetToStandard = () => setCustomWeights({ ...STANDARD_WEIGHTS });

  const linesA = verseA.split("\n").filter(l => l.trim()).length;
  const wordsA = verseA.split(/\s+/).filter(Boolean).length;
  const linesB = verseB.split("\n").filter(l => l.trim()).length;
  const wordsB = verseB.split(/\s+/).filter(Boolean).length;

  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", padding: "16px" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>

        {/* ── App Mode Toggle (Solo / Battle) ── */}
        <div style={{ display: "flex", gap: "0", marginBottom: "14px", borderBottom: "3px solid #1a3a7a" }}>
          <button
            data-testid="button-mode-solo"
            onClick={() => { setAppMode("solo"); setError(null); }}
            style={{
              fontFamily: "Arial Black, Arial, sans-serif",
              fontSize: "14px",
              padding: "8px 24px",
              cursor: "pointer",
              background: appMode === "solo" ? "#1a3a7a" : "#e8e5df",
              color: appMode === "solo" ? "#ffffff" : "#555555",
              border: "none",
              borderBottom: appMode === "solo" ? "3px solid #ffcc44" : "3px solid transparent",
              marginBottom: "-3px",
            }}
          >
            SOLO ANALYSIS
          </button>
          <button
            data-testid="button-mode-battle"
            onClick={() => { setAppMode("battle"); setError(null); }}
            style={{
              fontFamily: "Arial Black, Arial, sans-serif",
              fontSize: "14px",
              padding: "8px 24px",
              cursor: "pointer",
              background: appMode === "battle" ? "#8b0000" : "#e8e5df",
              color: appMode === "battle" ? "#ffffff" : "#555555",
              border: "none",
              borderBottom: appMode === "battle" ? "3px solid #ffcc44" : "3px solid transparent",
              marginBottom: "-3px",
            }}
          >
            &#9876; BATTLE MODE
          </button>
          <div style={{ flex: 1, background: "#e8e5df", marginBottom: "-3px" }} />
        </div>

        {/* Header description */}
        <div className="rm-card" style={{ padding: "10px 14px", marginBottom: "14px" }}>
          {appMode === "solo" ? (
            <p style={{ fontFamily: "Georgia, serif", fontSize: "12px", color: "#555555", margin: 0 }}>
              <strong style={{ fontFamily: "Arial Black, sans-serif", color: "#1a3a7a" }}>Solo Analysis</strong> — paste one verse. Get a full breakdown: flow, rhyme density, wordplay, and annotation.{" "}
              <span style={{ fontFamily: "Courier New, monospace", color: "#888888", fontSize: "11px" }}>
                [Standard: Flow 30% &bull; Rhyme Craft 22% &bull; Wordplay 20% &bull; Storytelling 16% &bull; Punchlines 12%]
              </span>
            </p>
          ) : (
            <p style={{ fontFamily: "Georgia, serif", fontSize: "12px", color: "#555555", margin: 0 }}>
              <strong style={{ fontFamily: "Arial Black, sans-serif", color: "#8b0000" }}>Battle Mode</strong> — enter two verses head to head. RhymeMath scores both and declares a winner.{" "}
              <span style={{ fontFamily: "Courier New, monospace", color: "#888888", fontSize: "11px" }}>
                [Standard: Flow 30% &bull; Rhyme Craft 22% &bull; Wordplay 20% &bull; Storytelling 16% &bull; Punchlines 12%]
              </span>
            </p>
          )}
        </div>

        {/* ── Scoring Mode Toggle ── */}
        <div className="rm-card" style={{ padding: "10px 14px", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: "bold", color: "#333" }}>
              SCORING MODE:
            </span>

            <button
              data-testid="button-scoring-standard"
              onClick={() => { setScoringMode("standard"); setShowWeights(false); }}
              style={{
                fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: "bold",
                padding: "4px 14px", cursor: "pointer",
                background: scoringMode === "standard" ? "#1a3a7a" : "#dddddd",
                color: scoringMode === "standard" ? "#ffffff" : "#333333",
                border: scoringMode === "standard" ? "2px solid #0d2655" : "2px solid #bbbbbb",
              }}
            >
              Standard
            </button>

            <button
              data-testid="button-scoring-custom"
              onClick={() => { setScoringMode("custom"); setShowWeights(true); }}
              style={{
                fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: "bold",
                padding: "4px 14px", cursor: "pointer",
                background: scoringMode === "custom" ? "#8b0000" : "#dddddd",
                color: scoringMode === "custom" ? "#ffffff" : "#333333",
                border: scoringMode === "custom" ? "2px solid #660000" : "2px solid #bbbbbb",
              }}
            >
              Custom
            </button>

            {scoringMode === "standard" && (
              <span style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#006600" }}>
                &#10003; Counts toward leaderboard rankings
              </span>
            )}
            {scoringMode === "custom" && (
              <span style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#8b0000" }}>
                &#9888; Custom scores do not count toward leaderboard
              </span>
            )}

            {scoringMode === "custom" && (
              <button
                onClick={() => setShowWeights(v => !v)}
                style={{
                  background: "none", border: "none",
                  fontFamily: "Courier New, monospace", fontSize: "10px",
                  color: "#1a3a7a", cursor: "pointer", textDecoration: "underline", marginLeft: "auto",
                }}
              >
                {showWeights ? "hide weights ▲" : "edit weights ▼"}
              </button>
            )}
          </div>

          {scoringMode === "custom" && showWeights && (
            <div style={{ marginTop: "12px", borderTop: "1px solid #ddd", paddingTop: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
                {(Object.keys(STANDARD_WEIGHTS) as WeightKey[]).map(key => (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                      <label style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", fontWeight: "bold", color: "#333" }}>
                        {WEIGHT_LABELS[key]}
                      </label>
                      <span style={{
                        fontFamily: "Courier New, monospace", fontSize: "12px", fontWeight: "bold",
                        color: customWeights[key] !== STANDARD_WEIGHTS[key] ? "#8b0000" : "#555",
                      }}>
                        {customWeights[key]}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0} max={100} step={5}
                      value={customWeights[key]}
                      onChange={e => adjustWeight(key, parseInt(e.target.value))}
                      style={{ width: "100%", cursor: "pointer" }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{
                  fontFamily: "Courier New, monospace", fontSize: "12px", fontWeight: "bold",
                  color: weightValid ? "#006600" : "#cc0000",
                }}>
                  Total: {weightTotal}% {weightValid ? "✓" : `— needs to equal 100%`}
                </span>
                <button
                  onClick={resetToStandard}
                  style={{
                    background: "none", border: "1px solid #bbbbbb", fontFamily: "Courier New, monospace",
                    fontSize: "10px", color: "#555", cursor: "pointer", padding: "2px 8px",
                  }}
                >
                  reset to standard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Verse Input ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: appMode === "battle" ? "1fr 1fr" : "1fr",
          gap: "12px",
          marginBottom: "12px",
        }}>

          {/* Verse A (always shown) */}
          <div>
            <div
              className="rm-section-header-blue"
              style={{
                marginBottom: "0",
                background: appMode === "battle" ? "#1a3a7a" : "#1a3a7a",
              }}
            >
              {appMode === "solo" ? "▶ VERSE" : "▶ VERSE A"}
            </div>
            <div className="rm-card" style={{ padding: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                <div>
                  <label className="rm-label" style={{ display: "block", marginBottom: "2px" }}>
                    Artist Name <span style={{ color: "#cc0000" }}>*</span>
                  </label>
                  <ArtistTypeahead
                    value={artistA}
                    onChange={setArtistA}
                    onSelectVerse={(r: VerseSearchResult) => {
                      setArtistA(r.artistName);
                      setSongA(r.songName);
                      setVerseA(r.verse);
                      setVerseLabelA(r.verseLabel ?? "");
                    }}
                    placeholder={appMode === "solo" ? "e.g. Kendrick Lamar" : "e.g. Kendrick Lamar"}
                    testId="input-artist-a"
                  />
                </div>
                <div>
                  <label className="rm-label" style={{ display: "block", marginBottom: "2px" }}>
                    Song Title <span style={{ color: "#cc0000" }}>*</span>
                  </label>
                  <SongTypeahead
                    value={songA}
                    onChange={setSongA}
                    artistName={artistA}
                    onSelectVerse={(r: VerseSearchResult) => {
                      setArtistA(r.artistName);
                      setSongA(r.songName);
                      setVerseA(r.verse);
                      setVerseLabelA(r.verseLabel ?? "");
                    }}
                    placeholder="e.g. HUMBLE."
                    testId="input-song-a"
                  />
                </div>
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label className="rm-label" style={{ display: "block", marginBottom: "2px" }}>
                  Which part? <span style={{ color: "#888", fontWeight: "normal" }}>(optional)</span>
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input data-testid="input-verse-label-a" className="rm-input" style={{ flex: 1 }}
                    placeholder='e.g. "Verse 2"' value={verseLabelA} onChange={e => setVerseLabelA(e.target.value)} maxLength={30} />
                  <select className="rm-input" style={{ fontSize: "10px", padding: "3px 4px" }} value=""
                    onChange={e => { if (e.target.value) setVerseLabelA(e.target.value); }}>
                    <option value="">quick pick...</option>
                    {VERSE_LABEL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="rm-label" style={{ display: "block", marginBottom: "2px" }}>
                  Verse Text <span style={{ color: "#cc0000" }}>*</span>
                </label>
                <textarea data-testid="input-verse-a" className="rm-input"
                  style={{ width: "100%", height: "150px", resize: "vertical", lineHeight: "1.6" }}
                  placeholder={"Paste the verse here for full scoring...\nNo verse = name-based scoring only."}
                  value={verseA} onChange={e => setVerseA(e.target.value)} />
                {verseA.trim() ? (
                  <div style={{ marginTop: "3px" }}>
                    <span className="rm-label" style={{ color: linesA >= 8 ? "#006600" : linesA >= 4 ? "#996600" : "#cc0000" }}>
                      {linesA >= 8 ? "✓" : linesA >= 4 ? "⚠" : "✗"} {linesA} lines · ~{wordsA} words{verseLabelA && ` · ${verseLabelA}`}
                    </span>
                    {linesA < 4 && (
                      <span className="rm-label" style={{ display: "block", color: "#cc0000", marginTop: "2px" }}>
                        Too short — paste at least 8 bars for accurate scoring.
                      </span>
                    )}
                    {linesA >= 4 && linesA < 8 && (
                      <span className="rm-label" style={{ display: "block", color: "#996600", marginTop: "2px" }}>
                        Partial verse detected. 8+ bars recommended for full scoring.
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="rm-label" style={{ marginTop: "3px", color: "#888" }}>No verse — name-based scoring only</div>
                )}
              </div>
            </div>
          </div>

          {/* Verse B — only in battle mode */}
          {appMode === "battle" && (
            <div>
              <div className="rm-section-header" style={{ marginBottom: "0", background: "#8b0000", borderColor: "#660000" }}>▶ VERSE B</div>
              <div className="rm-card" style={{ padding: "10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  <div>
                    <label className="rm-label" style={{ display: "block", marginBottom: "2px" }}>
                      Artist Name <span style={{ color: "#cc0000" }}>*</span>
                    </label>
                    <ArtistTypeahead
                      value={artistB}
                      onChange={setArtistB}
                      onSelectVerse={(r: VerseSearchResult) => {
                        setArtistB(r.artistName);
                        setSongB(r.songName);
                        setVerseB(r.verse);
                        setVerseLabelB(r.verseLabel ?? "");
                      }}
                      placeholder="e.g. Jay-Z"
                      testId="input-artist-b"
                    />
                  </div>
                  <div>
                    <label className="rm-label" style={{ display: "block", marginBottom: "2px" }}>
                      Song Title <span style={{ color: "#cc0000" }}>*</span>
                    </label>
                    <SongTypeahead
                      value={songB}
                      onChange={setSongB}
                      artistName={artistB}
                      onSelectVerse={(r: VerseSearchResult) => {
                        setArtistB(r.artistName);
                        setSongB(r.songName);
                        setVerseB(r.verse);
                        setVerseLabelB(r.verseLabel ?? "");
                      }}
                      placeholder="e.g. Takeover"
                      testId="input-song-b"
                    />
                  </div>
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label className="rm-label" style={{ display: "block", marginBottom: "2px" }}>
                    Which part? <span style={{ color: "#888", fontWeight: "normal" }}>(optional)</span>
                  </label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input data-testid="input-verse-label-b" className="rm-input" style={{ flex: 1 }}
                      placeholder='e.g. "Verse 1"' value={verseLabelB} onChange={e => setVerseLabelB(e.target.value)} maxLength={30} />
                    <select className="rm-input" style={{ fontSize: "10px", padding: "3px 4px" }} value=""
                      onChange={e => { if (e.target.value) setVerseLabelB(e.target.value); }}>
                      <option value="">quick pick...</option>
                      {VERSE_LABEL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="rm-label" style={{ display: "block", marginBottom: "2px" }}>
                    Verse Text <span style={{ color: "#cc0000" }}>*</span>
                  </label>
                  <textarea data-testid="input-verse-b" className="rm-input"
                    style={{ width: "100%", height: "150px", resize: "vertical", lineHeight: "1.6" }}
                    placeholder={"Paste the verse here for full scoring...\nNo verse = name-based scoring only."}
                    value={verseB} onChange={e => setVerseB(e.target.value)} />
                  {verseB.trim() ? (
                    <div style={{ marginTop: "3px" }}>
                      <span className="rm-label" style={{ color: linesB >= 8 ? "#006600" : linesB >= 4 ? "#996600" : "#cc0000" }}>
                        {linesB >= 8 ? "✓" : linesB >= 4 ? "⚠" : "✗"} {linesB} lines · ~{wordsB} words{verseLabelB && ` · ${verseLabelB}`}
                      </span>
                      {linesB < 4 && (
                        <span className="rm-label" style={{ display: "block", color: "#cc0000", marginTop: "2px" }}>
                          Too short — paste at least 8 bars for accurate scoring.
                        </span>
                      )}
                      {linesB >= 4 && linesB < 8 && (
                        <span className="rm-label" style={{ display: "block", color: "#996600", marginTop: "2px" }}>
                          Partial verse detected. 8+ bars recommended for full scoring.
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="rm-label" style={{ marginTop: "3px", color: "#888" }}>No verse — name-based scoring only</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rm-callout" style={{ marginBottom: "10px", borderLeftColor: "#cc0000", borderColor: "#cc0000", background: "#fff5f5" }}>
            <b>Error:</b> {error}
          </div>
        )}

        {/* Submit */}
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <button
            data-testid="button-submit"
            onClick={handleSubmit}
            disabled={isPending || (scoringMode === "custom" && !weightValid)}
            style={{
              fontFamily: "Arial Black, Arial, sans-serif",
              fontSize: "15px",
              padding: "8px 32px",
              cursor: isPending ? "not-allowed" : "pointer",
              background: appMode === "solo" ? "#1a3a7a" : "#8b0000",
              color: "#ffffff",
              border: appMode === "solo" ? "2px solid #0d2655" : "2px solid #660000",
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending
              ? "[ SCORING... ]"
              : appMode === "solo"
                ? "[ ANALYZE VERSE ]"
                : "[ BATTLE ]"
            }
          </button>
          <div className="rm-label" style={{ marginTop: "6px", color: "#888" }}>
            {scoringMode === "standard"
              ? "Standard scoring · counts toward leaderboard"
              : `Custom scoring · Flow ${activeWeights.flow}% · Wordplay ${activeWeights.wordplay}% · Storytelling ${activeWeights.storytelling}% · Rhyming ${activeWeights.rhyming}% · Punchlines ${activeWeights.punchlines}%`
            }
          </div>
        </div>

        {/* Recent matchups */}
        {recentComparisons && recentComparisons.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div className="rm-section-header" style={{ marginBottom: "0" }}>Recent Battles</div>
            <div className="rm-card">
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: "11px" }}>
                <thead>
                  <tr style={{ background: "#f0eeea" }}>
                    <th style={{ padding: "4px 8px", textAlign: "left", borderBottom: "1px solid #ccc", color: "#333" }}>Verse A</th>
                    <th style={{ padding: "4px 8px", textAlign: "center", borderBottom: "1px solid #ccc", color: "#333" }}>Score</th>
                    <th style={{ padding: "4px 8px", textAlign: "right", borderBottom: "1px solid #ccc", color: "#333" }}>Verse B</th>
                    <th style={{ padding: "4px 8px", textAlign: "center", borderBottom: "1px solid #ccc", color: "#333" }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {recentComparisons.slice(0, 6).map((r: any, i: number) => (
                    <tr key={r.resultId} style={{ background: i % 2 === 0 ? "#fff" : "#f5f3ef" }}>
                      <td style={{ padding: "4px 8px", color: r.winner === "A" ? "#006600" : "#222" }}>
                        <a href={`/#/results/${r.resultId}`} style={{ color: "inherit" }}>
                          {r.artistA} — {r.songA}
                          {r.verseLabelA && <span style={{ color: "#888", fontSize: "10px" }}> ({r.verseLabelA})</span>}
                        </a>
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700 }}>
                        {r.scoreA?.toFixed(0)} – {r.scoreB?.toFixed(0)}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: r.winner === "B" ? "#006600" : "#222" }}>
                        {r.artistB} — {r.songB}
                        {r.verseLabelB && <span style={{ color: "#888", fontSize: "10px" }}> ({r.verseLabelB})</span>}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "center" }}>
                        <span style={{ background: r.winner === "TIE" ? "#888800" : "#006600", color: "#fff", padding: "1px 6px", fontSize: "10px", fontWeight: 700 }}>
                          {r.winner === "TIE" ? "TIE" : `${r.winnerName} W`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="rm-card" style={{ padding: "10px 14px" }}>
          <div className="rm-section-header" style={{ margin: "-10px -14px 10px" }}>How RhymeMath Scores (Standard)</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Georgia, serif", fontSize: "12px" }}>
            <tbody>
              {[
                ["Flow (30%)", "Line length consistency, syllable approximation, cadence variation, rhythm pocket"],
                ["Rhyme Craft (22%)", "End rhyme density, internal rhymes, multisyllabic patterns, rhyme chain length"],
                ["Wordplay (20%)", "Metaphors, similes, double meanings, callbacks, layered language"],
                ["Storytelling (16%)", "Narrative progression, POV consistency, emotional arc, thematic coherence"],
                ["Punchlines (12%)", "Setup and payoff structure, punch density, surprise, contrast"],
              ].map(([cat, desc], i) => (
                <tr key={cat} style={{ background: i % 2 === 0 ? "#fff" : "#f5f3ef", borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "5px 8px", fontWeight: 700, whiteSpace: "nowrap", color: "#1a3a7a", fontFamily: "Arial, sans-serif", fontSize: "12px" }}>{cat}</td>
                  <td style={{ padding: "5px 8px", color: "#444" }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#999", marginTop: "8px", marginBottom: 0 }}>
            Custom mode lets you adjust weights freely. Only Standard scores count toward leaderboard rankings.
          </p>
        </div>

      </div>
    </main>
  );
}
