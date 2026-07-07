import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

export default function Leaderboard() {
  const [category, setCategory] = useState<Category>("overall");
  const [sortBy, setSortBy] = useState<SortBy>("score");

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
      <div style={{ maxWidth: "880px", margin: "0 auto", padding: "0 16px" }}>

        {/* Header */}
        <div className="rm-section-header-blue" style={{ marginTop: "20px" }}>
          [ LEADERBOARDS ]
        </div>
        <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "13px", color: "#444", marginBottom: "14px", lineHeight: "1.5" }}>
          Rankings built from real RhymeMath comparisons. Run a comparison to add artists to the board.
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
                      <span style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "13px", color: "#1a3a7a" }}>
                        {entry.artistName}
                      </span>
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "13px", fontWeight: 700, color: "#222" }}>
                      {category === "winRate"
                        ? `${entry.winRate}%`
                        : category === "mostCompared"
                        ? entry.comparisons
                        : entry.score.toFixed(1)}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", fontWeight: 700 }}>
                      {entry.battleCount > 0
                        ? <span><span style={{ color: "#006600" }}>{entry.wins}</span><span style={{ color: "#555" }}>-</span><span style={{ color: "#8b0000" }}>{entry.losses}</span></span>
                        : <span style={{ color: "#aaa", fontWeight: 400 }}>--</span>}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#666" }}>
                      {entry.comparisons}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#999", marginTop: "8px" }}>
          * Leaderboard updates in real-time after each comparison. Only artists with at least one bout appear here.
        </p>
      </div>
    </main>
  );
}
