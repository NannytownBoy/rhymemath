import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const PAGE_SIZE = 10;

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: "10px", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
        <span style={{ fontFamily: "Courier New, monospace", fontSize: "11px", fontWeight: 700, color: "#222" }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ height: "6px", background: "#e0ddd8", width: "100%" }}>
        <div style={{ height: "6px", background: color, width: `${Math.min(value, 100)}%`, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

export default function Rappers() {
  const [query, setQuery] = useState("");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const isSearching = query.trim().length > 0;

  const { data: liveArtists, isLoading } = useQuery<any[]>({
    queryKey: ["/api/rappers/search/live", query, isSearching],
    queryFn: async () => {
      try {
        const url = isSearching
          ? `/api/rappers/search/live?q=${encodeURIComponent(query)}`
          : `/api/rappers/search/live?trending=1`;
        const res = await apiRequest("GET", url);
        return res.json();
      } catch {
        return [];
      }
    },
    staleTime: isSearching ? 15000 : 60000,
    refetchInterval: isSearching ? false : 5 * 60 * 1000, // refresh trending every 5 min
    retry: 1,
  });

  const artists = liveArtists ?? [];
  const totalPages = Math.ceil(artists.length / PAGE_SIZE);
  const paginated = artists.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const isEmpty = !isLoading && artists.length === 0;

  const handleSearch = (val: string) => {
    setQuery(val);
    setPage(0);
    setExpandedSlug(null);
  };

  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", paddingBottom: "40px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0 16px" }}>

        <div className="rm-section-header-blue" style={{ marginTop: "20px" }}>[ RAPPER DATABASE ]</div>
        <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#555", marginBottom: "14px" }}>
          Top 10 most analyzed in the last 24 hours. Search to find any artist in the database. Click a name for the full stat breakdown.
        </p>

        {/* Search */}
        <div style={{ marginBottom: "14px" }}>
          <input
            data-testid="input-search-rappers"
            className="rm-input"
            style={{ width: "100%", fontSize: "13px" }}
            placeholder="Search artists by name..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {isLoading && (
          <div className="rm-card" style={{ padding: "24px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#888" }}>
            [ LOADING... ]
          </div>
        )}

        {isEmpty && (
          <div className="rm-card" style={{ padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "16px", color: "#1a3a7a", marginBottom: "8px" }}>
              {query ? `No results for "${query}"` : "No artists yet"}
            </div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#666", maxWidth: "420px", margin: "0 auto" }}>
              {query ? "Try a different name, or run an analysis to add them." : "Artists appear here after their first analysis or comparison. "}
              {!query && <Link href="/"><span style={{ color: "#1a3a7a", textDecoration: "underline", cursor: "pointer" }}>Run an analysis</span></Link>}
              {!query && " to get started."}
            </p>
          </div>
        )}

        {artists.length > 0 && (
          <div>
            <div className="rm-section-header" style={{ marginBottom: "0", background: "#006600", borderColor: "#004400" }}>
              {isSearching
                ? <span>&#9679; SEARCH RESULTS ({artists.length}) &mdash; click a name to expand</span>
                : <span>&#9679; TRENDING NOW &mdash; TOP 10 LAST 24 HRS</span>
              }
            </div>
            <div className="rm-card" style={{ padding: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#004400" }}>
                    <th style={{ padding: "6px 12px", textAlign: "left", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaffaa" }}>Artist</th>
                    <th style={{ padding: "6px 12px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaffaa" }}>Avg</th>
                    <th style={{ padding: "6px 12px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaffaa" }}>Verses</th>
                    <th style={{ padding: "6px 12px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaffaa" }}>Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((a: any, i: number) => {
                    const isExpanded = expandedSlug === a.slug;
                    return (
                      <>
                        <tr
                          key={a.slug}
                          data-testid={`row-rapper-${i}`}
                          style={{ background: i % 2 === 0 ? "#fff" : "#f5f3ef", borderBottom: isExpanded ? "none" : "1px solid #ddd", cursor: "pointer" }}
                          onClick={() => setExpandedSlug(isExpanded ? null : a.slug)}
                        >
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "13px", color: "#1a3a7a" }}>
                              {a.name}
                            </span>
                            {!isSearching && a.recentCount > 0 && (
                              <span style={{ marginLeft: "6px", background: "#c0392b", color: "#fff", fontFamily: "Arial, sans-serif", fontSize: "9px", fontWeight: 700, padding: "1px 5px" }}>
                                {a.recentCount} TODAY
                              </span>
                            )}
                            <span style={{ marginLeft: "6px", fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888" }}>
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "13px", fontWeight: 700, color: "#222" }}>
                            {typeof a.avgScore === "number" ? a.avgScore.toFixed(1) : "—"}
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#666" }}>
                            {a.comparisons}
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "center" }}>
                            <Link href={`/rappers/${a.slug}`}>
                              <span
                                style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#1a3a7a", textDecoration: "underline", cursor: "pointer" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                [ VIEW ]
                              </span>
                            </Link>
                          </td>
                        </tr>

                        {/* Expanded stat breakdown */}
                        {isExpanded && (
                          <tr key={`${a.slug}-expanded`} style={{ background: i % 2 === 0 ? "#fff" : "#f5f3ef", borderBottom: "1px solid #ddd" }}>
                            <td colSpan={4} style={{ padding: "12px 20px 16px" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", maxWidth: "600px" }}>
                                <div>
                                  <StatBar label="Flow" value={a.avgFlow} color="#1a3a7a" />
                                  <StatBar label="Wordplay" value={a.avgWordplay} color="#5c2d91" />
                                  <StatBar label="Storytelling" value={a.avgStorytelling} color="#006600" />
                                  <StatBar label="Rhyming" value={a.avgRhyming} color="#8b4513" />
                                  <StatBar label="Punchlines" value={a.avgPunchlines} color="#8b0000" />
                                </div>
                                <div>
                                  {a.tracks && a.tracks.length > 0 ? (
                                    <div>
                                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: "10px", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>Analyzed Tracks</div>
                                      {a.tracks.map((t: any, ti: number) => (
                                        <div key={ti} style={{ display: "flex", justifyContent: "space-between", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#333", marginBottom: "3px", gap: "8px" }}>
                                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.song}</span>
                                          <span style={{ fontWeight: 700, color: "#1a3a7a", flexShrink: 0 }}>{t.score.toFixed(1)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#aaa" }}>No tracks logged yet</div>
                                  )}
                                  <div style={{ marginTop: "10px", fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888" }}>
                                    {a.comparisons} verse{a.comparisons !== 1 ? "s" : ""} analyzed
                                    {a.battleCount > 0 && ` · ${a.wins}W-${a.losses}L`}
                                    {a.battleCount > 0 && ` · ${a.winRate}% win rate`}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: "6px", marginTop: "10px", alignItems: "center", fontFamily: "Courier New, monospace", fontSize: "11px" }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ padding: "3px 10px", border: "2px solid #1a3a7a", background: page === 0 ? "#eee" : "#1a3a7a", color: page === 0 ? "#999" : "#fff", cursor: page === 0 ? "default" : "pointer" }}
                >
                  &laquo; PREV
                </button>
                <span style={{ color: "#555" }}>
                  Page {page + 1} of {totalPages} ({artists.length} artists)
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  style={{ padding: "3px 10px", border: "2px solid #1a3a7a", background: page >= totalPages - 1 ? "#eee" : "#1a3a7a", color: page >= totalPages - 1 ? "#999" : "#fff", cursor: page >= totalPages - 1 ? "default" : "pointer" }}
                >
                  NEXT &raquo;
                </button>
              </div>
            )}

            <p style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#999", marginTop: "6px" }}>
              * Stats update after every analysis and comparison. W-L counts Standard scoring mode battles only.
            </p>
          </div>
        )}

      </div>
    </main>
  );
}
