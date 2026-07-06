import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface VerseSearchResult {
  resultId: string;
  artistName: string;
  songName: string;
  verseLabel: string | null;
  verse: string;
  scoreOverall: number;
  scoreFlow: number;
  scoreWordplay: number;
  scoreStorytelling: number;
  scoreRhyming: number;
  scorePunchlines: number;
  createdAt: number;
}

interface Props {
  onSelect: (result: VerseSearchResult) => void;
  placeholder?: string;
  label?: string;
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  zIndex: 100,
  background: "#fff",
  border: "2px solid #1a3a7a",
  borderTop: "none",
  maxHeight: "320px",
  overflowY: "auto",
  fontFamily: "Courier New, monospace",
};

const rowStyle = (hovered: boolean): React.CSSProperties => ({
  padding: "10px 12px",
  borderBottom: "1px solid #ddd",
  cursor: "pointer",
  background: hovered ? "#eef2ff" : "#fff",
});

export default function VerseSearch({ onSelect, placeholder = "Search artist, song, or lyric...", label }: Props) {
  const [q, setQ] = useState("");
  const [artistFilter, setArtistFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Distinct artists for filter dropdown
  const { data: artists = [] } = useQuery<string[]>({
    queryKey: ["/api/verses/artists"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/verses/artists");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Debounced search
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const shouldSearch = debouncedQ.length >= 2 || artistFilter.length > 0;

  const { data: results = [], isFetching } = useQuery<VerseSearchResult[]>({
    queryKey: ["/api/verses/search", debouncedQ, artistFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (artistFilter) params.set("artist", artistFilter);
      params.set("limit", "10");
      const res = await apiRequest("GET", `/api/verses/search?${params.toString()}`);
      return res.json();
    },
    enabled: shouldSearch,
    staleTime: 30_000,
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (r: VerseSearchResult) => {
    onSelect(r);
    setQ("");
    setArtistFilter("");
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} style={{ marginBottom: "12px" }}>
      {label && (
        <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "11px", fontWeight: 900, color: "#1a3a7a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
          {label}
        </div>
      )}

      {/* Artist filter row */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
        <select
          value={artistFilter}
          onChange={e => { setArtistFilter(e.target.value); setOpen(true); }}
          data-testid="select-artist-filter"
          style={{
            fontFamily: "Courier New, monospace",
            fontSize: "12px",
            border: "2px solid #1a3a7a",
            padding: "6px 8px",
            background: "#fff",
            color: artistFilter ? "#1a3a7a" : "#888",
            flex: "0 0 auto",
            minWidth: "160px",
          }}
        >
          <option value="">All Artists</option>
          {artists.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => { if (shouldSearch) setOpen(true); }}
            placeholder={placeholder}
            data-testid="input-verse-search"
            style={{
              width: "100%",
              fontFamily: "Courier New, monospace",
              fontSize: "13px",
              border: "2px solid #1a3a7a",
              padding: "6px 10px",
              background: "#fff",
              boxSizing: "border-box",
            }}
          />

          {open && shouldSearch && (
            <div style={panelStyle}>
              {isFetching && (
                <div style={{ padding: "10px 12px", color: "#888", fontSize: "12px" }}>Searching...</div>
              )}
              {!isFetching && results.length === 0 && (
                <div style={{ padding: "10px 12px", color: "#888", fontSize: "12px" }}>No previously analyzed verses found.</div>
              )}
              {!isFetching && results.map((r, i) => (
                <div
                  key={r.resultId}
                  style={rowStyle(hoveredIdx === i)}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(-1)}
                  onMouseDown={() => handleSelect(r)}
                  data-testid={`verse-result-${r.resultId}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700, fontSize: "13px", color: "#1a3a7a" }}>{r.artistName}</span>
                    <span style={{
                      fontFamily: "Courier New, monospace",
                      fontSize: "11px",
                      background: "#1a3a7a",
                      color: "#fff",
                      padding: "1px 6px",
                    }}>{r.scoreOverall.toFixed(1)}</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
                    {r.songName}{r.verseLabel ? ` — ${r.verseLabel}` : ""}
                  </div>
                  <div style={{ fontSize: "11px", color: "#888", marginTop: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.verse.slice(0, 80)}{r.verse.length > 80 ? "..." : ""}
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "4px", fontSize: "10px", color: "#555" }}>
                    <span>Flow {r.scoreFlow.toFixed(0)}</span>
                    <span>Wordplay {r.scoreWordplay.toFixed(0)}</span>
                    <span>Story {r.scoreStorytelling.toFixed(0)}</span>
                    <span>Rhyme {r.scoreRhyming.toFixed(0)}</span>
                    <span>Punch {r.scorePunchlines.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
