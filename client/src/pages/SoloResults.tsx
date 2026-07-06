import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient.js";
import { SingleScoreBar } from "../components/ScoreBar.js";
import VerseAnnotation from "../components/VerseAnnotation.js";
import { getCachedResult } from "../lib/resultCache.js";

export default function SoloResults() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  // Check in-memory cache first (set by Home.tsx on submit — no DB needed)
  const cachedResult = id ? getCachedResult(id) : null;

  const { data: dbResult, isLoading, error } = useQuery<any>({
    queryKey: ["/api/analysis", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/analysis/${id}`);
      const data = await res.json();
      // Parse resultJson if coming from DB
      if (data.resultJson && typeof data.resultJson === 'string') {
        return JSON.parse(data.resultJson);
      }
      return data;
    },
    enabled: !!id && !cachedResult,
    retry: 1,
  });

  const result = cachedResult ?? dbResult;

  if (!cachedResult && isLoading) {
    return (
      <main style={{ background: "#f7f5f0", minHeight: "100vh", padding: "16px" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <div className="rm-card" style={{ padding: "20px", textAlign: "center" }}>
            <p style={{ fontFamily: "Courier New, monospace", fontSize: "13px", color: "#555" }}>
              [ Loading analysis... ]
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !result || result.error) {
    return (
      <main style={{ background: "#f7f5f0", minHeight: "100vh", padding: "16px" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <div className="rm-card rm-callout" style={{ padding: "16px", borderLeftColor: "#cc0000" }}>
            <b>Analysis not found.</b> This link may have expired or the ID is incorrect.
          </div>
          <button className="rm-btn-primary" style={{ marginTop: "12px" }} onClick={() => setLocation("/")}>
            &larr; Back to RhymeMath
          </button>
        </div>
      </main>
    );
  }

  const scores = result.scores ?? {};
  const measured = result.analysis?.measured;
  // Safe number formatter — prevents .toFixed() crash on undefined
  const fmt = (v: any, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');

  const shareUrl = window.location.href;

  const grade =
    scores.overall >= 90 ? "ALL-TIME ELITE" :
    scores.overall >= 80 ? "EXCEPTIONAL" :
    scores.overall >= 70 ? "STRONG" :
    scores.overall >= 60 ? "SOLID" :
    scores.overall >= 50 ? "AVERAGE" : "BELOW AVERAGE";

  const gradeColor =
    scores.overall >= 80 ? "#006600" :
    scores.overall >= 60 ? "#1a3a7a" :
    scores.overall >= 50 ? "#8b6914" : "#8b0000";

  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", padding: "16px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>

        {/* Header */}
        <div className="rm-card" style={{ padding: "10px 14px", marginBottom: "14px", borderBottom: "3px solid #1a3a7a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={() => setLocation("/")}
              style={{ background: "none", border: "none", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#1a3a7a", cursor: "pointer", textDecoration: "underline", padding: 0 }}
            >
              &larr; New Analysis
            </button>
            <span style={{ color: "#ccc" }}>|</span>
            <h1 style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "16px", color: "#1a3a7a", margin: 0 }}>
              Solo Analysis
            </h1>
            {result.scoringMode === "custom" && (
              <span style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#8b0000", border: "1px solid #8b0000", padding: "1px 6px" }}>
                CUSTOM WEIGHTS
              </span>
            )}
          </div>
        </div>

        {/* Artist + Score Banner */}
        <div className="rm-card" style={{ padding: "14px 16px", marginBottom: "12px", borderLeft: "4px solid #1a3a7a" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "22px", color: "#1a3a7a" }}>
                {result.artistName}
              </div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: "14px", color: "#555", marginTop: "2px" }}>
                {result.songName}
                {result.verseLabel && (
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#888", marginLeft: "8px" }}>
                    [{result.verseLabel}]
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "40px", color: gradeColor, lineHeight: 1 }}>
                {fmt(scores.overall)}
              </div>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: gradeColor, fontWeight: "bold" }}>
                {grade}
              </div>
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="rm-section-header-blue" style={{ marginBottom: "0" }}>▶ SCORE BREAKDOWN</div>
        <div className="rm-card" style={{ padding: "12px 14px", marginBottom: "12px" }}>
          {[
            { label: "Flow (30%)", value: scores.flow },
            { label: "Wordplay (20%)", value: scores.wordplay },
            { label: "Storytelling (20%)", value: scores.storytelling },
            { label: "Rhyming (15%)", value: scores.rhyming },
            { label: "Punchlines (15%)", value: scores.punchlines },
          ].map(({ label, value }) => (
            <div key={label} style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <span style={{ fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: "bold", color: "#333" }}>{label}</span>
                <span style={{ fontFamily: "Courier New, monospace", fontSize: "12px", fontWeight: "bold", color: "#1a3a7a" }}>{fmt(value)}</span>
              </div>
              <SingleScoreBar score={value} label="" color="#1a3a7a" animate={false} />
            </div>
          ))}
        </div>

        {/* Category Reasoning */}
        <div className="rm-section-header-blue" style={{ marginBottom: "0" }}>▶ ANALYSIS</div>
        <div className="rm-card" style={{ padding: "12px 14px", marginBottom: "12px" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#333", margin: "0 0 12px", lineHeight: "1.6" }}>
            {result.explanation}
          </p>
          {result.categories?.map((cat: any) => (
            <div key={cat.name} style={{ borderTop: "1px solid #eee", paddingTop: "8px", marginTop: "8px" }}>
              <span style={{ fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: "bold", color: "#1a3a7a" }}>
                {cat.name}:
              </span>{" "}
              <span style={{ fontFamily: "Georgia, serif", fontSize: "12px", color: "#555" }}>
                {cat.reasoning}
              </span>
            </div>
          ))}
        </div>

        {/* Technical Metrics */}
        {measured && (
          <>
            <div className="rm-section-header-blue" style={{ marginBottom: "0" }}>▶ TECHNICAL METRICS</div>
            <div className="rm-card" style={{ padding: "10px 14px", marginBottom: "12px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: "11px" }}>
                <tbody>
                  {[
                    ["Lines", measured.lineCount],
                    ["End Rhymes", measured.endRhymes],
                    ["Internal Rhymes", measured.internalRhymes],
                    ["Rhyme Density", `${fmt(measured.rhymeDensity * 100)}%`],
                    ["Avg Words/Line", fmt(measured.avgLineLength)],
                    ["Syllables (approx)", measured.syllableApproximation],
                    ["Verse Structure", measured.verseStructure],
                  ].map(([label, val], i) => (
                    <tr key={String(label)} style={{ background: i % 2 === 0 ? "#fff" : "#f5f3ef" }}>
                      <td style={{ padding: "4px 8px", color: "#888", width: "50%" }}>{label}</td>
                      <td style={{ padding: "4px 8px", color: "#333", fontWeight: "bold" }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Verse Annotation */}
        {result.annotation && result.verse && !result.verse.startsWith("[No verse") && (
          <>
            <div className="rm-section-header-blue" style={{ marginBottom: "0" }}>▶ VERSE ANNOTATION</div>
            <div className="rm-card" style={{ padding: "12px 14px", marginBottom: "12px" }}>
              <VerseAnnotation lines={result.annotation ?? []} side="A" artistName={result.artistName ?? ""} />
            </div>
          </>
        )}

        {/* Share */}
        <div className="rm-card" style={{ padding: "10px 14px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#555" }}>
              Share this analysis:
            </span>
            <input
              readOnly
              value={shareUrl}
              onClick={e => (e.target as HTMLInputElement).select()}
              style={{ flex: 1, fontFamily: "Courier New, monospace", fontSize: "10px", padding: "3px 6px", border: "1px solid #ccc", background: "#f5f3ef", color: "#333" }}
            />
            <button
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", fontWeight: "bold", padding: "3px 10px", background: "#1a3a7a", color: "#fff", border: "none", cursor: "pointer" }}
            >
              Copy
            </button>
          </div>
        </div>

        {/* Battle CTA */}
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <button
            className="rm-btn-primary"
            onClick={() => setLocation("/")}
            style={{ fontSize: "13px", padding: "7px 24px" }}
          >
            [ RUN ANOTHER ANALYSIS ]
          </button>
          <span style={{ margin: "0 10px", color: "#ccc" }}>or</span>
          <button
            onClick={() => setLocation("/?mode=battle")}
            style={{
              fontFamily: "Arial, sans-serif", fontSize: "13px", fontWeight: "bold",
              padding: "7px 24px", background: "#8b0000", color: "#fff",
              border: "2px solid #660000", cursor: "pointer",
            }}
          >
            [ PUT THEM IN A BATTLE ]
          </button>
        </div>

      </div>
    </main>
  );
}
