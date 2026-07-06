import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type ViewState = "list" | "thread" | "new-thread" | "register";
type ThreadCategory = "all" | "general" | "artist" | "beef" | "goat";

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  artist: "Artist Discussion",
  beef: "Beef & Battles",
  goat: "GOAT Debates",
};

const CATEGORY_COLORS: Record<string, string> = {
  general: "#1a3a7a",
  artist: "#006600",
  beef: "#8b0000",
  goat: "#b8860b",
};

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Username persistence in React state (session only, no localStorage) ─────
// We pass username as prop through component tree

export default function Community() {
  const [view, setView] = useState<ViewState>("list");
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<ThreadCategory>("all");
  const [username, setUsername] = useState<string>("");
  const [sessionUsername, setSessionUsername] = useState<string>("");

  const openThread = (id: number) => {
    setSelectedThreadId(id);
    setView("thread");
  };

  if (!sessionUsername && view !== "register") {
    return (
      <RegisterPanel
        onRegistered={(u) => { setSessionUsername(u); setView("list"); }}
      />
    );
  }

  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", paddingBottom: "40px" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "20px", marginBottom: "4px" }}>
          <div className="rm-section-header-blue" style={{ margin: 0, flex: 1 }}>
            [ COMMUNITY ]
          </div>
          <div style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#555", marginLeft: "12px" }}>
            Logged in as: <strong style={{ color: "#1a3a7a" }}>{sessionUsername}</strong>
            {" · "}
            <button
              onClick={() => setSessionUsername("")}
              style={{ background: "none", border: "none", color: "#8b0000", fontSize: "11px", cursor: "pointer", fontFamily: "Courier New, monospace", textDecoration: "underline", padding: 0 }}
            >
              switch user
            </button>
          </div>
        </div>
        <p style={{ fontFamily: "Georgia, serif", fontSize: "12px", color: "#666", marginBottom: "10px" }}>
          Discuss artists, argue beefs, crown GOATs. Forums for the hip-hop obsessed.
        </p>

        {/* Community Rules */}
        <div style={{
          border: "1px solid #bbbbbb",
          background: "#fffef5",
          borderLeft: "4px solid #b8860b",
          padding: "10px 14px",
          marginBottom: "14px",
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: "#444",
          lineHeight: "1.6",
        }}>
          <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "12px", color: "#b8860b", marginBottom: "6px", letterSpacing: "0.05em" }}>
            COMMUNITY STANDARDS
          </div>
          <p style={{ margin: "0 0 6px" }}>
            RhymeMath is a space to debate bars, not people. Keep it about the music. The following are not allowed and will result in removal:
          </p>
          <ul style={{ margin: "0 0 6px", paddingLeft: "18px" }}>
            <li style={{ marginBottom: "3px" }}><strong>Racism, racial slurs, or content that degrades any group based on race, ethnicity, or national origin.</strong></li>
            <li style={{ marginBottom: "3px" }}><strong>Misogyny or content that demeans, sexualizes, or threatens any person based on gender.</strong></li>
            <li style={{ marginBottom: "3px" }}><strong>Defamatory statements</strong>, meaning false statements of fact presented as true about real, identifiable people that could damage their reputation.</li>
            <li style={{ marginBottom: "3px" }}>Personal threats, doxxing, harassment, or targeted abuse of any user or public figure.</li>
          </ul>
          <p style={{ margin: "0 0 6px" }}>
            Critiquing an artist's lyrics, catalog, or public conduct is fair game. Lyrics quoted for analytical purposes are covered by fair use. Direct personal attacks are not.
          </p>
          <p style={{ margin: 0, fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888" }}>
            Note: RhymeMath does not pre-screen posts and relies on community moderation. If you would like to serve as a moderator, reach out to mods@rhymemath.com. Moderators are volunteers and do not act as agents of RhymeMath.
          </p>
        </div>

        {view === "list" && (
          <ThreadList
            username={sessionUsername}
            filterCategory={filterCategory}
            setFilterCategory={setFilterCategory}
            onOpenThread={openThread}
            onNewThread={() => setView("new-thread")}
          />
        )}

        {view === "new-thread" && (
          <NewThreadForm
            username={sessionUsername}
            onCreated={(id) => { setSelectedThreadId(id); setView("thread"); }}
            onCancel={() => setView("list")}
          />
        )}

        {view === "thread" && selectedThreadId !== null && (
          <ThreadView
            threadId={selectedThreadId}
            username={sessionUsername}
            onBack={() => setView("list")}
          />
        )}

      </div>
    </main>
  );
}

