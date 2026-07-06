import { Link } from "wouter";
import type { MockArtist } from "../lib/types.js";
import { SingleScoreBar } from "./ScoreBar.js";

interface RapperCardProps {
  artist: MockArtist;
  showBars?: boolean;
  rank?: number;
}

export function RapperCard({ artist, showBars = false, rank }: RapperCardProps) {
  const winRate = artist.totalComparisons > 0
    ? Math.round((artist.wins / artist.totalComparisons) * 100)
    : 0;

  return (
    <Link href={`/rappers/${artist.slug}`}>
      <div
        className="rm-card rm-card-hover"
        style={{ padding: "10px 12px", cursor: "pointer", height: "100%" }}
        data-testid={`card-rapper-${artist.id}`}
      >
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {rank && (
              <span className="rm-label" style={{ color: rank <= 3 ? "#cc0000" : "#666666", marginRight: "4px" }}>
                #{rank}
              </span>
            )}
            <span
              style={{
                fontFamily: "Arial, sans-serif",
                fontWeight: 700,
                fontSize: "13px",
                color: "#0000cc",
                textDecoration: "underline",
              }}
            >
              {artist.name}
            </span>
            <div className="rm-label" style={{ marginTop: "2px" }}>{artist.hometown} &middot; {artist.era}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "8px" }}>
            <div
              style={{
                fontFamily: "Courier New, monospace",
                fontSize: "18px",
                fontWeight: 700,
                color: "#1a3a7a",
              }}
            >
              {artist.overallAverage.toFixed(1)}
            </div>
            <div className="rm-label">RM Score</div>
          </div>
        </div>

        {showBars && (
          <div style={{ borderTop: "1px solid #dddddd", paddingTop: "6px", marginBottom: "6px" }}>
            <SingleScoreBar label="Flow" score={artist.categoryAverages.flow} color="#1a4fa8" animate={false} />
            <SingleScoreBar label="Wordplay" score={artist.categoryAverages.wordplay} color="#8b0000" animate={false} />
            <SingleScoreBar label="Rhyming" score={artist.categoryAverages.rhyming} color="#006600" animate={false} />
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "12px",
            borderTop: "1px solid #eeeeee",
            paddingTop: "5px",
            fontFamily: "Courier New, monospace",
            fontSize: "10px",
            color: "#666666",
          }}
        >
          <span><b style={{ color: "#006600" }}>{winRate}%</b> win rate</span>
          <span><b>{artist.totalComparisons.toLocaleString()}</b> matchups</span>
        </div>
      </div>
    </Link>
  );
}
