/**
 * FigureSubmitForm
 * Lets logged-in users flag a missing cultural figure directly from the verse page.
 * Sits below the annotation section — subtle, collapsible, non-intrusive.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getToken } from "../lib/auth";
import { useAuth } from "../context/AuthContext";
import { useLocation } from "wouter";

const MONO = "Courier New, monospace";

const FIGURE_TYPES = ["person", "event", "place", "brand", "scandal"];
const DOMAIN_OPTIONS = [
  "religion", "politics", "sports", "music", "crime",
  "entertainment", "media", "social justice", "business",
];

interface Props {
  /** Pre-fill the figure name from highlighted text */
  prefillName?: string;
  /** The lyric line containing the reference */
  exampleLyric?: string;
}

export function FigureSubmitForm({ prefillName = "", exampleLyric = "" }: Props) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    figureName: prefillName,
    figureType: "person",
    domains: [] as string[],
    culturalContext: "",
    scandalSummary: "",
    era: "",
    exampleLyric,
  });
  const [error, setError] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/figures/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      return data;
    },
    onSuccess: () => { setDone(true); setOpen(false); },
    onError: (e: any) => setError(e.message),
  });

  const toggleDomain = (d: string) =>
    setForm(f => ({
      ...f,
      domains: f.domains.includes(d) ? f.domains.filter(x => x !== d) : [...f.domains, d],
    }));

  if (!user) return (
    <div style={{ fontFamily: MONO, fontSize: 10, color: "#aaa", marginTop: 10 }}>
      <span
        style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}
        onClick={() => setLocation("/login")}
      >
        Sign in
      </span>{" "}to flag missing cultural references
    </div>
  );

  if (done) return (
    <div style={{ fontFamily: MONO, fontSize: 11, color: "#007700", marginTop: 10 }}>
      ✓ Reference flagged for CID review (+10 pts)
    </div>
  );

  return (
    <div style={{ marginTop: 14, borderTop: "1px dotted #ddd", paddingTop: 10 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontFamily: MONO, fontSize: 10, color: "#888",
          textDecoration: "underline", textDecorationStyle: "dotted",
        }}
      >
        {open ? "▾ cancel" : "▸ flag a missing cultural reference"}
      </button>

      {open && (
        <div style={{ marginTop: 10, padding: "12px 14px", background: "#fafaf8", border: "1px solid #ddd" }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: "#555", marginBottom: 10 }}>
            Is a person, event, or reference in this verse missing from RhymeMath's cultural database?
            Flag it here and earn +10 pts. If approved, +50 pts bonus.
          </div>

          {/* Figure name */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontFamily: MONO, fontSize: 10, color: "#444", display: "block", marginBottom: 3 }}>
              Name / Reference *
            </label>
            <input
              value={form.figureName}
              onChange={e => setForm(f => ({ ...f, figureName: e.target.value }))}
              placeholder="e.g. TD Jakes, Diddy, Jan 6..."
              style={{ width: "100%", fontFamily: MONO, fontSize: 12, padding: "5px 8px", border: "1px solid #ccc", boxSizing: "border-box" }}
            />
          </div>

          {/* Type + Era row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontFamily: MONO, fontSize: 10, color: "#444", display: "block", marginBottom: 3 }}>Type</label>
              <select
                value={form.figureType}
                onChange={e => setForm(f => ({ ...f, figureType: e.target.value }))}
                style={{ width: "100%", fontFamily: MONO, fontSize: 11, padding: "4px 6px", border: "1px solid #ccc" }}
              >
                {FIGURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontFamily: MONO, fontSize: 10, color: "#444", display: "block", marginBottom: 3 }}>Era</label>
              <input
                value={form.era}
                onChange={e => setForm(f => ({ ...f, era: e.target.value }))}
                placeholder="e.g. 2020s, 1990s-2000s"
                style={{ width: "100%", fontFamily: MONO, fontSize: 11, padding: "4px 6px", border: "1px solid #ccc", boxSizing: "border-box" }}
              />
            </div>
          </div>

          {/* Domains */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#444", marginBottom: 4 }}>Domains</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {DOMAIN_OPTIONS.map(d => (
                <button key={d} onClick={() => toggleDomain(d)} style={{
                  fontFamily: MONO, fontSize: 9, padding: "2px 8px", cursor: "pointer",
                  background: form.domains.includes(d) ? "#1a3a7a" : "#eee",
                  color: form.domains.includes(d) ? "#fff" : "#555",
                  border: "1px solid #ccc",
                }}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Why it matters in rap */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontFamily: MONO, fontSize: 10, color: "#444", display: "block", marginBottom: 3 }}>
              Why does this appear in rap? (optional)
            </label>
            <textarea
              value={form.culturalContext}
              onChange={e => setForm(f => ({ ...f, culturalContext: e.target.value }))}
              rows={2}
              placeholder="e.g. TD Jakes 2023 scandal became shorthand for 'switching sides'..."
              style={{ width: "100%", fontFamily: MONO, fontSize: 11, padding: "4px 6px", border: "1px solid #ccc", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>

          {/* Example lyric (pre-filled from verse selection if available) */}
          {form.exampleLyric && (
            <div style={{ marginBottom: 8, fontFamily: MONO, fontSize: 10, color: "#888" }}>
              Example lyric: <em>"{form.exampleLyric}"</em>
            </div>
          )}

          {error && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#cc0000", marginBottom: 6 }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={() => submit.mutate()}
              disabled={!form.figureName.trim() || submit.isPending}
              style={{
                fontFamily: MONO, fontSize: 11, padding: "5px 14px",
                background: "#1a3a7a", color: "#fff", border: "none", cursor: "pointer",
                opacity: !form.figureName.trim() || submit.isPending ? 0.5 : 1,
              }}
            >
              {submit.isPending ? "Submitting..." : "Flag Reference (+10 pts)"}
            </button>
            <button onClick={() => setOpen(false)} style={{
              fontFamily: MONO, fontSize: 11, padding: "5px 10px",
              background: "none", color: "#666", border: "1px solid #ccc", cursor: "pointer",
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
