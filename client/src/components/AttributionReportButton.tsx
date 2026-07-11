/**
 * AttributionReportButton.tsx
 * Compact "Wrong artist?" flag on any verse card.
 * Logged-in users only. One report per user per verse.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "../context/AuthContext";

const MONO = "'Space Mono', 'Courier New', monospace";

interface Props {
  analysisId: string;     // result_id from analyses table
  artistName: string;
  songName: string;
}

export function AttributionReportButton({ analysisId, artistName, songName }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reportedArtist, setReportedArtist] = useState("");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/verses/${analysisId}/report-attribution`, {
        reportedArtist: reportedArtist.trim() || undefined,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => { setDone(true); setOpen(false); },
  });

  if (!user) return null;
  if (done) {
    return (
      <span style={{ fontFamily: MONO, fontSize: 10, color: "#777", marginLeft: 8 }}>
        ✓ Attribution flagged for review
      </span>
    );
  }

  return (
    <span style={{ display: "inline-block", marginLeft: 10 }}>
      <button
        data-testid="button-report-attribution"
        onClick={() => setOpen(o => !o)}
        style={{
          fontFamily: MONO, fontSize: 9, color: "#999", background: "none",
          border: "1px dashed #ccc", padding: "2px 8px", cursor: "pointer",
          letterSpacing: "0.04em",
        }}
      >
        ⚑ wrong artist?
      </button>

      {open && (
        <div style={{
          position: "absolute", zIndex: 200, background: "#fff",
          border: "1px solid #ccc", padding: "14px 16px", marginTop: 4,
          width: 280, boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: "bold", marginBottom: 10, color: "#111" }}>
            Flag incorrect attribution
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: "#888", marginBottom: 8 }}>
            Song: "{songName}" — currently labeled as {artistName}
          </div>

          <label style={{ fontFamily: MONO, fontSize: 9, color: "#555", display: "block", marginBottom: 4 }}>
            Correct artist (optional)
          </label>
          <input
            data-testid="input-reported-artist"
            value={reportedArtist}
            onChange={e => setReportedArtist(e.target.value)}
            placeholder="e.g. Kanye West"
            style={{
              width: "100%", fontFamily: MONO, fontSize: 10,
              border: "1px solid #ccc", padding: "4px 6px",
              marginBottom: 8, boxSizing: "border-box",
            }}
          />

          <label style={{ fontFamily: MONO, fontSize: 9, color: "#555", display: "block", marginBottom: 4 }}>
            Notes (optional)
          </label>
          <textarea
            data-testid="input-attribution-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. This is Kanye's verse on Niggas in Paris, not Jay-Z's"
            rows={2}
            style={{
              width: "100%", fontFamily: MONO, fontSize: 10,
              border: "1px solid #ccc", padding: "4px 6px",
              marginBottom: 10, resize: "vertical", boxSizing: "border-box",
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              data-testid="button-submit-attribution-report"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              style={{
                fontFamily: MONO, fontSize: 10, padding: "4px 14px",
                background: "#111", color: "#fff", border: "none",
                cursor: mutation.isPending ? "wait" : "pointer",
              }}
            >
              {mutation.isPending ? "Sending…" : "Submit report"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                fontFamily: MONO, fontSize: 10, padding: "4px 10px",
                background: "none", border: "1px solid #ccc", cursor: "pointer", color: "#666",
              }}
            >
              Cancel
            </button>
          </div>

          {mutation.isError && (
            <div style={{ fontFamily: MONO, fontSize: 9, color: "#c00", marginTop: 6 }}>
              {(mutation.error as any)?.message ?? "Something went wrong"}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