// ─── Register Panel ───────────────────────────────────────────────────────────
function RegisterPanel({ onRegistered }: { onRegistered: (u: string) => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const registerMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await apiRequest("POST", "/api/community/register", { username });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Registration failed.");
      }
      return res.json();
    },
    onSuccess: (data) => onRegistered(data.username),
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = () => {
    setError("");
    const clean = input.trim();
    if (clean.length < 2) { setError("Username must be at least 2 characters."); return; }
    registerMutation.mutate(clean);
  };

  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", padding: "40px 16px" }}>
      <div style={{ maxWidth: "440px", margin: "0 auto" }}>
        <div className="rm-section-header-blue">[ JOIN THE COMMUNITY ]</div>
        <div className="rm-card" style={{ padding: "20px" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#444", marginBottom: "16px", lineHeight: "1.6" }}>
            Pick a username to post in community threads. No email required.
            Username can contain letters, numbers, underscores, hyphens.
          </p>
          <label className="rm-label" style={{ display: "block", marginBottom: "4px" }}>Username</label>
          <input
            data-testid="input-username"
            className="rm-input"
            style={{ width: "100%", marginBottom: "8px", fontSize: "14px" }}
            placeholder="e.g. Verse_Judge_99"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            maxLength={24}
          />
          {error && (
            <div style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#cc0000", marginBottom: "8px" }}>
              ⚠ {error}
            </div>
          )}
          <button
            data-testid="button-register"
            className="rm-btn-primary"
            onClick={handleSubmit}
            disabled={registerMutation.isPending}
            style={{ width: "100%" }}
          >
            {registerMutation.isPending ? "[ REGISTERING... ]" : "[ CLAIM USERNAME ]"}
          </button>
          <p style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#999", marginTop: "8px", marginBottom: 0 }}>
            Already have one? Just type the same name — if it's registered, you'll be signed in for this session.
          </p>
          <button
            style={{ background: "none", border: "none", fontFamily: "Courier New, monospace", fontSize: "10px", color: "#1a3a7a", cursor: "pointer", textDecoration: "underline", padding: "4px 0 0", marginTop: "4px" }}
            onClick={() => {
              const name = input.trim();
              if (name.length >= 2) onRegistered(name);
            }}
          >
            → Skip registration and post as guest
          </button>
        </div>
      </div>
    </main>
  );
}

