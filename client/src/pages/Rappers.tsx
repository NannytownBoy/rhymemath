import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function Rappers() {
  const [query, setQuery] = useState("");

  // Only pull artists who appear in real comparisons
  const { data: liveArtists, isLoading } = useQuery<any[]>({
    queryKey: ["/api/rappers/search/live", query],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/rappers/search/live?q=${encodeURIComponent(query)}`);
        return res.json();
      } catch {
        return [];
      }
    },
    staleTime: 15000,
    retry: 1,
  });

  const artists = liveArtists ?? [];
  const isEmpty = !isLoading && artists.length === 0;

  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", paddingBottom: "40px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0 16px" }}>

        <div className="rm-section-header-blue" style={{ marginTop: "20px" }}>[ RAPPER DATABASE ]</div>
        <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#555", marginBottom: "14px" }}>
          Every artist here has been compared on RhymeMath. Stats update live after each comparison.
        </p>

        {/* Search */}
        <div style={{ marginBottom: "14px" }}>
          <input
            data-testid="input-search-rappers"
            className="rm-input"
            style={{ width: "100%", fontSize: "13px" }}
            placeholder="Search artists by name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="rm-card" style={{ padding: "24px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#888" }}>
            [ LOADING... ]
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="rm-card" style={{ padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "16px", color: "#1a3a7a", marginBottom: "8px" }}>
              {query ? `No results for "${query}"` : "No artists yet"}
            </div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#666", maxWidth: "420px", margin: "0 auto" }}>
              {query
                ? "Try a different name, or run a comparison with this artist to add them."
                : "Artists appear here automatically after their first comparison. "}
              {!query && (
                <Link href="/"><span style={{ color: "#1a3a7a", textDecoration: "underline", cursor: "pointer" }}>Run a comparison</span></Link>
              )}
              {!query && " to get things started."}
            </p>
          </div>
        )}

        {/* Live artist table */}
        {artists.length > 0 && (
          <div>
            <div className="rm-section-header" style={{ marginBottom: "0", background: "#006600", borderColor: "#004400" }}>
              &#9679; LIVE ARTISTS ({artists.length}) — updated from real comparisons
            </div>
            <div className="rm-card" style={{ padding: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#004400" }}>
                    <th style={{ padding: "6px 12px", textAlign: "left", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaffaa" }}>Artist</th>
                    <th style={{ padding: "6px 12px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaffaa" }}>Avg Score</th>
                    <th style={{ padding: "6px 12px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaffaa" }}>W</th>
                    <th style={{ padding: "6px 12px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaffaa" }}>L</th>
                    <th style={{ padding: "6px 12px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaffaa" }}>Bouts</th>
                    <th style={{ padding: "6px 12px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaffaa" }}>Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {artists.map((a: any, i: number) => (
                    <tr
                      key={a.slug}
                      data-testid={`row-rapper-${i}`}
                      style={{ background: i % 2 === 0 ? "#fff" : "#f5f3ef", borderBottom: "1px solid #ddd" }}
                    >
                      <td style={{ padding: "7px 12px" }}>
                        <span style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "13px", color: "#1a3a7a" }}>
                          {a.name}
                        </span>
                        <span style={{ marginLeft: "8px", background: "#006600", color: "#fff", fontSize: "9px", fontWeight: "bold", padding: "1px 5px" }}>LIVE</span>
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "13px", fontWeight: 700, color: "#222" }}>
                        {typeof a.avgScore === "number" ? a.avgScore.toFixed(1) : "—"}
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#006600", fontWeight: 700 }}>
                        {a.wins ?? 0}
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#8b0000", fontWeight: 700 }}>
                        {a.losses ?? 0}
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#666" }}>
                        {a.comparisons}
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center" }}>
                        <Link href={`/rappers/${a.slug}`}>
                          <span style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#1a3a7a", textDecoration: "underline", cursor: "pointer" }}>
                            [ VIEW ]
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#999", marginTop: "6px" }}>
              * Stats update after every comparison. Win/loss records count Standard scoring mode only.
            </p>
          </div>
        )}

      </div>
    </main>
  );
}
