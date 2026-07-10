/**
 * AnnotationOverlay
 * Renders a verse with:
 *  1. Teal glow on CID-matched tokens (from cidTokens prop)
 *  2. Highlight on user-selected text to submit new annotations
 *  3. Sidebar showing approved annotations for this verse
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { getToken } from "../lib/auth";
import { useLocation } from "wouter";

const MONO = "Courier New, monospace";
const BLUE = "#1a3a7a";
const TEAL = "#00b8c8";

interface CIDToken {
  term: string;
  matchType: "cultural" | "entendre" | "alias";
  meaning?: string;
}

interface Props {
  verse: string;
  analysisId?: string;
  comparisonId?: string;
  side?: "A" | "B";
  cidTokens?: CIDToken[];
  artistName?: string;
}

interface AnnotationDraft {
  anchorText: string;
  startIndex: number;
  endIndex: number;
}

const MEANING_TYPES = [
  { value: "double_entendre", label: "Double Entendre" },
  { value: "punchline", label: "Punchline" },
  { value: "cultural_ref", label: "Cultural Reference" },
  { value: "wordplay", label: "Wordplay" },
  { value: "metaphor", label: "Metaphor" },
  { value: "historical_ref", label: "Historical Reference" },
];

export function AnnotationOverlay({ verse, analysisId, comparisonId, side, cidTokens = [], artistName }: Props) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const verseRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const [form, setForm] = useState({
    meaningType: "double_entendre", meaning: "",
    interpretation1: "", interpretation2: "", interpretation3: "",
    domainTags: "",
  });
  const [submitted, setSubmitted] = useState(false);

  // Fetch existing approved annotations for this verse
  const queryKey = analysisId
    ? ["/api/annotations", analysisId]
    : ["/api/annotations", comparisonId, side];

  const { data: existingAnnotations = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = analysisId
        ? `analysisId=${analysisId}`
        : `comparisonId=${comparisonId}`;
      const res = await fetch(`/api/annotations?${params}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      return res.json();
    },
    enabled: !!(analysisId || comparisonId),
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey });
      setDraft(null);
      setSubmitted(true);
      setForm({ meaningType: "double_entendre", meaning: "", interpretation1: "", interpretation2: "", interpretation3: "", domainTags: "" });
      setTimeout(() => setSubmitted(false), 3000);
    },
  });

  // Highlight CID tokens in verse text
  function renderVerse() {
    if (!verse) return null;
    const lines = verse.split("\n");

    // Build a set of teal-highlighted ranges from CID tokens
    const cidRanges: Array<{ start: number; end: number; token: CIDToken }> = [];
    if (cidTokens.length > 0) {
      let offset = 0;
      for (const line of lines) {
        for (const tok of cidTokens) {
          const idx = line.toLowerCase().indexOf(tok.term.toLowerCase());
          if (idx >= 0) {
            cidRanges.push({ start: offset + idx, end: offset + idx + tok.term.length, token: tok });
          }
        }
        offset += line.length + 1;
      }
    }

    // Build approved annotation ranges for underline
    const annRanges = (existingAnnotations as any[]).filter(a => a.status === "approved" && a.start_index != null);

    // Render inline — simplified: highlight full lines containing CID matches
    return lines.map((line, li) => {
      const hasCID = cidTokens.some(tok => line.toLowerCase().includes(tok.term.toLowerCase()));
      const matchedToken = hasCID ? cidTokens.find(tok => line.toLowerCase().includes(tok.term.toLowerCase())) : null;

      return (
        <div key={li} style={{ position: "relative" }}>
          {hasCID ? (
            <span title={matchedToken?.meaning ? `CID: ${matchedToken.meaning}` : "CID match"}
              style={{
                background: "rgba(0, 184, 200, 0.12)",
                borderBottom: `2px solid ${TEAL}`,
                boxShadow: `0 0 6px rgba(0,184,200,0.3)`,
                padding: "1px 0",
                cursor: "help",
              }}>
              {line}
            </span>
          ) : line || "\u00A0"}
        </div>
      );
    });
  }

  function handleSelection() {
    if (!user) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length < 3) return;

    const idx = verse.indexOf(text);
    if (idx === -1) return;

    setDraft({ anchorText: text, startIndex: idx, endIndex: idx + text.length });
  }

  function handleSubmit() {
    if (!draft || !form.meaning) return;
    submitMutation.mutate({
      analysisId: analysisId || null,
      comparisonId: comparisonId || null,
      side: side || null,
      anchorText: draft.anchorText,
      startIndex: draft.startIndex,
      endIndex: draft.endIndex,
      meaning: form.meaning,
      meaningType: form.meaningType,
      interpretation1: form.interpretation1 || null,
      interpretation2: form.interpretation2 || null,
      interpretation3: form.interpretation3 || null,
      domainTags: form.domainTags || null,
    });
  }

  const approved = (existingAnnotations as any[]).filter((a: any) => a.status === "approved");
  const pending  = (existingAnnotations as any[]).filter((a: any) => a.status === "pending");

  return (
    <div>
      {/* Verse display */}
      <div
        ref={verseRef}
        onMouseUp={handleSelection}
        style={{
          fontFamily: MONO, fontSize: 12, lineHeight: 1.8,
          background: "#f8f8f8", padding: "14px 16px",
          border: "1px solid #ddd", userSelect: "text",
          cursor: user ? "text" : "default",
          whiteSpace: "pre-wrap",
        }}
      >
        {renderVerse()}
      </div>

      {/* Hint */}
      {user ? (
        <div style={{ fontFamily: MONO, fontSize: 10, color: "#888", marginTop: 4 }}>
          ✎ Highlight any phrase above to annotate it
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: 10, color: "#888", marginTop: 4 }}>
          <button onClick={() => setLocation("/login")} style={{
            background: "none", border: "none", color: BLUE, cursor: "pointer",
            fontFamily: MONO, fontSize: 10, textDecoration: "underline", padding: 0,
          }}>Sign in</button> to annotate this verse and earn points
        </div>
      )}

      {/* Draft annotation form */}
      {draft && (
        <div style={{
          border: `2px solid ${BLUE}`, padding: "16px", marginTop: 12,
          background: "#fff", fontFamily: MONO,
        }}>
          <div style={{ fontSize: 13, fontWeight: "bold", color: BLUE, marginBottom: 10 }}>
            Annotating: <span style={{ background: "rgba(0,184,200,0.15)", padding: "2px 6px" }}>"{draft.anchorText}"</span>
          </div>

          <label style={{ fontSize: 11, color: "#666" }}>TYPE</label>
          <select value={form.meaningType} onChange={e => setForm(f => ({ ...f, meaningType: e.target.value }))}
            style={{ display: "block", width: "100%", padding: "6px 8px", fontFamily: MONO, fontSize: 12, marginBottom: 10, border: "1px solid #ccc" }}>
            {MEANING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <label style={{ fontSize: 11, color: "#666" }}>WHAT DOES THIS MEAN? *</label>
          <textarea value={form.meaning} onChange={e => setForm(f => ({ ...f, meaning: e.target.value }))}
            placeholder="Explain the meaning, cultural reference, or wordplay..."
            rows={3} style={{ display: "block", width: "100%", padding: "6px 8px", fontFamily: MONO, fontSize: 12, marginBottom: 10, border: "1px solid #ccc", boxSizing: "border-box" }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#666" }}>SURFACE MEANING</label>
              <input value={form.interpretation1} onChange={e => setForm(f => ({ ...f, interpretation1: e.target.value }))}
                placeholder="What it appears to say..." style={{ display: "block", width: "100%", padding: "5px 8px", fontFamily: MONO, fontSize: 11, border: "1px solid #ccc", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#666" }}>HIDDEN MEANING</label>
              <input value={form.interpretation2} onChange={e => setForm(f => ({ ...f, interpretation2: e.target.value }))}
                placeholder="What it really means..." style={{ display: "block", width: "100%", padding: "5px 8px", fontFamily: MONO, fontSize: 11, border: "1px solid #ccc", boxSizing: "border-box" }} />
            </div>
          </div>

          <label style={{ fontSize: 11, color: "#666" }}>THIRD LAYER (optional)</label>
          <input value={form.interpretation3} onChange={e => setForm(f => ({ ...f, interpretation3: e.target.value }))}
            placeholder="e.g. 38 Spesh's 'switch like TD Jakes' → gun + effeminate walk + pastor scandal"
            style={{ display: "block", width: "100%", padding: "5px 8px", fontFamily: MONO, fontSize: 11, border: "1px solid #ccc", boxSizing: "border-box", marginBottom: 10 }} />

          <label style={{ fontSize: 11, color: "#666" }}>DOMAIN TAGS (comma-separated)</label>
          <input value={form.domainTags} onChange={e => setForm(f => ({ ...f, domainTags: e.target.value }))}
            placeholder="street, religion, scandal, weapons..."
            style={{ display: "block", width: "100%", padding: "5px 8px", fontFamily: MONO, fontSize: 11, border: "1px solid #ccc", boxSizing: "border-box", marginBottom: 14 }} />

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSubmit} disabled={!form.meaning || submitMutation.isPending}
              style={{ padding: "8px 20px", fontFamily: MONO, fontSize: 12, background: BLUE, color: "#fff", border: "none", cursor: "pointer" }}>
              {submitMutation.isPending ? "Submitting..." : `SUBMIT (+10 pts)`}
            </button>
            <button onClick={() => setDraft(null)}
              style={{ padding: "8px 14px", fontFamily: MONO, fontSize: 12, background: "#eee", border: "1px solid #ccc", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
          {submitMutation.isError && (
            <div style={{ color: "#cc0000", fontFamily: MONO, fontSize: 11, marginTop: 8 }}>
              {(submitMutation.error as any)?.message}
            </div>
          )}
        </div>
      )}

      {submitted && (
        <div style={{ background: "#f0fff4", border: "1px solid #009900", padding: "8px 12px",
          fontFamily: MONO, fontSize: 12, color: "#007700", marginTop: 8 }}>
          ✓ Annotation submitted (+10 pts). It will appear after moderator review.
        </div>
      )}

      {/* Existing approved annotations */}
      {approved.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#666", borderBottom: "1px solid #ddd", paddingBottom: 4, marginBottom: 10 }}>
            COMMUNITY ANNOTATIONS ({approved.length})
          </div>
          {approved.map((ann: any) => (
            <div key={ann.id} style={{ borderLeft: `3px solid ${TEAL}`, paddingLeft: 12, marginBottom: 12, fontFamily: MONO, fontSize: 12 }}>
              <div style={{ fontWeight: "bold", marginBottom: 4 }}>"{ann.anchor_text}"</div>
              <div style={{ color: "#333", marginBottom: 4 }}>{ann.meaning}</div>
              {ann.interpretation_1 && <div style={{ color: "#666", fontSize: 11 }}>Surface: {ann.interpretation_1}</div>}
              {ann.interpretation_2 && <div style={{ color: "#007788", fontSize: 11 }}>Hidden: {ann.interpretation_2}</div>}
              {ann.interpretation_3 && <div style={{ color: "#884400", fontSize: 11 }}>3rd layer: {ann.interpretation_3}</div>}
              <div style={{ color: "#aaa", fontSize: 10, marginTop: 4 }}>
                — {ann.submitted_by_username} · {ann.meaning_type}
                {ann.domain_tags && ` · ${ann.domain_tags}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending count for logged-in user */}
      {user && pending.filter((a: any) => a.submitted_by === user.id).length > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: "#888", marginTop: 8 }}>
          You have {pending.filter((a: any) => a.submitted_by === user.id).length} pending annotation(s) under review.
        </div>
      )}
    </div>
  );
}
