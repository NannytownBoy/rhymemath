/**
 * AnnotationOverlay — v2
 * Two-panel Rap Genius-style layout:
 *   LEFT:  LyricViewer  — verse with CID teal + annotation gold highlights
 *   RIGHT: sliding panel — annotation form (on selection) OR annotation card (on click)
 *
 * Annotator form is deliberately simple:
 *   - Highlighted text shown at top (auto-filled)
 *   - "What does this mean?" free-text (required)
 *   - Type checkboxes — optional multi-select; if none checked, keyword routing handles it
 *   - Optional image URL
 *
 * On submit, server-side rule-based extraction routes into CID candidate queue.
 */
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { getToken } from "../lib/auth";
import { useLocation } from "wouter";
import { LyricViewer, CIDToken, AnnotationRange } from "./LyricViewer";
import { AnnotationCard } from "./AnnotationCard";
import { FigureSubmitForm } from "./FigureSubmitForm";

const MONO = "'Courier New', monospace";
const BLUE = "#1a3a7a";
const GOLD = "#c8960a";
const TEAL = "#00b8c8";

const ANNOTATION_TYPES = [
  { value: "meaning",        label: "Word / Slang meaning" },
  { value: "cultural_ref",   label: "Cultural reference (person or event)" },
  { value: "double_meaning", label: "Double meaning / entendre" },
  { value: "historical",     label: "Historical context" },
  { value: "brand_place",    label: "Brand, place, or organization" },
  { value: "other",          label: "Other" },
];

interface Props {
  verse: string;
  analysisId?: string;
  comparisonId?: string;
  side?: "A" | "B";
  cidTokens?: CIDToken[];
  artistName?: string;
}

interface Draft {
  anchorText: string;
  charStart: number;
  charEnd: number;
}

type PanelState =
  | { mode: "closed" }
  | { mode: "form"; draft: Draft }
  | { mode: "card"; ann: AnnotationRange };

