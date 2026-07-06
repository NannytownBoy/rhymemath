import { useEffect, useRef, useState } from "react";

interface ScoreBarProps {
  scoreA: number;
  scoreB: number;
  nameA: string;
  nameB: string;
  category: string;
  weight?: number;
  animate?: boolean;
}

export function ScoreBar({ scoreA, scoreB, nameA, nameB, category, weight, animate = true }: ScoreBarProps) {
  const [shown, setShown] = useState(!animate);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate) { setShown(true); return; }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setShown(true); },
      { threshold: 0.2 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [animate]);

  const winner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "TIE";

  return (
    <div ref={ref} style={{ marginBottom: "10px" }}>
      {/* Category row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "3px" }}>
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: 700, color: "#222222" }}>
          {category}
          {weight && (
            <span style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#666666", marginLeft: "6px" }}>
              ({Math.round(weight * 100)}%)
            </span>
          )}
        </span>
        <span style={{ fontFamily: "Courier New, monospace", fontSize: "11px" }}>
          <span style={{ color: winner === "A" ? "#1a4fa8" : "#555555", fontWeight: winner === "A" ? 700 : 400 }}>{scoreA.toFixed(0)}</span>
          <span style={{ color: "#999999", margin: "0 4px" }}>vs</span>
          <span style={{ color: winner === "B" ? "#c0392b" : "#555555", fontWeight: winner === "B" ? 700 : 400 }}>{scoreB.toFixed(0)}</span>
        </span>
      </div>

      {/* Bar A */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
        <span className="rm-label" style={{ width: "12px", color: "#1a4fa8" }}>A</span>
        <div className="rm-score-bar-track" style={{ flex: 1, height: "10px" }}>
          <div
            style={{
              height: "100%",
              width: shown ? `${Math.max(2, scoreA)}%` : "0%",
              background: "#1a4fa8",
              transition: animate ? "width 0.8s ease-out" : "none",
              boxShadow: winner === "A" ? "inset 0 1px 0 rgba(255,255,255,0.3)" : "none",
            }}
          />
        </div>
        <span className="rm-mono" style={{ width: "28px", textAlign: "right", color: "#1a4fa8", fontWeight: winner === "A" ? 700 : 400 }}>
          {scoreA.toFixed(0)}
        </span>
      </div>

      {/* Bar B */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="rm-label" style={{ width: "12px", color: "#c0392b" }}>B</span>
        <div className="rm-score-bar-track" style={{ flex: 1, height: "10px" }}>
          <div
            style={{
              height: "100%",
              width: shown ? `${Math.max(2, scoreB)}%` : "0%",
              background: "#c0392b",
              transition: animate ? "width 0.8s ease-out 0.1s" : "none",
              boxShadow: winner === "B" ? "inset 0 1px 0 rgba(255,255,255,0.3)" : "none",
            }}
          />
        </div>
        <span className="rm-mono" style={{ width: "28px", textAlign: "right", color: "#c0392b", fontWeight: winner === "B" ? 700 : 400 }}>
          {scoreB.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

interface SingleScoreBarProps {
  score: number;
  label: string;
  color?: string;
  animate?: boolean;
}

export function SingleScoreBar({ score, label, color = "#1a4fa8", animate = true }: SingleScoreBarProps) {
  const [shown, setShown] = useState(!animate);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate) { setShown(true); return; }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setShown(true); },
      { threshold: 0.2 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [animate]);

  return (
    <div ref={ref} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
      <span className="rm-label" style={{ width: "80px", flexShrink: 0 }}>{label}</span>
      <div className="rm-score-bar-track" style={{ flex: 1, height: "8px" }}>
        <div
          style={{
            height: "100%",
            width: shown ? `${score}%` : "0%",
            background: color,
            transition: animate ? "width 0.7s ease-out" : "none",
          }}
        />
      </div>
      <span className="rm-mono" style={{ width: "28px", textAlign: "right", color, fontWeight: 700 }}>{typeof score === 'number' ? score.toFixed(1) : score}</span>
    </div>
  );
}
