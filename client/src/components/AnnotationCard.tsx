/**
 * AnnotationCard
 * Rap Genius-style annotation display card.
 * Shows: meaning, image, upvote button, improvement suggestion form, points.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { getToken } from "../lib/auth";
import { useLocation } from "wouter";

const MONO = "'Courier New', monospace";
const BLUE = "#1a3a7a";
const GOLD = "#c8960a";

const IMPROVEMENT_REASONS = [
  { value: "restates_line",      label: "Restates the line" },
  { value: "missing_something",  label: "Missing something" },
  { value: "stretch",            label: "It's a stretch" },
  { value: "other",              label: "Other" },
];

interface Ann {
  id: number;
  anchor_text: string;
  meaning: string;
  annotation_type?: string;
  image_url?: string | null;
  upvotes: number;
  submitted_by_username: string;
  submitted_by: number;
  created_at: number;
}

interface Props {
  ann: Ann;
  queryKey: any[];
  onClose?: () => void;
}

export function AnnotationCard({ ann, queryKey, onClose }: Props) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [showImprove, setShowImprove] = useState(false);
  const [improveReason, setImproveReason] = useState("missing_something");
  const [improveSuggestion, setImproveSuggestion] = useState("");
  const [improveSent, setImproveSent] = useState(false);

  const upvoteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/annotations/${ann.id}/upvote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Upvote failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const improveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/annotations/${ann.id}/improve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ reason: improveReason, suggestion: improveSuggestion }),
      });
      if (!res.ok) throw new Error("Suggestion failed");
      return res.json();
    },
    onSuccess: () => {
      setShowImprove(false);
      setImproveSuggestion("");
      setImproveSent(true);
    },
  });

  const typeLabel: Record<string, string> = {
    meaning:          "Word / Slang",
    cultural_ref:     "Cultural Ref",
    double_meaning:   "Double Meaning",
    historical:       "Historical",
    brand_place:      "Brand / Place",
    other:            "Other",
  };

  const date = ann.created_at
    ? new Date(ann.created_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.7 }}>
      {/* Anchor text */}
      <div style={{
        borderLeft: `3px solid ${GOLD}`,
        paddingLeft: 10,
        marginBottom: 12,
        fontSize: 13,
        fontStyle: "italic",
        color: "#444",
      }}>
        "{ann.anchor_text}"
      </div>

      {/* Type badge */}
      {ann.annotation_type && (
        <div style={{
          display: "inline-block",
          background: "#f0f0f0",
          border: "1px solid #ddd",
          padding: "1px 7px",
          fontSize: 10,
          letterSpacing: "0.06em",
          marginBottom: 10,
          color: "#555",
        }}>
          {typeLabel[ann.annotation_type] ?? ann.annotation_type.toUpperCase()}
        </div>
      )}

      {/* Image */}
      {ann.image_url && (
        <div style={{ marginBottom: 12 }}>
          <img
            src={ann.image_url}
            alt="annotation reference"
            style={{ maxWidth: "100%", maxHeight: 200, border: "1px solid #ddd", display: "block" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}

      {/* Meaning */}
      <div style={{ marginBottom: 14, color: "#1a1a1a", fontSize: 13, lineHeight: 1.75 }}>
        {ann.meaning}
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ color: "#888", fontSize: 10 }}>
          by <strong>{ann.submitted_by_username}</strong>{date ? ` · ${date}` : ""}
        </span>

        {/* Upvote */}
        {user ? (
          <button
            onClick={() => upvoteMutation.mutate()}
            disabled={upvoteMutation.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "none", border: "1px solid #ccc",
              padding: "3px 10px", cursor: "pointer",
              fontFamily: MONO, fontSize: 11, color: "#444",
            }}
          >
            ▲ {ann.upvotes ?? 0}
          </button>
        ) : (
          <span style={{ fontSize: 10, color: "#aaa" }}>▲ {ann.upvotes ?? 0}</span>
        )}
      </div>

      <hr style={{ borderColor: "#eee", margin: "10px 0" }} />

      {/* Actions */}
      {user && !improveSent && (
        <div>
          {!showImprove ? (
            <button
              onClick={() => setShowImprove(true)}
              style={{
                background: "none", border: "none", fontFamily: MONO,
                fontSize: 10, color: "#888", cursor: "pointer",
                textDecoration: "underline", padding: 0,
              }}
            >
              Suggest an improvement
            </button>
          ) : (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 6, fontWeight: "bold" }}>
                Help us improve this annotation
              </div>

              {/* Reason radio */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                {IMPROVEMENT_REASONS.map(r => (
                  <label key={r.value} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11 }}>
                    <input
                      type="radio"
                      name={`reason-${ann.id}`}
                      value={r.value}
                      checked={improveReason === r.value}
                      onChange={() => setImproveReason(r.value)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>

              <textarea
                value={improveSuggestion}
                onChange={e => setImproveSuggestion(e.target.value)}
                placeholder="Suggest a better explanation..."
                rows={3}
                style={{
                  display: "block", width: "100%", boxSizing: "border-box",
                  padding: "6px 8px", fontFamily: MONO, fontSize: 11,
                  border: "1px solid #ccc", marginBottom: 8,
                  resize: "vertical",
                }}
              />

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => improveMutation.mutate()}
                  disabled={!improveSuggestion.trim() || improveMutation.isPending}
                  style={{
                    padding: "5px 14px", fontFamily: MONO, fontSize: 11,
                    background: BLUE, color: "#fff", border: "none", cursor: "pointer",
                  }}
                >
                  {improveMutation.isPending ? "Sending..." : "Submit (+5 pts if accepted)"}
                </button>
                <button
                  onClick={() => { setShowImprove(false); setImproveSuggestion(""); }}
                  style={{
                    padding: "5px 10px", fontFamily: MONO, fontSize: 11,
                    background: "#eee", border: "1px solid #ccc", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {improveSent && (
        <div style={{ fontSize: 11, color: "#007700" }}>
          ✓ Suggestion sent. +5 pts if accepted.
        </div>
      )}

      {!user && (
        <button
          onClick={() => setLocation("/login")}
          style={{
            background: "none", border: "none", fontFamily: MONO,
            fontSize: 10, color: BLUE, cursor: "pointer",
            textDecoration: "underline", padding: 0,
          }}
        >
          Sign in to upvote or improve this annotation
        </button>
      )}
    </div>
  );
}
