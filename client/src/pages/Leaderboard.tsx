import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

type Category = "overall" | "flow" | "wordplay" | "storytelling" | "rhyming" | "punchlines" | "mostCompared" | "winRate";
type SortBy = "score" | "winRate" | "comparisons";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "flow", label: "Flow" },
  { key: "wordplay", label: "Wordplay" },
  { key: "storytelling", label: "Storytelling" },
  { key: "rhyming", label: "Rhyming" },
  { key: "punchlines", label: "Punchlines" },
  { key: "mostCompared", label: "Most Compared" },
  { key: "winRate", label: "Win Rate" },
];

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "score", label: "By Score" },
  { key: "winRate", label: "By Win %" },
  { key: "comparisons", label: "By # Comparisons" },
];

function getRankColor(rank: number) {
  if (rank === 1) return "#b8860b";
  if (rank === 2) return "#555555";
  if (rank === 3) return "#8b4513";
  return "#333333";
}

function getScoreLabel(category: Category) {
  if (category === "mostCompared") return "appearances";
  if (category === "winRate") return "win %";
  return "avg score";
}

function ResultBadge({ result }: { result: "W" | "L" | "TIE" | null }) {
  if (!result) return null;
  const color = result === "W" ? "#006600" : result === "L" ? "#8b0000" : "#555";
  const bg = result === "W" ? "#e8f5e9" : result === "L" ? "#ffeaea" : "#f0f0f0";
  return (
    <span style={{
      fontFamily: "Courier New, monospace",
      fontSize: "10px",
      fontWeight: 700,
      color,
      background: bg,
      border: `1px solid ${color}`,
      padding: "1px 4px",
      marginLeft: "4px",
    }}>
      {result}
    </span>
  );
}

