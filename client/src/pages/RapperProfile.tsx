import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { SingleScoreBar } from "../components/ScoreBar.js";
import { apiRequest } from "@/lib/queryClient";

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function RapperProfile() {
  const { slug } = useParams<{ slug: string }>();

  // Try live data first (real comparisons)
  const { data: liveProfile, isLoading: liveLoading } = useQuery<any>({
    queryKey: ["/api/rappers", slug, "live"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/rappers/${slug}/live`);
      if (!res.ok) throw new Error("No live data");
      return res.json();
    },
    enabled: !!slug,
    retry: false,
  });

  // Fall back to mock artist data
  const { data: mockArtist, isLoading: mockLoading } = useQuery<any>({
    queryKey: ["/api/rappers", slug],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/rappers/${slug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!slug && !liveProfile,
    retry: false,
  });

  const isLoading = liveLoading || (mockLoading && !liveProfile);
  const profile = liveProfile || mockArtist;

  if (isLoading) {
    return (
      <main style={{ background: "#f7f5f0", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: "Courier New, monospace", fontSize: "12px", color: "#888" }}>[ LOADING PROFILE... ]</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main style={{ background: "#f7f5f0", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", border: "1px solid #bbbbbb", background: "#fff", padding: "24px" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#666", marginBottom: "12px" }}>Artist not found.</p>
          <Link href="/rappers">
            <div className="rm-btn-primary" style={{ display: "inline-block", cursor: "pointer" }}>[ BACK TO DATABASE ]</div>
          </Link>
        </div>
      </main>
    );
  }

  const isLive = !!liveProfile;
  const wins = profile.wins ?? 0;
  const losses = profile.losses ?? 0;
  const totalComparisons = profile.totalComparisons ?? 0;
  const winRate = totalComparisons > 0 ? Math.round((wins / totalComparisons) * 100) : 0;
  const overallAverage = profile.overallAverage ?? 0;
  const bestVerseScore = profile.bestVerseScore ?? 0;
  const bestVerseTitle = profile.bestVerseTitle ?? "";
  const bestVerseLabel = profile.bestVerseLabel ?? "";

  const categoryAverages = typeof profile.categoryAverages === "string"
    ? JSON.parse(profile.categoryAverages)
    : profile.categoryAverages ?? {};

  const cats = [
    { label: "Flow", key: "flow" },
    { label: "Wordplay", key: "wordplay" },
    { label: "Storytelling", key: "storytelling" },
    { label: "Rhyming", key: "rhyming" },
    { label: "Punchlines", key: "punchlines" },
  ];

  const recentMatchups = profile.recentMatchups ?? profile.recentComparisons ?? [];

  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", paddingBottom: "40px" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "0 16px" }}>

        {/* Breadcrumb */}
        <div style={{ marginTop: "14px", marginBottom: "12px", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#666" }}>
          <Link href="/rappers">
            <span style={{ color: "#1a3a7a", textDecoration: "underline", cursor: "pointer" }}>Rapper Database</span>
          </Link>
          {" > "}<strong>{profile.name}</strong>
        </div>

        {/* Live data badge */}
        {isLive && (
          <div style={{
            background: "#006600", color: "#fff",
            fontFamily: "Courier New, monospace", fontSize: "10px",
            padding: "3px 10px", display: "inline-block", marginBottom: "8px", fontWeight: "bold",
          }}>
            &#9679; LIVE DATA &mdash; built from {totalComparisons} real comparison{totalComparisons !== 1 ? "s" : ""}
          </div>
        )}
        {!isLive && (
          <div style={{
            background: "#888888", color: "#fff",
            fontFamily: "Courier New, monospace", fontSize: "10px",
            padding: "3px 10px", display: "inline-block", marginBottom: "8px",
          }}>
            MOCK DATA &mdash; run a comparison to generate live stats
          </div>
        )}

        {/* Profile header */}
        <div style={{ border: "1px solid #bbbbbb", background: "#ffffff", marginBottom: "12px" }}>
          <div className="rm-section-header-blue" style={{ margin: 0 }}>
            {profile.name.toUpperCase()}
            {profile.realName && (
              <span style={{ fontWeight: "normal", fontSize: "11px", marginLeft: "10px", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
                ({profile.realName})
              </span>
            )}
          </div>

          <div style={{ padding: "12px 16px", display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* Initials badge */}
            <div style={{
              width: "56px", height: "56px", background: "#1a3a7a", color: "#ffffff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "20px", fontFamily: "Arial Black, Arial, sans-serif", fontWeight: "900",
              flexShrink: 0, border: "2px outset #0d1f4a",
            }}>
              {profile.name.slice(0, 2).toUpperCase()}
            </div>

            {/* Bio info */}
            <div style={{ flex: 1, minWidth: "160px" }}>
              <table style={{ borderCollapse: "collapse", fontFamily: "Arial, sans-serif", fontSize: "12px" }}>
                <tbody>
                  {profile.hometown && (
                    <tr>
                      <td style={{ paddingRight: "12px", fontWeight: "bold", color: "#555", paddingBottom: "3px" }}>Hometown:</td>
                      <td style={{ color: "#222", paddingBottom: "3px" }}>{profile.hometown}</td>
                    </tr>
                  )}
                  {profile.era && (
                    <tr>
                      <td style={{ paddingRight: "12px", fontWeight: "bold", color: "#555", paddingBottom: "3px" }}>Era:</td>
                      <td style={{ color: "#222", paddingBottom: "3px" }}>{profile.era}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ paddingRight: "12px", fontWeight: "bold", color: "#555", paddingBottom: "3px" }}>Record:</td>
                    <td style={{ color: "#222", paddingBottom: "3px", fontFamily: "Courier New, monospace" }}>
                      <span style={{ color: "#006600", fontWeight: "bold" }}>{wins}W</span>
                      {" – "}
                      <span style={{ color: "#8b0000", fontWeight: "bold" }}>{losses}L</span>
                      {profile.ties > 0 && <span style={{ color: "#888800" }}> – {profile.ties}D</span>}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: "12px", fontWeight: "bold", color: "#555" }}>Win Rate:</td>
                    <td style={{ color: winRate >= 50 ? "#006600" : "#8b0000", fontFamily: "Courier New, monospace", fontWeight: "bold" }}>
                      {winRate}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* RM Score */}
            <div style={{
              textAlign: "center", border: "2px outset #bbbbbb",
              background: "#f0f0f0", padding: "10px 16px", flexShrink: 0,
            }}>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: "28px", fontWeight: "bold", color: "#1a3a7a", lineHeight: 1 }}>
                {overallAverage.toFixed(1)}
              </div>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#666", marginTop: "4px", fontWeight: "bold" }}>
                RM SCORE
              </div>
            </div>
          </div>

          {profile.bio && (
            <div style={{ borderTop: "1px solid #e0e0e0", padding: "10px 16px" }}>
              <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#444", lineHeight: "1.6", margin: 0 }}>
                {profile.bio}
              </p>
            </div>
          )}
        </div>

        {/* Career Stats */}
        <div style={{ border: "1px solid #bbbbbb", background: "#fff", marginBottom: "12px" }}>
          <div className="rm-section-header" style={{ margin: 0 }}>[ CAREER STATS ]</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: "12px" }}>
            <tbody>
              <tr style={{ background: "#f5f3ef" }}>
                <td style={{ padding: "6px 14px", fontWeight: "bold", color: "#555", borderBottom: "1px solid #e0e0e0" }}>Total Comparisons</td>
                <td style={{ padding: "6px 14px", color: "#1a3a7a", fontWeight: "bold", borderBottom: "1px solid #e0e0e0", textAlign: "right" }}>
                  {totalComparisons.toLocaleString()}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 14px", fontWeight: "bold", color: "#555", borderBottom: "1px solid #e0e0e0" }}>Best Verse Score</td>
                <td style={{ padding: "6px 14px", color: "#006600", fontWeight: "bold", borderBottom: "1px solid #e0e0e0", textAlign: "right" }}>
                  {bestVerseScore.toFixed(1)}
                  {bestVerseTitle && (
                    <span style={{ fontFamily: "Georgia, serif", fontSize: "11px", color: "#888", marginLeft: "8px", fontStyle: "italic", fontWeight: "normal" }}>
                      {bestVerseTitle}{bestVerseLabel ? ` (${bestVerseLabel})` : ""}
                    </span>
                  )}
                </td>
              </tr>
              <tr style={{ background: "#f5f3ef" }}>
                <td style={{ padding: "6px 14px", fontWeight: "bold", color: "#555" }}>Overall RM Average</td>
                <td style={{ padding: "6px 14px", color: "#1a3a7a", fontWeight: "bold", textAlign: "right" }}>
                  {overallAverage.toFixed(1)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Category averages */}
        <div style={{ border: "1px solid #bbbbbb", background: "#fff", marginBottom: "12px" }}>
          <div className="rm-section-header" style={{ margin: 0 }}>[ CATEGORY AVERAGES ]</div>
          <div style={{ padding: "12px 16px" }}>
            <div style={{ display: "grid", gap: "10px" }}>
              {cats.map(({ label, key }) => (
                <SingleScoreBar
                  key={key}
                  label={label}
                  score={categoryAverages[key] ?? 0}
                  color="#1a4fa8"
                  animate={true}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Recent matchups — live version shows more detail */}
        {recentMatchups.length > 0 && (
          <div style={{ border: "1px solid #bbbbbb", background: "#fff", marginBottom: "12px" }}>
            <div className="rm-section-header" style={{ margin: 0 }}>[ RECENT HEAD-TO-HEAD ]</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Arial, sans-serif", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#e0e8ff" }}>
                  <th style={{ padding: "5px 14px", textAlign: "left", fontWeight: "bold", color: "#1a3a7a", fontSize: "11px", borderBottom: "1px solid #bbbbbb" }}>Song / Verse</th>
                  <th style={{ padding: "5px 14px", textAlign: "left", fontWeight: "bold", color: "#1a3a7a", fontSize: "11px", borderBottom: "1px solid #bbbbbb" }}>Opponent</th>
                  <th style={{ padding: "5px 14px", textAlign: "right", fontWeight: "bold", color: "#1a3a7a", fontSize: "11px", borderBottom: "1px solid #bbbbbb" }}>Score</th>
                  <th style={{ padding: "5px 14px", textAlign: "right", fontWeight: "bold", color: "#1a3a7a", fontSize: "11px", borderBottom: "1px solid #bbbbbb" }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {recentMatchups.map((comp: any, i: number) => {
                  const result = comp.result ?? (comp.myScore > comp.oppScore ? "W" : comp.myScore < comp.oppScore ? "L" : "TIE");
                  const songDisplay = comp.song ?? comp.opponent;
                  const labelDisplay = comp.verseLabel ?? null;
                  const opponent = comp.opponent ?? "Unknown";
                  const resultId = comp.resultId;
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#ffffff" : "#f5f3ef" }}>
                      <td style={{ padding: "5px 14px", borderBottom: "1px solid #e8e8e8" }}>
                        <span style={{ color: "#222" }}>{songDisplay}</span>
                        {labelDisplay && (
                          <span style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#1a3a7a", marginLeft: "6px" }}>
                            [{labelDisplay}]
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "5px 14px", color: "#555", borderBottom: "1px solid #e8e8e8" }}>
                        vs {opponent}
                      </td>
                      <td style={{ padding: "5px 14px", textAlign: "right", fontFamily: "Courier New, monospace", color: "#555", borderBottom: "1px solid #e8e8e8" }}>
                        {comp.myScore ?? comp.score}
                        {comp.oppScore !== undefined && <span style={{ color: "#999" }}> / {comp.oppScore}</span>}
                      </td>
                      <td style={{ padding: "5px 14px", textAlign: "right", borderBottom: "1px solid #e8e8e8" }}>
                        {resultId ? (
                          <a href={`/#/results/${resultId}`} style={{ textDecoration: "none" }}>
                            <span style={{
                              fontFamily: "Courier New, monospace", fontWeight: "bold", fontSize: "12px",
                              color: result === "W" ? "#006600" : result === "L" ? "#8b0000" : "#7a6000",
                            }}>
                              {result === "W" ? "[WIN]" : result === "L" ? "[LOSS]" : "[DRAW]"}
                            </span>
                          </a>
                        ) : (
                          <span style={{
                            fontFamily: "Courier New, monospace", fontWeight: "bold", fontSize: "12px",
                            color: result === "W" ? "#006600" : result === "L" ? "#8b0000" : "#7a6000",
                          }}>
                            {result === "W" ? "[WIN]" : result === "L" ? "[LOSS]" : "[DRAW]"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* CTA */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <Link href={`/?a=${encodeURIComponent(profile.name)}`}>
            <div className="rm-btn-primary" style={{ display: "inline-block", cursor: "pointer" }}>
              [ COMPARE A VERSE BY {profile.name.toUpperCase()} ]
            </div>
          </Link>
        </div>

      </div>
    </main>
  );
}
