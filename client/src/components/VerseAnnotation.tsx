// ─── Verse Annotation Component ───────────────────────────────────────────────
// Renders an annotated verse with highlighted rhyme clusters, assonance,
// punchlines, and chain connections. Yellow for Verse A, Pink for Verse B.

interface AnnotatedToken {
  word: string;
  tags: string[];
  chainGroup?: number;
}

interface AnnotatedLine {
  raw: string;
  tokens: AnnotatedToken[];
  badges: string[];
}

interface Props {
  lines: AnnotatedLine[];
  side: "A" | "B"; // A = yellow palette, B = pink palette
  artistName: string;
}

// Chain group colors — 8 distinct hues that rotate
const CHAIN_COLORS_A = [
  "#ffe066", // gold
  "#a8e063", // lime
  "#66d9e8", // cyan
  "#ffa94d", // orange
  "#da77f2", // purple
  "#74c0fc", // blue
  "#f783ac", // pink
  "#63e6be", // teal
];
const CHAIN_COLORS_B = [
  "#f783ac", // hot pink
  "#ffa2b6", // salmon
  "#e599f7", // lavender
  "#ff8787", // red-pink
  "#ffd43b", // yellow
  "#74c0fc", // blue
  "#63e6be", // teal
  "#a9e34b", // lime
];

const BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  "END RHYME":    { bg: "#1a3a7a", color: "#ffffff" },
  "ASSONANCE":    { bg: "#006600", color: "#ffffff" },
  "ALLITERATION": { bg: "#8b0000", color: "#ffffff" },
  "PUNCHLINE":    { bg: "#b8860b", color: "#ffffff" },
  "ANAPHORA":     { bg: "#555555", color: "#ffffff" },
};

function getTokenStyle(token: AnnotatedToken, side: "A" | "B"): React.CSSProperties {
  const chainColors = side === "A" ? CHAIN_COLORS_A : CHAIN_COLORS_B;
  const primaryTag = token.tags[0];

  if (primaryTag === "plain") return {};

  // Chain / internal rhyme — use chain group color
  if (primaryTag === "rhyme-internal" || primaryTag === "chain") {
    const color = chainColors[(token.chainGroup ?? 0) % chainColors.length];
    return {
      background: color,
      color: "#111",
      padding: "1px 3px",
      borderRadius: "0",
      fontWeight: 700,
    };
  }

  // End rhyme — strong underline in side color
  if (primaryTag === "rhyme-end") {
    return {
      borderBottom: `3px solid ${side === "A" ? "#cc9900" : "#cc3366"}`,
      fontWeight: 700,
      paddingBottom: "1px",
    };
  }

  // Assonance — subtle tinted background
  if (primaryTag === "assonance") {
    return {
      background: side === "A" ? "rgba(255,220,50,0.35)" : "rgba(255,100,150,0.25)",
      padding: "1px 2px",
    };
  }

  // Anaphora — italic + colored
  if (primaryTag === "anaphora") {
    return {
      color: side === "A" ? "#996600" : "#880033",
      fontStyle: "italic",
      fontWeight: 700,
    };
  }

  return {};
}

export default function VerseAnnotation({ lines, side, artistName }: Props) {
  const accentColor = side === "A" ? "#cc9900" : "#cc0044";
  const headerBg = side === "A" ? "#1a3a7a" : "#8b0000";
  const emptyMsg = side === "A"
    ? "No verse text provided — name-based scoring only."
    : "No verse text provided — name-based scoring only.";

  // Check if this is a placeholder verse
  const isPlaceholder = lines.length === 1 && lines[0].raw.startsWith("[No verse");

  return (
    <div style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
      {/* Artist header */}
      <div style={{
        background: headerBg,
        color: "#ffffff",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "11px",
        fontWeight: 700,
        padding: "4px 10px",
        letterSpacing: "0.08em",
      }}>
        {side === "A" ? "▶ VERSE A" : "▶ VERSE B"}: {artistName.toUpperCase()}
      </div>

      {/* Legend */}
      <div style={{
        background: "#f0ede8",
        borderBottom: "1px solid #ddd",
        padding: "4px 10px",
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        alignItems: "center",
      }}>
        <span style={{ fontFamily: "Courier New, monospace", fontSize: "9px", color: "#888", marginRight: "4px" }}>KEY:</span>
        <span style={{ background: accentColor, color: "#fff", fontSize: "9px", padding: "1px 5px", fontFamily: "Courier New, monospace", fontWeight: 700 }}>CHAIN</span>
        <span style={{ borderBottom: `2px solid ${accentColor}`, fontSize: "9px", padding: "0 4px", fontFamily: "Courier New, monospace" }}>END RHYME</span>
        <span style={{ background: side === "A" ? "rgba(255,220,50,0.5)" : "rgba(255,100,150,0.35)", fontSize: "9px", padding: "1px 5px", fontFamily: "Courier New, monospace" }}>ASSONANCE</span>
        {Object.entries(BADGE_COLORS).map(([label, { bg, color }]) => (
          <span key={label} style={{ background: bg, color, fontSize: "8px", padding: "1px 4px", fontFamily: "Courier New, monospace", fontWeight: 700 }}>
            {label}
          </span>
        ))}
      </div>

      {/* Verse lines */}
      {isPlaceholder ? (
        <div style={{ padding: "16px", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#999", background: "#fff", fontStyle: "italic" }}>
          {emptyMsg}
        </div>
      ) : (
        <div style={{ background: "#ffffff", padding: "0" }}>
          {lines.map((line, li) => (
            <div
              key={li}
              style={{
                padding: "5px 10px",
                borderBottom: li < lines.length - 1 ? "1px solid #f0ede8" : "none",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                background: li % 2 === 0 ? "#ffffff" : "#faf9f6",
              }}
            >
              {/* Line number */}
              <span style={{
                fontFamily: "Courier New, monospace",
                fontSize: "9px",
                color: "#bbbbbb",
                minWidth: "16px",
                paddingTop: "3px",
                flexShrink: 0,
              }}>
                {li + 1}
              </span>

              {/* Tokens */}
              <span style={{ flex: 1, fontSize: "12px", lineHeight: "1.8", wordBreak: "break-word" }}>
                {line.tokens.map((token, ti) => (
                  <span key={ti}>
                    <span style={getTokenStyle(token, side)}>
                      {token.word}
                    </span>
                    {ti < line.tokens.length - 1 ? " " : ""}
                  </span>
                ))}
              </span>

              {/* Line badges */}
              {line.badges.length > 0 && (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  flexShrink: 0,
                  paddingTop: "3px",
                }}>
                  {line.badges.map(badge => {
                    const style = BADGE_COLORS[badge] ?? { bg: "#888", color: "#fff" };
                    return (
                      <span
                        key={badge}
                        style={{
                          background: style.bg,
                          color: style.color,
                          fontSize: "8px",
                          fontFamily: "Courier New, monospace",
                          fontWeight: 700,
                          padding: "1px 4px",
                          letterSpacing: "0.05em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {badge}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