// ─── Thread List ──────────────────────────────────────────────────────────────
function ThreadList({ username, filterCategory, setFilterCategory, onOpenThread, onNewThread }: {
  username: string;
  filterCategory: ThreadCategory;
  setFilterCategory: (c: ThreadCategory) => void;
  onOpenThread: (id: number) => void;
  onNewThread: () => void;
}) {
  const { data: threadList, isLoading } = useQuery<any[]>({
    queryKey: ["/api/community/threads", filterCategory],
    queryFn: async () => {
      const url = filterCategory === "all"
        ? "/api/community/threads"
        : `/api/community/threads?category=${filterCategory}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    staleTime: 15000,
  });

  const FILTER_TABS: { key: ThreadCategory; label: string }[] = [
    { key: "all", label: "All" },
    { key: "general", label: "General" },
    { key: "artist", label: "Artist" },
    { key: "beef", label: "Beef/Battles" },
    { key: "goat", label: "GOAT Debates" },
  ];

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", flex: 1 }}>
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              data-testid={`button-filter-${key}`}
              onClick={() => setFilterCategory(key)}
              style={{
                fontFamily: "Arial, sans-serif", fontSize: "11px", fontWeight: "bold",
                padding: "3px 10px", cursor: "pointer",
                background: filterCategory === key ? "#1a3a7a" : "#dddddd",
                color: filterCategory === key ? "#ffffff" : "#333333",
                border: filterCategory === key ? "2px solid #0d2655" : "2px solid #bbbbbb",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          data-testid="button-new-thread"
          className="rm-btn-primary"
          onClick={onNewThread}
          style={{ fontSize: "12px", padding: "4px 14px" }}
        >
          + NEW THREAD
        </button>
      </div>

      {/* Thread list */}
      <div className="rm-card" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: "20px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#888" }}>
            [ LOADING THREADS... ]
          </div>
        ) : !threadList || threadList.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "14px", color: "#1a3a7a", marginBottom: "8px" }}>
              No threads yet
            </div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#666" }}>
              Be the first to start a discussion.
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#1a3a7a" }}>
                <th style={{ padding: "6px 10px", textAlign: "left", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaccff" }}>Thread</th>
                <th style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaccff", whiteSpace: "nowrap" }}>Category</th>
                <th style={{ padding: "6px 10px", textAlign: "center", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaccff" }}>Replies</th>
                <th style={{ padding: "6px 10px", textAlign: "right", fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#aaccff" }}>Posted</th>
              </tr>
            </thead>
            <tbody>
              {threadList.map((t: any, i: number) => (
                <tr
                  key={t.id}
                  data-testid={`row-thread-${t.id}`}
                  style={{ background: i % 2 === 0 ? "#ffffff" : "#f5f3ef", borderBottom: "1px solid #e0ddd8", cursor: "pointer" }}
                  onClick={() => onOpenThread(t.id)}
                >
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", fontWeight: "bold", color: "#1a3a7a" }}>
                      {t.title}
                    </div>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888", marginTop: "2px" }}>
                      by {t.authorUsername}
                      {t.artistTag && <span style={{ color: "#006600" }}> · #{t.artistTag}</span>}
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    <span style={{
                      background: CATEGORY_COLORS[t.category] || "#555",
                      color: "#fff",
                      fontFamily: "Arial, sans-serif",
                      fontSize: "10px",
                      fontWeight: "bold",
                      padding: "2px 7px",
                    }}>
                      {CATEGORY_LABELS[t.category] || t.category}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#333", fontWeight: 700 }}>
                    {t.replyCount}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "Courier New, monospace", fontSize: "10px", color: "#999" }}>
                    {timeAgo(t.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── New Thread Form ──────────────────────────────────────────────────────────
function NewThreadForm({ username, onCreated, onCancel }: {
  username: string;
  onCreated: (id: number) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [artistTag, setArtistTag] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/community/threads", {
        title, body, authorUsername: username, category,
        artistTag: artistTag.trim() || undefined,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      return res.json();
    },
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/threads"] });
      onCreated(thread.id);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <button
          onClick={onCancel}
          style={{ background: "none", border: "none", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#1a3a7a", cursor: "pointer", textDecoration: "underline" }}
        >
          ← Back to threads
        </button>
        <div className="rm-section-header-blue" style={{ margin: 0, flex: 1 }}>
          [ NEW THREAD ]
        </div>
      </div>

      <div className="rm-card" style={{ padding: "14px" }}>
        <div style={{ marginBottom: "10px" }}>
          <label className="rm-label" style={{ display: "block", marginBottom: "3px" }}>
            Thread Title <span style={{ color: "#cc0000" }}>*</span>
          </label>
          <input
            data-testid="input-thread-title"
            className="rm-input"
            style={{ width: "100%" }}
            placeholder="e.g. Kendrick vs Drake — who won the beef?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
          <div>
            <label className="rm-label" style={{ display: "block", marginBottom: "3px" }}>Category</label>
            <select
              data-testid="select-thread-category"
              className="rm-input"
              style={{ width: "100%" }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="general">General</option>
              <option value="artist">Artist Discussion</option>
              <option value="beef">Beef &amp; Battles</option>
              <option value="goat">GOAT Debates</option>
            </select>
          </div>
          <div>
            <label className="rm-label" style={{ display: "block", marginBottom: "3px" }}>
              Artist Tag <span style={{ color: "#888", fontWeight: "normal" }}>(optional)</span>
            </label>
            <input
              data-testid="input-artist-tag"
              className="rm-input"
              style={{ width: "100%" }}
              placeholder="e.g. kendrick-lamar"
              value={artistTag}
              onChange={(e) => setArtistTag(e.target.value)}
              maxLength={40}
            />
          </div>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label className="rm-label" style={{ display: "block", marginBottom: "3px" }}>
            Post Body <span style={{ color: "#cc0000" }}>*</span>
          </label>
          <textarea
            data-testid="input-thread-body"
            className="rm-input"
            style={{ width: "100%", height: "140px", resize: "vertical", lineHeight: "1.6" }}
            placeholder="Share your take. Keep it about the music."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
          />
          <div className="rm-label" style={{ marginTop: "2px", color: "#999" }}>{body.length}/5000</div>
        </div>

        {error && (
          <div style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#cc0000", marginBottom: "8px" }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            data-testid="button-submit-thread"
            className="rm-btn-primary"
            onClick={() => { setError(""); createMutation.mutate(); }}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "[ POSTING... ]" : "[ POST THREAD ]"}
          </button>
          <button
            onClick={onCancel}
            style={{ fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: "bold", padding: "5px 14px", background: "#dddddd", color: "#333", border: "2px solid #bbbbbb", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Thread View ──────────────────────────────────────────────────────────────
function ThreadView({ threadId, username, onBack }: { threadId: number; username: string; onBack: () => void }) {
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ thread: any; posts: any[] }>({
    queryKey: ["/api/community/threads", threadId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/community/threads/${threadId}`);
      return res.json();
    },
    staleTime: 10000,
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/community/threads/${threadId}/reply`, {
        body: replyBody.trim(),
        authorUsername: username,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      return res.json();
    },
    onSuccess: () => {
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/community/threads", threadId] });
    },
    onError: (err: Error) => setReplyError(err.message),
  });

  if (isLoading) {
    return <div style={{ padding: "24px", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#888" }}>[ LOADING... ]</div>;
  }

  if (!data) return null;
  const { thread, posts: threadPosts } = data;

  return (
    <div>
      <button
        data-testid="button-back"
        onClick={onBack}
        style={{ background: "none", border: "none", fontFamily: "Courier New, monospace", fontSize: "11px", color: "#1a3a7a", cursor: "pointer", textDecoration: "underline", marginBottom: "10px", padding: 0 }}
      >
        ← Back to threads
      </button>

      {/* Thread OP */}
      <div className="rm-card" style={{ padding: "14px", marginBottom: "12px", borderLeft: "4px solid #1a3a7a" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8px" }}>
          <div>
            <h2 style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: "16px", color: "#1a3a7a", margin: 0 }}>
              {thread.title}
            </h2>
            <div style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888", marginTop: "3px" }}>
              by <strong style={{ color: "#1a3a7a" }}>{thread.authorUsername}</strong>
              {" · "}{timeAgo(thread.createdAt)}
              {thread.artistTag && <span style={{ color: "#006600" }}> · #{thread.artistTag}</span>}
              {" · "}
              <span style={{
                background: CATEGORY_COLORS[thread.category] || "#555",
                color: "#fff",
                padding: "1px 5px",
                fontSize: "9px",
                fontWeight: "bold",
              }}>
                {CATEGORY_LABELS[thread.category] || thread.category}
              </span>
            </div>
          </div>
        </div>
        <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#333", lineHeight: "1.7", margin: 0, whiteSpace: "pre-wrap" }}>
          {thread.body}
        </p>
      </div>

      {/* Replies */}
      {threadPosts.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <div className="rm-section-header" style={{ marginBottom: "0", fontSize: "11px" }}>
            REPLIES ({threadPosts.length})
          </div>
          {threadPosts.map((post: any, i: number) => (
            <div
              key={post.id}
              data-testid={`post-${post.id}`}
              className="rm-card"
              style={{
                padding: "10px 14px",
                borderLeft: `3px solid ${i % 2 === 0 ? "#cccccc" : "#1a3a7a"}`,
                marginBottom: "6px",
              }}
            >
              <div style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888", marginBottom: "5px" }}>
                <strong style={{ color: "#1a3a7a" }}>{post.authorUsername}</strong>
                {" · "}{timeAgo(post.createdAt)}
                {" · "}#{i + 1}
              </div>
              <p style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "#333", lineHeight: "1.6", margin: 0, whiteSpace: "pre-wrap" }}>
                {post.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Reply form */}
      <div className="rm-card" style={{ padding: "12px" }}>
        <div className="rm-section-header" style={{ margin: "-12px -12px 10px", fontSize: "11px" }}>
          POST A REPLY as <span style={{ color: "#ffcc44" }}>{username}</span>
        </div>
        <div style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888888", marginBottom: "8px", lineHeight: "1.5" }}>
          Reminder: No racism, misogyny, or defamatory statements. Critique the bars, not the person.
        </div>
        <textarea
          data-testid="input-reply"
          className="rm-input"
          style={{ width: "100%", height: "100px", resize: "vertical", lineHeight: "1.6", marginBottom: "6px" }}
          placeholder="Add your take..."
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          maxLength={3000}
        />
        {replyError && (
          <div style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#cc0000", marginBottom: "6px" }}>
            ⚠ {replyError}
          </div>
        )}
        <button
          data-testid="button-post-reply"
          className="rm-btn-primary"
          onClick={() => { setReplyError(""); replyMutation.mutate(); }}
          disabled={replyMutation.isPending || !replyBody.trim()}
          style={{ fontSize: "12px" }}
        >
          {replyMutation.isPending ? "[ POSTING... ]" : "[ POST REPLY ]"}
        </button>
      </div>
    </div>
  );
}
