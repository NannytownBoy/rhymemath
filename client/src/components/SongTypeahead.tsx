import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { VerseSearchResult } from "./ArtistTypeahead";

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSelectVerse: (result: VerseSearchResult) => void;
  artistName: string; // filter songs to this artist
  placeholder?: string;
  testId?: string;
}

export default function SongTypeahead({ value, onChange, onSelectVerse, artistName, placeholder, testId }: Props) {
  const [open, setOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounce song input
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(t);
  }, [value]);

  // Need either an artist name or 2+ chars typed to search
  const shouldSearch = artistName.trim().length > 0 || debounced.trim().length >= 2;

  const { data: results = [], isFetching } = useQuery<VerseSearchResult[]>({
    queryKey: ["/api/verses/search", "song-typeahead", artistName, debounced],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "10" });
      if (artistName.trim()) params.set("artist", artistName.trim());
      if (debounced.trim()) params.set("q", debounced.trim());
      const res = await apiRequest("GET", `/api/verses/search?${params.toString()}`);
      return res.json();
    },
    enabled: shouldSearch,
    staleTime: 30_000,
  });

  // Filter results to match song title if user is typing
  const filtered = debounced.trim().length >= 1
    ? results.filter(r => r.songName.toLowerCase().includes(debounced.toLowerCase()))
    : results;

  // Deduplicate by songName + verseLabel
  const seen = new Set<string>();
  const suggestions = filtered.filter(r => {
    const key = `${r.songName.toLowerCase()}|${r.verseLabel ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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

  // Auto-open when artist is set and field is focused
  const handleFocus = () => {
    if (shouldSearch) setOpen(true);
  };

  const handlePick = (r: VerseSearchResult) => {
    onChange(r.songName);
    onSelectVerse(r);
    setOpen(false);
    setHoveredIdx(-1);
  };

  const showDropdown = open && shouldSearch && (isFetching || suggestions.length > 0);

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={handleFocus}
        placeholder={placeholder}
        data-testid={testId}
        className="rm-input"
        style={{ width: "100%" }}
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
          maxHeight: "220px",
          overflowY: "auto",
        }}>
          {isFetching && (
            <div style={{ padding: "8px 10px", fontSize: "11px", color: "#888" }}>searching...</div>
          )}
          {!isFetching && suggestions.map((r, i) => (
            <div
              key={`${r.songName}-${r.verseLabel}-${i}`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(-1)}
              onMouseDown={() => handlePick(r)}
              data-testid={`song-suggestion-${i}`}
              style={{
                padding: "8px 10px",
                borderBottom: "1px solid #e8e8e8",
                cursor: "pointer",
                background: hoveredIdx === i ? "#eef2ff" : "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, fontSize: "13px", color: "#1a3a7a" }}>
                  {r.songName}{r.verseLabel ? ` · ${r.verseLabel}` : ""}
                </span>
                <span style={{ fontSize: "10px", background: "#1a3a7a", color: "#fff", padding: "1px 5px" }}>
                  {r.scoreOverall.toFixed(1)}
                </span>
              </div>
              <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                {r.artistName} — click to load verse
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