// Score mini-bar
function MiniBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? "#006600" : pct >= 55 ? "#b8860b" : "#8b0000";
  return (
    <div style={{ display: "inline-block", width: "40px", height: "6px", background: "#ddd", verticalAlign: "middle", marginLeft: "4px" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
    </div>
  );
}

// Artist popup modal
function ArtistPopup({
  artistName,
  onClose,
}: {
  artistName: string;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();

  const { data: verses, isLoading } = useQuery<any[]>({
    queryKey: ["/api/artist-verses", artistName],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/artist-verses?name=${encodeURIComponent(artistName)}`);
      return res.json();
    },
    staleTime: 30000,
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#f7f5f0",
          border: "2px solid #1a3a7a",
          maxWidth: "680px",
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          padding: "0",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: "#1a3a7a",
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "14px", color: "#fff" }}>
            {artistName.toUpperCase()} — VERSES ANALYZED
          </div>
          <button
            onClick={onClose}
            style={{
              fontFamily: "Courier New, monospace",
              fontSize: "16px",
              color: "#aaccff",
              background: "none",
              border: "none",
              cursor: "pointer",
              lineHeight: 1,
            }}
            data-testid="button-close-popup"
          >
            [X]
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "12px 14px" }}>
          {isLoading ? (
            <div style={{ fontFamily: "Courier New, monospace", fontSize: "12px", color: "#888", textAlign: "center", padding: "24px" }}>
              [ LOADING... ]
            </div>
          ) : !verses || verses.length === 0 ? (
            <div style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#555", textAlign: "center", padding: "24px" }}>
              No verses found for this artist.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #1a3a7a" }}>
                  <th style={{ textAlign: "left", fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#1a3a7a", fontWeight: "bold", padding: "4px 6px", textTransform: "uppercase" }}>Song / Verse</th>
                  <th style={{ textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#1a3a7a", fontWeight: "bold", padding: "4px 6px" }}>Overall</th>
                  <th style={{ textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#1a3a7a", fontWeight: "bold", padding: "4px 6px" }}>Flow</th>
                  <th style={{ textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#1a3a7a", fontWeight: "bold", padding: "4px 6px" }}>WP</th>
                  <th style={{ textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#1a3a7a", fontWeight: "bold", padding: "4px 6px" }}>Story</th>
                  <th style={{ textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#1a3a7a", fontWeight: "bold", padding: "4px 6px" }}>Rhyme</th>
                  <th style={{ textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#1a3a7a", fontWeight: "bold", padding: "4px 6px" }}>Punch</th>
                  <th style={{ textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#1a3a7a", fontWeight: "bold", padding: "4px 6px" }}>Type</th>
                  <th style={{ textAlign: "left", fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#1a3a7a", fontWeight: "bold", padding: "4px 6px" }}>Vs.</th>
                </tr>
              </thead>
              <tbody>
                {verses.map((v: any, i: number) => (
                  <tr
                    key={`${v.resultId}-${i}`}
                    data-testid={`row-verse-${i}`}
                    style={{
                      background: i % 2 === 0 ? "#ffffff" : "#f5f3ef",
                      borderBottom: "1px solid #e0ddd8",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      onClose();
                      if (v.type === "battle") {
                        navigate(`/results/${v.resultId}`);
                      } else {
                        navigate(`/analysis/${v.resultId}`);
                      }
                    }}
                    title={v.type === "battle" ? "Click to view full battle breakdown" : "Click to view full analysis"}
                  >
                    <td style={{ padding: "5px 6px", fontFamily: "Georgia, serif" }}>
                      <span style={{ color: "#1a3a7a", fontWeight: "bold", fontSize: "12px" }}>
                        {v.songName}
                      </span>
                      {v.verseLabel && (
                        <span style={{ color: "#888", fontSize: "10px", marginLeft: "4px" }}>
                          [{v.verseLabel}]
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "center", padding: "5px 6px", fontFamily: "Courier New, monospace", fontWeight: 700, color: v.overall >= 70 ? "#006600" : v.overall >= 55 ? "#b8860b" : "#8b0000" }}>
                      {v.overall.toFixed(1)}
                    </td>
                    <td style={{ textAlign: "center", padding: "5px 6px", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#333" }}>{v.flow.toFixed(1)}</td>
                    <td style={{ textAlign: "center", padding: "5px 6px", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#333" }}>{v.wordplay.toFixed(1)}</td>
                    <td style={{ textAlign: "center", padding: "5px 6px", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#333" }}>{v.storytelling.toFixed(1)}</td>
                    <td style={{ textAlign: "center", padding: "5px 6px", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#333" }}>{v.rhyming.toFixed(1)}</td>
                    <td style={{ textAlign: "center", padding: "5px 6px", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#333" }}>{v.punchlines.toFixed(1)}</td>
                    <td style={{ textAlign: "center", padding: "5px 6px" }}>
                      <span style={{
                        fontFamily: "Courier New, monospace",
                        fontSize: "9px",
                        fontWeight: 700,
                        padding: "1px 4px",
                        background: v.type === "battle" ? "#1a3a7a" : "#555",
                        color: "#fff",
                      }}>
                        {v.type === "battle" ? "BATTLE" : "SOLO"}
                      </span>
                      {v.result && <ResultBadge result={v.result} />}
                    </td>
                    <td style={{ padding: "5px 6px", fontFamily: "Georgia, serif", fontSize: "11px", color: "#555" }}>
                      {v.opponent ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Footer note */}
          {verses && verses.length > 0 && (
            <div style={{ marginTop: "8px", fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888" }}>
              {verses.length} verse{verses.length !== 1 ? "s" : ""} analyzed &mdash; sorted by overall score &mdash; click any row to view full breakdown
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const [category, setCategory] = useState<Category>("overall");
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [popupArtist, setPopupArtist] = useState<string | null>(null);

  const { data: entries, isLoading, isError } = useQuery<any[]>({
    queryKey: ["/api/leaderboard", category, sortBy],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/leaderboard?category=${category}&sortBy=${sortBy}`);
        return res.json();
      } catch {
        return [];
      }
    },
    staleTime: 30000,
    retry: 1,
  });

  const isEmpty = !isLoading && (!entries || entries.length === 0);

  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", paddingBottom: "40px" }}>
      {/* Artist popup */}
      {popupArtist && (
        <ArtistPopup artistName={popupArtist} onClose={() => setPopupArtist(null)} />
      )}

      <div style={{ maxWidth: "880px", margin: "0 auto", padding: "0 16px" }}>

        {/* Header */}
        <div className="rm-section-header-blue" style={{ marginTop: "20px" }}>
          [ LEADERBOARDS ]
        </div>
        <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "13px", color: "#444", marginBottom: "14px", lineHeight: "1.5" }}>
          Rankings built from real RhymeMath comparisons. Click an artist name to see all their analyzed verses and scores.
        </p>

        {/* Controls row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-start", marginBottom: "14px" }}>
          {/* Category tabs */}
          <div>
            <div className="rm-label" style={{ marginBottom: "4px" }}>CATEGORY</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {CATEGORIES.map(({ key, label }) => (
                <button
                  key={key}
                  data-testid={`button-lb-${key}`}
                  onClick={() => setCategory(key)}
                  style={{
                    fontFamily: "Arial, sans-serif",
                    fontSize: "11px",
                    fontWeight: "bold",
                    padding: "3px 10px",
                    cursor: "pointer",
                    background: category === key ? "#1a3a7a" : "#dddddd",
                    color: category === key ? "#ffffff" : "#333333",
                    border: category === key ? "2px solid #0d2655" : "2px solid #bbbbbb",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort controls */}
          <div>
            <div className="rm-label" style={{ marginBottom: "4px" }}>SORT BY</div>
            <div style={{ display: "flex", gap: "4px" }}>
              {SORT_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  data-testid={`button-sort-${key}`}
                  onClick={() => setSortBy(key)}
                  style={{
                    fontFamily: "Courier New, monospace",
                    fontSize: "10px",
                    fontWeight: "bold",
                    padding: "3px 8px",
                    cursor: "pointer",
                    background: sortBy === key ? "#8b0000" : "#eeeeee",
                    color: sortBy === key ? "#ffffff" : "#555555",
                    border: sortBy === key ? "2px solid #660000" : "2px solid #bbbbbb",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rm-card" style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: "24px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#888" }}>
              [ LOADING LEADERBOARD... ]
            </div>
          ) : isEmpty ? (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "16px", color: "#1a3a7a", marginBottom: "8px" }}>
                No entries yet
              </div>
              <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#666", maxWidth: "400px", margin: "0 auto" }}>
                The leaderboard fills in automatically as comparisons are run.{" "}
                <a href="/#/" style={{ color: "#1a3a7a" }}>Run your first comparison</a> to get things started.
              </p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#1a3a7a" }}>
                  <th style={{ padding: "6px 10px", textAlign: "left", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaccff", fontWeight: "bold" }}>#</th>
                  <th style={{ padding: "6px 10px", textAlign: "left", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaccff", fontWeight: "bold" }}>Artist</th>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaccff", fontWeight: "bold", textTransform: "uppercase" }}>{getScoreLabel(category)}</th>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaccff", fontWeight: "bold" }}>Best</th>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaccff", fontWeight: "bold" }}>W-L</th>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaccff", fontWeight: "bold" }}>Bouts</th>
                </tr>
              </thead>
              <tbody>
                {entries!.map((entry: any, i: number) => (
                  <tr
                    key={entry.artistName}
                    data-testid={`row-leaderboard-${i}`}
                    style={{ background: i % 2 === 0 ? "#ffffff" : "#f5f3ef", borderBottom: "1px solid #e0ddd8" }}
                  >
                    <td style={{ padding: "6px 10px", fontFamily: "Courier New, monospace", fontSize: "13px", fontWeight: 700, color: getRankColor(entry.rank) }}>
                      {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <button
                        data-testid={`button-artist-${i}`}
                        onClick={() => setPopupArtist(entry.artistName)}
                        style={{
                          fontFamily: "Arial Black, Arial, sans-serif",
                          fontSize: "13px",
                          color: "#1a3a7a",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          textDecoration: "underline",
                          textUnderlineOffset: "2px",
                          textAlign: "left",
                        }}
                        title="Click to see all analyzed verses"
                      >
                        {entry.artistName}
                      </button>
                      <span style={{ fontFamily: "Courier New, monospace", fontSize: "9px", color: "#aaa", marginLeft: "6px" }}>
                        [{entry.comparisons} verse{entry.comparisons !== 1 ? "s" : ""}]
                      </span>
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "13px", fontWeight: 700, color: "#222" }}>
                      {category === "winRate"
                        ? `${entry.winRate}%`
                        : category === "mostCompared"
                        ? entry.comparisons
                        : entry.score.toFixed(1)}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#555" }}>
                      {entry.bestScore && entry.bestScore > 0 ? (
                        <span>
                          {entry.bestScore.toFixed(1)}
                          <MiniBar score={entry.bestScore} />
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", fontWeight: 700 }}>
                      {entry.battleCount > 0
                        ? <span><span style={{ color: "#006600" }}>{entry.wins}</span><span style={{ color: "#555" }}>-</span><span style={{ color: "#8b0000" }}>{entry.losses}</span>{entry.ties > 0 && <span style={{ color: "#555" }}>-{entry.ties}T</span>}</span>
                        : <span style={{ color: "#aaa", fontWeight: 400 }}>--</span>}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#666" }}>
                      {entry.battleCount > 0 ? entry.battleCount : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#999", marginTop: "8px" }}>
          * W-L = battle record only. Bouts = battles fought. Click any artist name to see all verses analyzed + full score breakdown.
        </p>
      </div>
    </main>
  );
}
