import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ScoreBar } from "../components/ScoreBar.js";
import VerseAnnotation from "../components/VerseAnnotation.js";
import type { RhymeMathResult, CategoryScore } from "../lib/types.js";
import { getCachedResult } from "../lib/resultCache.js";
import { apiRequest } from "../lib/queryClient.js";

function copyShareLink() {
  navigator.clipboard.writeText(window.location.href).then(() => alert("Link copied!"));
}

// ── Solo Analysis Result View ──────────────────────────────────────────────────
function SoloResultView({ result }: { result: any }) {
  const { artistName, songName, verseLabel, scores, categories, explanation, scoringMode } = result;
  const isCustom = scoringMode === "custom";
  const catOrder = ["Flow", "Wordplay", "Storytelling", "Rhyming", "Punchlines"];

  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", padding: "16px" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>

        {/* Back link */}
        <p style={{ marginBottom: "10px", fontFamily: "Arial, sans-serif", fontSize: "12px" }}>
          <Link href="/"><a>&#8592; New Analysis</a></Link>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="#" onClick={copyShareLink} style={{ color: "#006600" }}>&#128279; Share this breakdown</a>
        </p>

        {/* Header */}
        <div className="rm-winner-box" style={{ marginBottom: "14px", textAlign: "center" }}>
          <div className="rm-label" style={{ marginBottom: "4px" }}>SOLO ANALYSIS</div>
          <div style={{ marginBottom: "6px" }}>
            {isCustom ? (
              <span style={{ display: "inline-block", background: "#8b0000", color: "#fff", fontFamily: "Courier New, monospace", fontSize: "10px", fontWeight: 700, padding: "2px 8px", textTransform: "uppercase" }}>&#9888; CUSTOM SCORING</span>
            ) : (
              <span style={{ display: "inline-block", background: "#006600", color: "#fff", fontFamily: "Courier New, monospace", fontSize: "10px", fontWeight: 700, padding: "2px 8px", textTransform: "uppercase" }}>&#10003; STANDARD SCORING &mdash; COUNTS TOWARD LEADERBOARD</span>
            )}
          </div>
          <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "26px", color: "#006600", marginBottom: "2px" }}>
            {artistName}
          </div>
          <div style={{ fontFamily: "Courier New, monospace", fontSize: "13px", color: "#333", marginBottom: "8px" }}>
            {songName}{verseLabel ? ` — ${verseLabel}` : ""}
          </div>
          <div style={{ fontFamily: "Courier New, monospace", fontSize: "36px", fontWeight: 700, color: "#1a3a7a", lineHeight: 1 }}>
            {scores.overall.toFixed(1)}
          </div>
          <div className="rm-label" style={{ color: "#666", marginBottom: "8px" }}>OVERALL SCORE</div>
          {explanation && (
            <p style={{ fontFamily: "Georgia, serif", fontSize: "12px", color: "#444", maxWidth: "560px", margin: "0 auto" }}>
              {explanation}
            </p>
          )}
        </div>

        {/* Category Scores */}
        <div className="rm-section-header-blue" style={{ marginBottom: "0" }}>Category Breakdown</div>
        <div className="rm-card" style={{ padding: "12px", marginBottom: "12px" }}>
          {catOrder.map(name => {
            const cat = (categories ?? []).find((c: any) => c.name === name);
            const score = cat?.scoreA ?? scores[name.toLowerCase()] ?? 0;
            const barW = Math.min(100, Math.max(0, score));
            const barColor = score >= 80 ? "#006600" : score >= 65 ? "#1a3a7a" : "#8b0000";
            return (
              <div key={name} style={{ marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: "11px", marginBottom: "3px" }}>
                  <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{name}</span>
                  <span style={{ fontWeight: 700, color: barColor }}>{score.toFixed(1)}</span>
                </div>
                <div style={{ height: "8px", background: "#e8e8e8", position: "relative", border: "1px solid #ccc" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barW}%`, background: barColor, transition: "width 0.6s ease" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Evidence per category */}
        {(categories ?? []).length > 0 && (
          <>
            <div className="rm-section-header" style={{ marginBottom: "0" }}>Evidence &mdash; Category by Category</div>
            <div className="rm-card" style={{ padding: "0", marginBottom: "12px" }}>
              {(categories ?? []).map((cat: any, idx: number) => (
                <details key={cat.name} style={{ borderBottom: idx < categories.length - 1 ? "1px solid #ddd" : "none" }}>
                  <summary style={{
                    padding: "8px 12px", cursor: "pointer",
                    fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: 700,
                    background: "#f5f3ef", listStyle: "none",
                  }}>
                    <span style={{ float: "right", fontFamily: "Courier New, monospace", color: cat.scoreA >= 80 ? "#006600" : cat.scoreA >= 65 ? "#1a3a7a" : "#8b0000" }}>
                      {(cat.scoreA ?? 0).toFixed(1)}
                    </span>
                    {cat.name} <span style={{ fontWeight: 400, color: "#888", fontSize: "10px" }}>(click to expand)</span>
                  </summary>
                  <div style={{ padding: "8px 14px 10px", background: "#fff" }}>
                    {(cat.evidenceA ?? cat.evidence ?? []).map((e: string, ei: number) => (
                      <div key={ei} style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#444", marginBottom: "3px", paddingLeft: "10px", borderLeft: "2px solid #1a3a7a" }}>
                        {e}
                      </div>
                    ))}
                    {(cat.evidenceA ?? cat.evidence ?? []).length === 0 && (
                      <div style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#999" }}>No evidence data for this category.</div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </>
        )}

        {/* Disclaimer */}
        <div style={{ fontFamily: "Georgia, serif", fontSize: "11px", color: "#777", borderTop: "1px solid #ccc", paddingTop: "8px" }}>
          <i>RhymeMath uses a deterministic heuristic engine — not a human judge. Scores are estimated from detected text patterns. Results are transparent, not definitive.</i>
        </div>
      </div>
    </main>
  );
}

export default function Results() {
  const { id } = useParams<{ id: string }>();

  const cachedResult = id ? getCachedResult(id) : null;

  const { data: dbResult, isLoading, error } = useQuery<RhymeMathResult>({
    queryKey: ["/api/results", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/results/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      if (data.resultJson && typeof data.resultJson === 'string') return JSON.parse(data.resultJson);
      return data;
    },
    enabled: !!id && !cachedResult,
  });

  const result = cachedResult ?? dbResult;

  if (!cachedResult && isLoading) {
    return (
      <main style={{ padding: "24px", textAlign: "center", fontFamily: "Courier New, monospace" }}>
        <p>Loading result...</p>
      </main>
    );
  }

  if (error || !result || (result as any).error) {
    return (
      <main style={{ padding: "24px", maxWidth: "600px", margin: "0 auto" }}>
        <div className="rm-callout" style={{ borderLeftColor: "#cc0000", borderColor: "#cc0000", background: "#fff5f5" }}>
          <b>Result not found.</b> This link may have expired or the ID is incorrect.
        </div>
        <p style={{ marginTop: "12px" }}>
          <Link href="/"><a>&#8592; Start a new comparison</a></Link>
        </p>
      </main>
    );
  }

  // Solo analysis result — render a single-artist breakdown
  const isSolo = !(result as any).artistA && !!(result as any).scores;
  if (isSolo) {
    return <SoloResultView result={result as any} />;
  }

  const { artistA, artistB, winner, winnerName, confidence, categories, explanation, whyTheyWon, scoringMode, customWeights } = result as any;
  const scoreDiff = Math.abs(artistA.scores.overall - artistB.scores.overall);
  const isClose = scoreDiff < 5;
  const isCustom = scoringMode === "custom";

  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", padding: "16px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>

        {/* Back link */}
        <p style={{ marginBottom: "10px", fontFamily: "Arial, sans-serif", fontSize: "12px" }}>
          <Link href="/"><a>&#8592; New Comparison</a></Link>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="#" onClick={copyShareLink} style={{ color: "#006600" }}>
            &#128279; Share this matchup
          </a>
        </p>

        {/* Winner box */}
        <div className={winner === "TIE" ? "rm-tie-box" : "rm-winner-box"} style={{ marginBottom: "14px", textAlign: "center" }}>
          <div className="rm-label" style={{ marginBottom: "4px" }}>RHYMEMATH RESULT</div>
          {/* Scoring mode badge */}
          <div style={{ marginBottom: "6px" }}>
            {isCustom ? (
              <span style={{
                display: "inline-block",
                background: "#8b0000",
                color: "#ffffff",
                fontFamily: "Courier New, monospace",
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 8px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}>&#9888; CUSTOM SCORING &mdash; NOT COUNTED TOWARD LEADERBOARD</span>
            ) : (
              <span style={{
                display: "inline-block",
                background: "#006600",
                color: "#ffffff",
                fontFamily: "Courier New, monospace",
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 8px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}>&#10003; STANDARD SCORING &mdash; COUNTS TOWARD LEADERBOARD</span>
            )}
          </div>
          <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "28px", color: winner === "TIE" ? "#888800" : "#006600", marginBottom: "4px" }}>
            {winner === "TIE" ? "— TIE —" : `${winnerName} WINS`}
          </div>

          {/* Score display */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: "16px", margin: "8px 0", fontFamily: "Courier New, monospace" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: winner === "A" ? "#006600" : "#555555" }}>
                {artistA.scores.overall.toFixed(1)}
              </div>
              <div className="rm-label">{artistA.artistName}</div>
            </div>
            <div style={{ fontSize: "18px", color: "#999999", fontWeight: 700 }}>VS</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: winner === "B" ? "#006600" : "#555555" }}>
                {artistB.scores.overall.toFixed(1)}
              </div>
              <div className="rm-label">{artistB.artistName}</div>
            </div>
          </div>

          <div className="rm-label" style={{ color: "#666666" }}>
            Estimated Confidence: {confidence.toFixed(0)}% &bull; Score Margin: {scoreDiff.toFixed(1)} pts
          </div>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "12px", color: "#444444", marginTop: "8px", maxWidth: "600px", margin: "8px auto 0" }}>
            {explanation}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          {/* Category Breakdown */}
          <div>
            <div className="rm-section-header-blue" style={{ marginBottom: "0" }}>Category Breakdown</div>
            <div className="rm-card" style={{ padding: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontFamily: "Courier New, monospace", fontSize: "10px" }}>
                <span style={{ color: "#1a4fa8", fontWeight: 700 }}>A: {artistA.artistName}</span>
                <span style={{ color: "#c0392b", fontWeight: 700 }}>B: {artistB.artistName}</span>
              </div>
              {categories.map((cat: CategoryScore) => (
                <ScoreBar
                  key={cat.name}
                  category={cat.name}
                  scoreA={cat.scoreA}
                  scoreB={cat.scoreB}
                  nameA={artistA.artistName}
                  nameB={artistB.artistName}
                  weight={cat.weight}
                  animate={true}
                />
              ))}
            </div>
          </div>

          {/* Measured Metrics */}
          <div>
            <div className="rm-section-header" style={{ marginBottom: "0" }}>Measured Metrics</div>
            <div className="rm-card" style={{ padding: "0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: "11px" }}>
                <thead>
                  <tr style={{ background: "#f0eeea" }}>
                    <th style={{ padding: "4px 8px", textAlign: "left", borderBottom: "1px solid #ccc" }}>Metric</th>
                    <th style={{ padding: "4px 8px", textAlign: "center", borderBottom: "1px solid #ccc", color: "#1a4fa8" }}>A</th>
                    <th style={{ padding: "4px 8px", textAlign: "center", borderBottom: "1px solid #ccc", color: "#c0392b" }}>B</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Lines", artistA.analysis.measured.lineCount, artistB.analysis.measured.lineCount],
                    ["End Rhymes", `~${artistA.analysis.measured.endRhymes}`, `~${artistB.analysis.measured.endRhymes}`],
                    ["Internal Rhymes", `~${artistA.analysis.measured.internalRhymes}`, `~${artistB.analysis.measured.internalRhymes}`],
                    ["Repeated Sounds", artistA.analysis.measured.repeatedSounds, artistB.analysis.measured.repeatedSounds],
                    ["Avg Line Length", `~${artistA.analysis.measured.avgLineLength?.toFixed(1)}w`, `~${artistB.analysis.measured.avgLineLength?.toFixed(1)}w`],
                    ["Structure", artistA.analysis.measured.verseStructure, artistB.analysis.measured.verseStructure],
                  ].map(([label, valA, valB], i) => (
                    <tr key={String(label)} style={{ background: i % 2 === 0 ? "#fff" : "#f5f3ef" }}>
                      <td style={{ padding: "4px 8px", color: "#555555", textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.04em" }}>{label}</td>
                      <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700, color: "#1a4fa8" }}>{String(valA)}</td>
                      <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700, color: "#c0392b" }}>{String(valB)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Category Evidence */}
        <div style={{ marginBottom: "12px" }}>
          <div className="rm-section-header" style={{ marginBottom: "0" }}>Evidence — Category by Category</div>
          <div className="rm-card" style={{ padding: "0" }}>
            {categories.map((cat: CategoryScore, idx: number) => (
              <details key={cat.name} style={{ borderBottom: idx < categories.length - 1 ? "1px solid #dddddd" : "none" }}>
                <summary style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontFamily: "Arial, sans-serif",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: "#f5f3ef",
                  userSelect: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  listStyle: "none",
                }}>
                  <span>{cat.name} <span style={{ fontWeight: 400, color: "#888888", fontFamily: "Courier New, monospace", fontSize: "10px" }}>({Math.round(cat.weight * 100)}% weight)</span></span>
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: "11px" }}>
                    <span style={{ color: "#1a4fa8", fontWeight: 700 }}>{cat.scoreA.toFixed(0)}</span>
                    <span style={{ color: "#999" }}> vs </span>
                    <span style={{ color: "#c0392b", fontWeight: 700 }}>{cat.scoreB.toFixed(0)}</span>
                    <span style={{ color: "#888", fontSize: "10px", marginLeft: "8px" }}>&mdash; {cat.reasoning}</span>
                  </span>
                </summary>
                <div style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#ffffff" }}>
                  <div>
                    <div className="rm-label" style={{ color: "#1a4fa8", marginBottom: "4px" }}>A: {artistA.artistName}</div>
                    <ul style={{ margin: 0, paddingLeft: "16px", fontFamily: "Georgia, serif", fontSize: "11px", color: "#444444" }}>
                      {cat.evidence.artistA.map((e: string, i: number) => <li key={i} style={{ marginBottom: "2px" }}>{e}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="rm-label" style={{ color: "#c0392b", marginBottom: "4px" }}>B: {artistB.artistName}</div>
                    <ul style={{ margin: 0, paddingLeft: "16px", fontFamily: "Georgia, serif", fontSize: "11px", color: "#444444" }}>
                      {cat.evidence.artistB.map((e: string, i: number) => <li key={i} style={{ marginBottom: "2px" }}>{e}</li>)}
                    </ul>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Why they won */}
        <div className="rm-callout" style={{ marginBottom: "12px" }}>
          <b style={{ fontFamily: "Arial, sans-serif" }}>Why This Verse Won:</b>{" "}
          <span style={{ fontFamily: "Georgia, serif", fontSize: "12px" }}>{whyTheyWon}</span>
          {isClose && (
            <div style={{ marginTop: "6px", fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888800" }}>
              NOTE: Close matchup (margin: {scoreDiff.toFixed(1)} pts). A different verse selection could change this result.
            </div>
          )}
        </div>

        {/* Verse Analysis */}
        {((result as any).annotationA?.length > 0 || (result as any).annotationB?.length > 0) && (
          <div style={{ marginBottom: "12px" }}>
            <div className="rm-section-header-blue" style={{ marginBottom: "0" }}>
              [ VERSE ANALYSIS ] — Rhyme Schema &amp; Flow Detection
            </div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "11px", color: "#666", margin: "4px 0 8px 0", lineHeight: "1.5" }}>
              Detected rhyme clusters, assonance patterns, punchlines, and flow markers — annotated line by line.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div style={{ border: "2px solid #1a3a7a", overflow: "hidden" }}>
                <VerseAnnotation
                  lines={(result as any).annotationA ?? []}
                  side="A"
                  artistName={artistA.artistName}
                />
              </div>
              <div style={{ border: "2px solid #8b0000", overflow: "hidden" }}>
                <VerseAnnotation
                  lines={(result as any).annotationB ?? []}
                  side="B"
                  artistName={artistB.artistName}
                />
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ fontFamily: "Georgia, serif", fontSize: "11px", color: "#777777", borderTop: "1px solid #cccccc", paddingTop: "8px" }}>
          <i>
            RhymeMath uses a deterministic heuristic engine — not a human judge. All scores are estimated based on
            detected text patterns (rhyme density, syllable approximation, wordplay indicators). Results are
            transparent, not definitive. Confidence scores reflect score margin, not artistic certainty.
          </i>
        </div>
      </div>
    </main>
  );
}