export function AnnotationOverlay({ verse, analysisId, comparisonId, side, cidTokens: cidTokensProp = [], artistName }: Props) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [panel, setPanel] = useState<PanelState>({ mode: "closed" });
  const [types, setTypes] = useState<string[]>([]);
  const [meaning, setMeaning] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // ── CID tokens ──────────────────────────────────────────────────────────────
  const { data: fetchedTokens = [] } = useQuery<{ token: string; label: string; layer: string }[]>({
    queryKey: ["/api/cid/tokens", verse.slice(0, 40)],
    queryFn: async () => {
      const res = await fetch("/api/cid/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: verse }),
      });
      const data = await res.json();
      return data.tokens ?? [];
    },
    enabled: verse.length > 10,
    staleTime: 5 * 60 * 1000,
  });

  const cidTokens: CIDToken[] = [
    ...cidTokensProp,
    ...fetchedTokens.map(t => ({
      term: t.token,
      matchType: (t.layer === "entendre" ? "entendre" : t.layer === "alias" ? "alias" : "cultural") as CIDToken["matchType"],
      meaning: t.label !== t.token ? t.label : undefined,
    })),
  ];

  // ── Annotations query ────────────────────────────────────────────────────────
  const queryKey = analysisId
    ? ["/api/annotations", analysisId]
    : ["/api/annotations", comparisonId, side];

  const { data: allAnnotations = [] } = useQuery<AnnotationRange[]>({
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

  const approved = allAnnotations.filter((a: any) => a.status === "approved");
  const pending  = allAnnotations.filter((a: any) => a.status === "pending");
  const myPending = user ? pending.filter((a: any) => a.submitted_by === user.id) : [];

  // ── Submit mutation ──────────────────────────────────────────────────────────
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setPanel({ mode: "closed" });
      setMeaning("");
      setImageUrl("");
      setTypes([]);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSelect = useCallback((text: string, charStart: number, charEnd: number) => {
    if (!user) return;
    setTypes([]);
    setMeaning("");
    setImageUrl("");
    setPanel({ mode: "form", draft: { anchorText: text, charStart, charEnd } });
  }, [user]);

  const handleAnnotationClick = useCallback((ann: AnnotationRange) => {
    setPanel({ mode: "card", ann });
  }, []);

  function toggleType(val: string) {
    setTypes(prev => prev.includes(val) ? prev.filter(t => t !== val) : [...prev, val]);
  }

  function handleSubmit() {
    if (panel.mode !== "form") return;
    if (!meaning.trim()) return;
    submitMutation.mutate({
      analysisId: analysisId ?? null,
      comparisonId: comparisonId ?? null,
      side: side ?? null,
      anchorText: panel.draft.anchorText,
      charStart: panel.draft.charStart,
      charEnd: panel.draft.charEnd,
      meaning: meaning.trim(),
      annotationType: types[0] ?? "other",    // primary type for CID routing
      imageUrl: imageUrl.trim() || null,
    });
  }

  // ── Legend ───────────────────────────────────────────────────────────────────
  const Legend = () => (
    <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: "#666" }}>
        <span style={{ borderBottom: `2px solid ${TEAL}`, paddingBottom: 1 }}>■</span> CID match
      </span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: "#666" }}>
        <span style={{ borderBottom: `2px solid ${GOLD}`, paddingBottom: 1 }}>■</span> Annotated
      </span>
      {user && (
        <span style={{ fontFamily: MONO, fontSize: 10, color: "#888" }}>
          ✎ Highlight any phrase to annotate
        </span>
      )}
    </div>
  );

  // ── Right panel: form ─────────────────────────────────────────────────────────
  const FormPanel = ({ draft }: { draft: Draft }) => (
    <div style={{ padding: "18px 16px", fontFamily: MONO }}>
      {/* Highlighted phrase */}
      <div style={{
        borderLeft: `3px solid ${GOLD}`,
        paddingLeft: 10,
        marginBottom: 16,
        fontSize: 13,
        fontStyle: "italic",
        color: "#333",
        lineHeight: 1.5,
        wordBreak: "break-word",
      }}>
        "{draft.anchorText}"
      </div>

      {/* Required: meaning */}
      <label style={{ fontSize: 10, color: "#666", letterSpacing: "0.07em" }}>
        WHAT DOES THIS MEAN? *
      </label>
      <textarea
        value={meaning}
        onChange={e => setMeaning(e.target.value)}
        placeholder="Drop some knowledge — explain the meaning, reference, or wordplay..."
        rows={4}
        autoFocus
        style={{
          display: "block", width: "100%", boxSizing: "border-box",
          padding: "8px", fontFamily: MONO, fontSize: 12,
          border: "1px solid #ccc", marginTop: 4, marginBottom: 14,
          resize: "vertical", lineHeight: 1.6,
        }}
      />

      {/* Optional: types (checkboxes) */}
      <label style={{ fontSize: 10, color: "#666", letterSpacing: "0.07em" }}>
        TYPE (optional — check all that apply)
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, marginBottom: 14 }}>
        {ANNOTATION_TYPES.map(t => (
          <label key={t.value} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11, color: "#333" }}>
            <input
              type="checkbox"
              checked={types.includes(t.value)}
              onChange={() => toggleType(t.value)}
              style={{ accentColor: BLUE }}
            />
            {t.label}
          </label>
        ))}
      </div>

      {/* Optional: image */}
      <label style={{ fontSize: 10, color: "#666", letterSpacing: "0.07em" }}>
        IMAGE URL (optional)
      </label>
      <input
        type="url"
        value={imageUrl}
        onChange={e => setImageUrl(e.target.value)}
        placeholder="https://imgur.com/..."
        style={{
          display: "block", width: "100%", boxSizing: "border-box",
          padding: "6px 8px", fontFamily: MONO, fontSize: 11,
          border: "1px solid #ccc", marginTop: 4, marginBottom: 16,
        }}
      />

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSubmit}
          disabled={!meaning.trim() || submitMutation.isPending}
          style={{
            flex: 1, padding: "9px 0", fontFamily: MONO, fontSize: 12,
            background: BLUE, color: "#fff", border: "none", cursor: "pointer",
          }}
        >
          {submitMutation.isPending ? "Submitting..." : "SUBMIT  (+10 pts)"}
        </button>
        <button
          onClick={() => setPanel({ mode: "closed" })}
          style={{
            padding: "9px 12px", fontFamily: MONO, fontSize: 12,
            background: "#eee", border: "1px solid #ccc", cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {submitMutation.isError && (
        <div style={{ color: "#cc0000", fontSize: 11, marginTop: 8 }}>
          {(submitMutation.error as Error)?.message}
        </div>
      )}

      {/* Flag missing figure */}
      <div style={{ marginTop: 20, borderTop: "1px solid #eee", paddingTop: 14 }}>
        <FigureSubmitForm exampleLyric={draft.anchorText} />
      </div>
    </div>
  );

  // ── Right panel: annotation card list ────────────────────────────────────────
  const CardPanel = ({ ann }: { ann: AnnotationRange }) => (
    <div style={{ padding: "18px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "#666", letterSpacing: "0.07em" }}>
          COMMUNITY ANNOTATION
        </span>
        <button
          onClick={() => setPanel({ mode: "closed" })}
          style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#888" }}
        >
          ✕
        </button>
      </div>
      <AnnotationCard ann={ann as any} queryKey={queryKey} onClose={() => setPanel({ mode: "closed" })} />

      {/* Show other annotations for the same anchor if any */}
      {(() => {
        const others = approved.filter(a => a.id !== ann.id && a.anchor_text === ann.anchor_text);
        if (!others.length) return null;
        return (
          <div style={{ marginTop: 20, borderTop: "1px solid #eee", paddingTop: 14 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#888", marginBottom: 10 }}>
              {others.length} MORE ANNOTATION{others.length > 1 ? "S" : ""} FOR THIS PHRASE
            </div>
            {others.map(o => (
              <div key={o.id} style={{ borderTop: "1px solid #f0f0f0", paddingTop: 10, marginTop: 10 }}>
                <AnnotationCard ann={o as any} queryKey={queryKey} />
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  const isOpen = panel.mode !== "closed";

  return (
    <div>
      <Legend />

      <div style={{
        display: "grid",
        gridTemplateColumns: isOpen ? "1fr 340px" : "1fr",
        gap: 0,
        alignItems: "start",
        transition: "grid-template-columns 0.22s ease",
      }}>
        {/* LEFT: Lyrics */}
        <div style={{
          borderRight: isOpen ? "1px solid #ddd" : "none",
          paddingRight: isOpen ? 16 : 0,
          minWidth: 0,
        }}>
          <LyricViewer
            verse={verse}
            cidTokens={cidTokens}
            annotations={approved}
            activeAnnotationId={panel.mode === "card" ? panel.ann.id : null}
            isLoggedIn={!!user}
            onSelect={handleSelect}
            onAnnotationClick={handleAnnotationClick}
          />

          {/* Login nudge */}
          {!user && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#888", marginTop: 8 }}>
              <button
                onClick={() => setLocation("/login")}
                style={{ background: "none", border: "none", color: BLUE, cursor: "pointer", fontFamily: MONO, fontSize: 10, textDecoration: "underline", padding: 0 }}
              >
                Sign in
              </button>
              {" "}to annotate and earn points
            </div>
          )}

          {/* My pending count */}
          {myPending.length > 0 && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#888", marginTop: 6 }}>
              {myPending.length} annotation{myPending.length > 1 ? "s" : ""} pending review
            </div>
          )}
        </div>

        {/* RIGHT: Sliding panel */}
        {isOpen && (
          <div style={{
            background: "#fff",
            borderLeft: "1px solid #e0e0e0",
            borderTop: "none",
            minHeight: 300,
            overflowY: "auto",
            maxHeight: 600,
          }}>
            {panel.mode === "form" && <FormPanel draft={panel.draft} />}
            {panel.mode === "card" && <CardPanel ann={panel.ann} />}
          </div>
        )}
      </div>

      {/* Annotation list below (closed-panel state) */}
      {!isOpen && approved.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: "#888", letterSpacing: "0.07em", borderBottom: "1px solid #eee", paddingBottom: 6, marginBottom: 10 }}>
            ANNOTATIONS ({approved.length}) — click a highlighted phrase above to read
          </div>
          {/* Show annotation summary list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {approved.map((ann: any) => (
              <button
                key={ann.id}
                onClick={() => setPanel({ mode: "card", ann })}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  background: "none", border: "1px solid #eee",
                  padding: "8px 10px", cursor: "pointer", textAlign: "left",
                  fontFamily: MONO, fontSize: 11,
                }}
              >
                <span style={{ borderBottom: `2px solid ${GOLD}`, whiteSpace: "nowrap", flexShrink: 0, color: "#555" }}>
                  "{ann.anchor_text.slice(0, 30)}{ann.anchor_text.length > 30 ? "…" : ""}"
                </span>
                <span style={{ color: "#333", flexGrow: 1 }}>
                  {ann.meaning.slice(0, 80)}{ann.meaning.length > 80 ? "…" : ""}
                </span>
                <span style={{ color: "#aaa", whiteSpace: "nowrap", flexShrink: 0 }}>
                  ▲{ann.upvotes ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {submitted && (
        <div style={{
          background: "#f0fff4", border: "1px solid #009900",
          padding: "8px 12px", fontFamily: MONO, fontSize: 12,
          color: "#007700", marginTop: 10,
        }}>
          ✓ Annotation submitted (+10 pts) — appears after moderator review.
        </div>
      )}
    </div>
  );
}

// Keep named export for backward compat with ApprovedAnnotation usages elsewhere
export { AnnotationCard as ApprovedAnnotation };
