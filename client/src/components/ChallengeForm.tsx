/**
 * ChallengeForm + ApprovedAnnotation
 *
 * Design: no public challenge counts are shown anywhere.
 * The "challenge" link is subtle — only logged-in users see it,
 * and it can't be clicked by the annotation's own author.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "../lib/auth";

const MONO = "Courier New, monospace";
const TEAL = "#00b8c8";

interface Annotation {
  id: number;
  anchor_text: string;
  meaning: string;
  meaning_type: string;
  interpretation_1?: string;
  interpretation_2?: string;
  interpretation_3?: string;
  domain_tags?: string;
  submitted_by: number;
  submitted_by_username: string;
}

interface Props {
  ann: Annotation;
  currentUser: { id: number; username: string } | null;
}

export function ApprovedAnnotation({ ann, currentUser }: Props) {
  const [showChallenge, setShowChallenge] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const qc = useQueryClient();

  const challenge = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/annotations/${ann.id}/challenge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setDone(true);
      setShowChallenge(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["/api/annotations"] });
    },
  });

  const canChallenge = currentUser && currentUser.id !== ann.submitted_by;

  return (
    <div style={{ borderLeft: `3px solid ${TEAL}`, paddingLeft: 12, marginBottom: 14, fontFamily: MONO, fontSize: 12 }}>
      <div style={{ fontWeight: "bold", marginBottom: 4 }}>"{ann.anchor_text}"</div>
      <div style={{ color: "#333", marginBottom: 4 }}>{ann.meaning}</div>
      {ann.interpretation_1 && (
        <div style={{ color: "#666", fontSize: 11 }}>Surface: {ann.interpretation_1}</div>
      )}
      {ann.interpretation_2 && (
        <div style={{ color: "#007788", fontSize: 11 }}>Hidden: {ann.interpretation_2}</div>
      )}
      {ann.interpretation_3 && (
        <div style={{ color: "#884400", fontSize: 11 }}>3rd layer: {ann.interpretation_3}</div>
      )}
      <div style={{ color: "#aaa", fontSize: 10, marginTop: 4, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>— {ann.submitted_by_username} · {ann.meaning_type}{ann.domain_tags ? ` · ${ann.domain_tags}` : ""}</span>
        {canChallenge && !done && (
          <button
            onClick={() => setShowChallenge(v => !v)}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontFamily: MONO, fontSize: 10, color: "#999",
              textDecoration: "underline", textDecorationStyle: "dotted",
            }}
          >
            {showChallenge ? "cancel" : "challenge"}
          </button>
        )}
        {done && <span style={{ color: "#007788", fontSize: 10 }}>challenge submitted</span>}
      </div>

      {showChallenge && canChallenge && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "#fafaf8", border: "1px solid #e0e0e0" }}>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 6 }}>
            Why do you disagree with this annotation?
          </div>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            placeholder="Explain your interpretation..."
            style={{
              width: "100%", fontFamily: MONO, fontSize: 11, resize: "vertical",
              border: "1px solid #ccc", padding: "4px 6px", boxSizing: "border-box",
            }}
          />
          {challenge.error && (
            <div style={{ color: "#8b0000", fontSize: 10, marginTop: 4 }}>
              {(challenge.error as Error).message}
            </div>
          )}
          <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
            <button
              onClick={() => challenge.mutate()}
              disabled={!reason.trim() || challenge.isPending}
              style={{
                fontFamily: MONO, fontSize: 10, padding: "3px 10px",
                background: "#1a3a7a", color: "#fff", border: "none", cursor: "pointer",
                opacity: !reason.trim() || challenge.isPending ? 0.5 : 1,
              }}
            >
              {challenge.isPending ? "Submitting..." : "Submit challenge"}
            </button>
            <button
              onClick={() => { setShowChallenge(false); setReason(""); }}
              style={{
                fontFamily: MONO, fontSize: 10, padding: "3px 10px",
                background: "none", color: "#666", border: "1px solid #ccc", cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
