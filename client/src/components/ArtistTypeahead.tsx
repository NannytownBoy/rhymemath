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
  value: string;
  onChange: (val: string) => void;
  onSelectVerse: (result: VerseSearchResult) => void;
  placeholder?: string;
  testId?: string;
  inputStyle?: React.CSSProperties;
}

export default function ArtistTypeahead({ value, onChange, onSelectVerse, placeholder, testId, inputStyle }: Props) {
  const [open, setOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounce
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(t);
  }, [value]);

  const shouldSearch = debounced.trim().length >= 2;

  // Search by artist name ONLY — do not match on verse text or song title
  const { data: results = [], isFetching } = useQuery<VerseSearchResult[]>({
    queryKey: ["/api/verses/search", "artist-typeahead", debounced],
    queryFn: async () => {
      const params = new URLSearchParams({ artist: debounced.trim(), limit: "8" });
      const res = await apiRequest("GET", `/api/verses/search?${params.toString()}`);
      return res.json();
    },
    enabled: shouldSearch,
    staleTime: 30_000,
  });

  // Deduplicate by artistName for the typeahead suggestions
  const artistSuggestions = Array.from(
    new Map(results.map(r => [r.artistName.toLowerCase(), r])).values()
  );

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

  const handlePickArtist = (r: VerseSearchResult) => {
    onChange(r.artistName);
    // If they pick an artist, also offer their most recent verse
    onSelectVerse(r);
    setOpen(false);
    setHoveredIdx(-1);
  };

  const showDropdown = open && shouldSearch && (isFetching || artistSuggestions.length > 0);

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (shouldSearch) setOpen(true); }}
        placeholder={placeholder}
        data-testid={testId}
        className="rm-input"
        style={{ width: "100%", ...inputStyle }}
        autoComplete="off"
      />

      {showDropdown && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 200,
          background: "#fff",
          border: "2px solid #1a3a7a",
          borderTop: "none",
          fontFamily: "Courier New, monospace",
          maxHeight: "240px",
          overflowY: "auto",
        }}>
          {isFetching && (
            <div style={{ padding: "8px 10px", fontSize: "11px", color: "#888" }}>searching...</div>
          )}
          {!isFetching && artistSuggestions.map((r, i) => (
            <div
              key={r.artistName}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(-1)}
              onMouseDown={() => handlePickArtist(r)}
              data-testid={`artist-suggestion-${i}`}
              style={{
                padding: "8px 10px",
                borderBottom: "1px solid #e8e8e8",
                cursor: "pointer",
                background: hoveredIdx === i ? "#eef2ff" : "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, fontSize: "13px", color: "#1a3a7a" }}>{r.artistName}</span>
                <span style={{ fontSize: "10px", background: "#1a3a7a", color: "#fff", padding: "1px 5px" }}>
                  {r.scoreOverall.toFixed(1)}
                </span>
              </div>
              <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                {r.songName}{r.verseLabel ? ` · ${r.verseLabel}` : ""} — click to load verse
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
