import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Comment {
  id: number;
  body: string;
  authorUsername: string;
  replyCount: number;
  createdAt: number;
}

interface Props {
  resultId: string;
  resultType: "solo" | "battle";
  resultLabel: string; // e.g. "Twinz — Winter Warz Verse 1 (42.7)"
}

// ── Session username: stored in component state, falls back to prompt ─────────
let _sessionUsername = ""; // module-level so it persists across re-renders

export default function AnalysisComments({ resultId, resultType, resultLabel }: Props) {
  const qc = useQueryClient();
  const [username, setUsername] = useState(_sessionUsername);
  const [commentText, setCommentText] = useState("");
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [tempUsername, setTempUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [expanded, setExpanded] = useState(true);

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["/api/community/results", resultId, "comments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/community/results/${resultId}/comments`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30000,
  });

  const postComment = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/community/results/${resultId}/comments`, {
        body,
        authorUsername: username,
        resultType,
        resultLabel,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to post");
      }
      return res.json();
    },
    onSuccess: () => {
      setCommentText("");
      qc.invalidateQueries({ queryKey: ["/api/community/results", resultId, "comments"] });
    },
  });

  const registerAndComment = async () => {
    const clean = tempUsername.trim().replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
    if (clean.length < 2) { setUsernameError("Min 2 characters, letters/numbers/underscore only."); return; }
    // Try to register (will succeed or fail silently if already exists)
    try {
      await apiRequest("POST", "/api/community/register", { username: clean });
    } catch { /* already exists is fine */ }
    _sessionUsername = clean;
    setUsername(clean);
    setShowUsernamePrompt(false);
    setUsernameError("");
  };

  const handleSubmit = () => {
    if (!commentText.trim()) return;
    if (!username) { setShowUsernamePrompt(true); return; }
    postComment.mutate(commentText.trim());
  };

  return (
    <div style={{ marginTop: "16px", borderTop: "2px solid #1a3a7a" }}>
      {/* Header */}
      <div
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#1a3a7a", color: "#fff", padding: "6px 12px", cursor: "pointer",
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "13px", letterSpacing: "0.04em" }}>
          [ COMMUNITY COMMENTS ] {comments.length > 0 && `(${comments.length})`}
        </span>
        <span style={{ fontFamily: "Courier New, monospace", fontSize: "11px" }}>
          {expanded ? "▲ collapse" : "▼ expand"}
        </span>
      </div>

      {expanded && (
        <div style={{ background: "#fff", border: "1px solid #bbbbbb", borderTop: "none" }}>

          {/* Comment input */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #e8e8e8", background: "#f5f3ef" }}>
            {username && (
              <div style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#666", marginBottom: "5px" }}>
                Posting as <b style={{ color: "#1a3a7a" }}>{username}</b>
                <button
                  onClick={() => { _sessionUsername = ""; setUsername(""); }}
                  style={{ marginLeft: "8px", background: "none", border: "none", color: "#999", cursor: "pointer", fontFamily: "Courier New, monospace", fontSize: "9px", textDecoration: "underline" }}
                >
                  (switch)
                </button>
              </div>
            )}
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="What do you think about this verse? Drop your analysis..."
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: "Georgia, serif", fontSize: "12px",
                border: "1px solid #bbbbbb", padding: "6px 8px",
                background: "#fff", resize: "vertical",
              }}
              maxLength={3000}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "5px" }}>
              <span style={{ fontFamily: "Courier New, monospace", fontSize: "9px", color: "#aaa" }}>
                {commentText.length}/3000
              </span>
              <button
                onClick={handleSubmit}
                disabled={postComment.isPending || !commentText.trim()}
                style={{
                  fontFamily: "Arial, sans-serif", fontSize: "11px", fontWeight: 700,
                  padding: "4px 14px", cursor: commentText.trim() ? "pointer" : "not-allowed",
                  background: commentText.trim() ? "#1a3a7a" : "#ccc",
                  color: "#fff", border: "none",
                }}
              >
                {postComment.isPending ? "Posting..." : "Post Comment"}
              </button>
            </div>
            {postComment.isError && (
              <div style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#cc0000", marginTop: "4px" }}>
                {(postComment.error as Error).message}
              </div>
            )}
          </div>

          {/* Username prompt modal-ish inline */}
          {showUsernamePrompt && (
            <div style={{ padding: "10px 14px", background: "#fffbe6", borderBottom: "1px solid #e0d090" }}>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: 700, marginBottom: "6px", color: "#333" }}>
                Pick a username to comment:
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="text"
                  value={tempUsername}
                  onChange={e => setTempUsername(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && registerAndComment()}
                  placeholder="e.g. NasHead91"
                  maxLength={20}
                  style={{
                    fontFamily: "Courier New, monospace", fontSize: "12px",
                    border: "1px solid #bbbbbb", padding: "4px 8px", flex: 1,
                  }}
                />
                <button
                  onClick={registerAndComment}
                  style={{
                    fontFamily: "Arial, sans-serif", fontSize: "11px", fontWeight: 700,
                    padding: "4px 12px", background: "#006600", color: "#fff", border: "none", cursor: "pointer",
                  }}
                >
                  Set Username
                </button>
                <button
                  onClick={() => setShowUsernamePrompt(false)}
                  style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: "16px" }}
                >
                  ✕
                </button>
              </div>
              {usernameError && (
                <div style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#cc0000", marginTop: "4px" }}>{usernameError}</div>
              )}
              <div style={{ fontFamily: "Courier New, monospace", fontSize: "9px", color: "#999", marginTop: "4px" }}>
                Same username works across all analyses. No password needed.
              </div>
            </div>
          )}

          {/* Comments list */}
          {isLoading ? (
            <div style={{ padding: "14px", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#999" }}>
              Loading comments...
            </div>
          ) : comments.length === 0 ? (
            <div style={{ padding: "14px 14px", fontFamily: "Georgia, serif", fontSize: "12px", color: "#999", fontStyle: "italic" }}>
              No comments yet. Be the first to drop your take on this verse.
            </div>
          ) : (
            <div>
              {comments.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    padding: "10px 14px",
                    borderBottom: i < comments.length - 1 ? "1px solid #eee" : "none",
                    background: i % 2 === 0 ? "#fff" : "#fafaf8",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", fontWeight: 700, color: "#1a3a7a" }}>
                      {c.authorUsername}
                    </span>
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: "9px", color: "#aaa" }}>
                      {timeAgo(c.createdAt)}
                    </span>
                  </div>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: "12px", color: "#333", lineHeight: 1.5 }}>
                    {c.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
