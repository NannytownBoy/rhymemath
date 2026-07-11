import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useLocation } from "wouter";
import { getToken } from "../lib/auth";

const MONO = "Courier New, monospace";
const BLUE = "#1a3a7a";
const ACCENT = "#f5c518";

function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) },
  }).then(r => r.json());
}

type Tab = "queue" | "figures" | "attribution" | "users" | "stats";

export default function Admin() {
  const { user, isMod, isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("queue");
  const [statusFilter, setStatusFilter] = useState("pending");
  const qc = useQueryClient();

  if (!user) { setLocation("/login"); return null; }
  if (!isMod) return (
    <div style={{ padding: 40, fontFamily: MONO, textAlign: "center" }}>
      Access denied. Moderator or admin required.
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ borderBottom: `2px solid ${BLUE}`, paddingBottom: 12, marginBottom: 24 }}>
        <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: "bold", color: BLUE }}>
          Admin Panel
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: "#888", marginLeft: 12 }}>
          {user.username} · {user.role}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {(["queue", "figures", "attribution", "users", "stats"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: MONO, fontSize: 12, padding: "6px 16px",
            background: tab === t ? BLUE : "#eee", color: tab === t ? "#fff" : "#333",
            border: "1px solid #ccc", cursor: "pointer", textTransform: "uppercase",
          }}>{t === "figures" ? "CID Figures" : t === "attribution" ? "Attribution" : t}</button>
        ))}
      </div>

      {tab === "queue" && <AnnotationQueue statusFilter={statusFilter} setStatusFilter={setStatusFilter} />}
      {tab === "figures" && <FiguresQueue />}
      {tab === "attribution" && <AttributionReports />}
      {tab === "users" && isAdmin && <UserManager />}
      {tab === "users" && !isAdmin && <div style={{ fontFamily: MONO, color: "#888" }}>Admin only.</div>}
      {tab === "stats" && <StatsPanel />}
    </div>
  );
}

function AnnotationQueue({ statusFilter, setStatusFilter }: { statusFilter: string; setStatusFilter: (s: string) => void }) {
  const qc = useQueryClient();
  const { data: annotations = [] } = useQuery({
    queryKey: ["/api/admin/annotations", statusFilter],
    queryFn: () => authFetch(`/api/admin/annotations?status=${statusFilter}`),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, reviewNote, promoteToCID }: any) =>
      authFetch(`/api/admin/annotations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reviewNote, promoteToCID }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/annotations"] }),
  });

  const [notes, setNotes] = useState<Record<number, string>>({});
  const [promoting, setPromoting] = useState<Record<number, boolean>>({});

  const rowStyle: React.CSSProperties = {
    border: "1px solid #ddd", padding: "14px 16px", marginBottom: 12,
    background: "#fff", fontFamily: MONO, fontSize: 12,
  };

  const badgeStyle = (type: string): React.CSSProperties => ({
    display: "inline-block", padding: "2px 7px", fontSize: 10,
    background: type === "double_entendre" ? "#1a3a7a" : type === "punchline" ? "#7a1a1a" : "#1a7a1a",
    color: "#fff", marginRight: 6, marginBottom: 4,
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["pending", "challenged", "approved", "rejected"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            fontFamily: MONO, fontSize: 11, padding: "4px 12px",
            background: statusFilter === s ? (s === "challenged" ? "#8b4400" : BLUE) : "#eee",
            color: statusFilter === s ? "#fff" : s === "challenged" ? "#8b4400" : "#333",
            border: s === "challenged" ? "1px solid #8b4400" : "1px solid #ccc", cursor: "pointer",
          }}>
            {s === "challenged" ? "⚠ FLAGGED" : s.toUpperCase()}
          </button>
        ))}
      </div>

      {(annotations as any[]).length === 0 && (
        <div style={{ fontFamily: MONO, color: "#888", padding: 20 }}>
          No {statusFilter} annotations.
        </div>
      )}

      {(annotations as any[]).map((ann: any) => (
        <div key={ann.id} style={rowStyle}>
          <div style={{ marginBottom: 8 }}>
            <span style={badgeStyle(ann.meaning_type)}>{ann.meaning_type}</span>
            {ann.domain_tags?.split(",").filter(Boolean).map((d: string) => (
              <span key={d} style={{ ...badgeStyle(""), background: "#888" }}>{d.trim()}</span>
            ))}
            <span style={{ color: "#888", fontSize: 11, float: "right" }}>
              by <strong>{ann.submitted_by_username}</strong> · #{ann.id}
            </span>
          </div>

          <div style={{ background: "#f5f5f5", padding: "8px 10px", marginBottom: 8, borderLeft: "3px solid #1a3a7a" }}>
            <strong>"{ann.anchor_text}"</strong>
          </div>

          <div style={{ marginBottom: 6 }}><strong>Meaning:</strong> {ann.meaning}</div>
          {ann.image_url && (
            <div style={{ marginBottom: 8 }}>
              <img src={ann.image_url} alt="annotation image" style={{ maxWidth: 180, maxHeight: 120, border: '1px solid #ddd', display: 'block' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
          {ann.interpretation_1 && <div><strong>Surface:</strong> {ann.interpretation_1}</div>}
          {ann.interpretation_2 && <div><strong>Hidden:</strong> {ann.interpretation_2}</div>}
          {ann.interpretation_3 && <div><strong>3rd layer:</strong> {ann.interpretation_3}</div>}
          {ann.extracted_cid && (() => {
            try {
              const cands = typeof ann.extracted_cid === 'string' ? JSON.parse(ann.extracted_cid) : ann.extracted_cid;
              if (!Array.isArray(cands) || cands.length === 0) return null;
              return (
                <div style={{ marginTop: 8, background: '#f0f8f0', border: '1px solid #9c9', padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.07em', color: '#555', marginBottom: 6 }}>CID CANDIDATES EXTRACTED</div>
                  {cands.map((c: any, i: number) => (
                    <div key={i} style={{ fontSize: 11, marginBottom: 4 }}>
                      <strong>[{c.layer}]</strong> <em>{c.term}</em>{c.canonical ? ` → ${c.canonical}` : ''}: {c.meaning}
                      {c.confidence && <span style={{ color: '#888', marginLeft: 6 }}>({Math.round(c.confidence * 100)}% conf)</span>}
                    </div>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}

          {(ann.status === "pending" || ann.status === "challenged") && (
            <div style={{ marginTop: 12 }}>
              {ann.status === "challenged" && (
                <ChallengeReasons annotationId={ann.id} />
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: ann.status === "challenged" ? 10 : 0 }}>
                <input
                  placeholder="Optional note to submitter..."
                  value={notes[ann.id] || ""}
                  onChange={e => setNotes(n => ({ ...n, [ann.id]: e.target.value }))}
                  style={{ flex: 1, minWidth: 200, padding: "5px 8px", fontFamily: MONO, fontSize: 11, border: "1px solid #ccc" }}
                />
                {ann.status === "pending" && (
                  <label style={{ fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>
                    <input type="checkbox" checked={promoting[ann.id] || false}
                      onChange={e => setPromoting(p => ({ ...p, [ann.id]: e.target.checked }))} />
                    {" "}Push to CID +50pts
                  </label>
                )}
                {ann.status === "pending" && (
                  <button onClick={() => reviewMutation.mutate({ id: ann.id, status: "approved", reviewNote: notes[ann.id], promoteToCID: promoting[ann.id] || false })}
                    style={{ fontFamily: MONO, fontSize: 11, padding: "5px 14px", background: "#1a7a1a", color: "#fff", border: "none", cursor: "pointer" }}>
                    ✓ APPROVE
                  </button>
                )}
                {ann.status === "challenged" && (
                  <button onClick={() => reviewMutation.mutate({ id: ann.id, status: "upheld", reviewNote: notes[ann.id] })}
                    style={{ fontFamily: MONO, fontSize: 11, padding: "5px 14px", background: "#1a3a7a", color: "#fff", border: "none", cursor: "pointer" }}>
                    ✓ UPHOLD
                  </button>
                )}
                <button onClick={() => reviewMutation.mutate({ id: ann.id, status: "rejected", reviewNote: notes[ann.id] })}
                  style={{ fontFamily: MONO, fontSize: 11, padding: "5px 14px", background: "#7a1a1a", color: "#fff", border: "none", cursor: "pointer" }}>
                  ✗ REJECT{ann.status === "challenged" ? " (+15pts challengers)" : ""}
                </button>
              </div>
            </div>
          )}
          {ann.status !== "pending" && ann.status !== "challenged" && (
            <div style={{ marginTop: 8, color: ann.status === "approved" ? "#007700" : "#cc0000", fontSize: 11 }}>
              {ann.status.toUpperCase()} by {ann.reviewed_by}
              {ann.review_note && ` — "${ann.review_note}"`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function UserManager() {
  const qc = useQueryClient();
  const { data: users = [] } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: () => authFetch("/api/admin/users"),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: any) =>
      authFetch(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12 }}>
        <thead>
          <tr style={{ background: BLUE, color: "#fff" }}>
            {["ID", "Username", "Email", "Role", "Points", "Joined", "Actions"].map(h => (
              <th key={h} style={{ padding: "8px 10px", textAlign: "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(users as any[]).map((u: any, i: number) => (
            <tr key={u.id} style={{ background: i % 2 === 0 ? "#f9f9f9" : "#fff", borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "7px 10px" }}>{u.id}</td>
              <td style={{ padding: "7px 10px" }}><strong>{u.username}</strong></td>
              <td style={{ padding: "7px 10px", color: "#666" }}>{u.email}</td>
              <td style={{ padding: "7px 10px" }}>
                <span style={{ padding: "2px 8px", background: u.role === "admin" ? "#7a1a1a" : u.role === "moderator" ? "#1a3a7a" : "#888", color: "#fff", fontSize: 10 }}>
                  {u.role}
                </span>
              </td>
              <td style={{ padding: "7px 10px" }}>{u.points}</td>
              <td style={{ padding: "7px 10px", color: "#888" }}>
                {new Date(u.created_at * 1000).toLocaleDateString()}
              </td>
              <td style={{ padding: "7px 10px" }}>
                <select defaultValue={u.role} onChange={e => roleMutation.mutate({ id: u.id, role: e.target.value })}
                  style={{ fontFamily: MONO, fontSize: 11, padding: "3px 6px" }}>
                  <option value="member">member</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatsPanel() {
  const { data: stats } = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: () => authFetch("/api/admin/stats"),
  });

  const statStyle: React.CSSProperties = {
    display: "inline-block", padding: "16px 24px", border: `2px solid ${BLUE}`,
    textAlign: "center", marginRight: 12, marginBottom: 12, minWidth: 120,
  };

  if (!stats) return <div style={{ fontFamily: MONO }}>Loading...</div>;

  return (
    <div>
      {[
        { label: "Total Users", value: stats.totalUsers },
        { label: "Pending", value: stats.pendingAnnotations, color: "#f5c518" },
        { label: "Flagged", value: stats.challengedAnnotations ?? 0, color: "#8b4400" },
        { label: "Approved", value: stats.approvedAnnotations, color: "#1a7a1a" },
        { label: "Rejected", value: stats.rejectedAnnotations, color: "#7a1a1a" },
        { label: "Total Annotations", value: stats.totalAnnotations },
      ].map(s => (
        <div key={s.label} style={statStyle}>
          <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: "bold", color: s.color || BLUE }}>{s.value}</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#666", marginTop: 4 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── CID Figures review queue ────────────────────────────────────────────────
function FiguresQueue() {
  const [statusFilter, setStatusFilter] = useState("candidate");
  const qc = useQueryClient();

  const { data: figures = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/figures", statusFilter],
    queryFn: () => authFetch(`/api/admin/figures?status=${statusFilter}`),
    refetchInterval: 15000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      authFetch(`/api/admin/figures/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/figures"] }),
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["candidate", "approved", "rejected"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            fontFamily: MONO, fontSize: 11, padding: "4px 12px",
            background: statusFilter === s ? BLUE : "#eee",
            color: statusFilter === s ? "#fff" : "#333",
            border: "1px solid #ccc", cursor: "pointer",
          }}>{s.toUpperCase()}</button>
        ))}
      </div>

      {figures.length === 0 && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: "#888", padding: 20 }}>No {statusFilter} figures.</div>
      )}

      {figures.map((fig: any) => (
        <div key={fig.id} style={{ border: "1px solid #ddd", padding: "12px 16px", marginBottom: 12, background: "#fff" }}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: "bold", color: BLUE, marginBottom: 4 }}>
            {fig.figure_name}
            <span style={{ fontWeight: "normal", fontSize: 10, color: "#888", marginLeft: 8 }}>
              {fig.figure_type} · {fig.era || "era unknown"}
            </span>
          </div>
          {fig.submitted_by_username && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#888", marginBottom: 6 }}>Submitted by: {fig.submitted_by_username}</div>
          )}
          {(Array.isArray(fig.domains) ? fig.domains : JSON.parse(fig.domains ?? '[]')).length > 0 && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#555", marginBottom: 6 }}>
              Domains: {(Array.isArray(fig.domains) ? fig.domains : JSON.parse(fig.domains ?? '[]')).join(", ")}
            </div>
          )}
          {fig.cultural_context && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: "#333", marginBottom: 6, paddingLeft: 8, borderLeft: "2px solid #ddd" }}>
              {fig.cultural_context}
            </div>
          )}
          {fig.scandal_summary && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#666", marginBottom: 6, fontStyle: "italic" }}>
              {fig.scandal_summary}
            </div>
          )}
          {statusFilter === "candidate" && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => reviewMutation.mutate({ id: fig.id, status: "approved" })}
                style={{ fontFamily: MONO, fontSize: 11, padding: "4px 14px", background: "#1a7a1a", color: "#fff", border: "none", cursor: "pointer" }}>
                ✓ APPROVE (+50 pts submitter)
              </button>
              <button onClick={() => reviewMutation.mutate({ id: fig.id, status: "rejected" })}
                style={{ fontFamily: MONO, fontSize: 11, padding: "4px 14px", background: "#7a1a1a", color: "#fff", border: "none", cursor: "pointer" }}>
                ✗ REJECT
              </button>
            </div>
          )}
          {statusFilter !== "candidate" && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: statusFilter === "approved" ? "#007700" : "#cc0000", marginTop: 6 }}>
              {statusFilter.toUpperCase()}{fig.reviewed_by ? ` by ${fig.reviewed_by}` : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Inline challenge reasons panel — only visible in admin FLAGGED tab
function ChallengeReasons({ annotationId }: { annotationId: number }) {
  const { data } = useQuery<any[]>({
    queryKey: ["/api/admin/challenges", annotationId],
    queryFn: () => authFetch(`/api/admin/annotations/${annotationId}/challenges`),
  });
  if (!data?.length) return null;
  return (
    <div style={{ background: "#fff8f0", border: "1px solid #8b4400", padding: "8px 12px", marginBottom: 8 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: "#8b4400", fontWeight: "bold", marginBottom: 6 }}>
        CHALLENGE REASONS ({data.length})
      </div>
      {data.map((c: any) => (
        <div key={c.id} style={{ fontFamily: MONO, fontSize: 11, color: "#555", marginBottom: 6, paddingLeft: 8, borderLeft: "2px solid #cc8844" }}>
          <span style={{ color: "#888", fontSize: 10 }}>{c.username}: </span>{c.reason}
        </div>
      ))}
    </div>
  );
}

// ── Attribution Reports tab ──────────────────────────────────────────────────
function AttributionReports() {
  const [statusFilter, setStatusFilter] = useState("open");
  const [correctedArtist, setCorrectedArtist] = useState<Record<number,string>>({});
  const [note, setNote] = useState<Record<number,string>>({});
  const qc = useQueryClient();

  const { data: reports = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/attribution-reports", statusFilter],
    queryFn: () => authFetch(`/api/admin/attribution-reports?status=${statusFilter}`),
    refetchInterval: 20000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, corrected, resNote }: { id: number; status: string; corrected?: string; resNote?: string }) =>
      authFetch(`/api/admin/attribution-reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, correctedArtist: corrected, resolutionNote: resNote }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/attribution-reports"] }),
  });

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "#555", marginBottom: 12 }}>
        Users flag verses where the credited artist is wrong (e.g. a Kanye verse labeled Jay-Z).
        Resolve to correct the artist name in the database; dismiss if invalid.
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["open", "resolved", "dismissed"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            fontFamily: MONO, fontSize: 11, padding: "4px 12px",
            background: statusFilter === s ? BLUE : "#eee",
            color: statusFilter === s ? "#fff" : "#333",
            border: "1px solid #ccc", cursor: "pointer",
          }}>{s.toUpperCase()}</button>
        ))}
      </div>

      {reports.length === 0 && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: "#888", padding: 20 }}>
          No {statusFilter} attribution reports.
        </div>
      )}

      {reports.map((r: any) => (
        <div key={r.id} style={{ border: "1px solid #ddd", padding: "12px 16px", marginBottom: 12, background: "#fff" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: "bold", color: BLUE, marginBottom: 4 }}>
            "{r.song_name}"
            <span style={{ fontWeight: "normal", color: "#888", marginLeft: 8 }}>
              currently: <b>{r.artist_name}</b>
              {r.reported_artist && <> → should be: <b style={{ color: "#007700" }}>{r.reported_artist}</b></>}
            </span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: "#999", marginBottom: 6 }}>
            analysis_id: {r.analysis_id}
            {r.reporter_username && ` · reported by @${r.reporter_username}`}
          </div>
          {r.reason && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: "#444", marginBottom: 8,
              padding: "6px 10px", background: "#f9f9f9", borderLeft: "2px solid #ddd" }}>
              "{r.reason}"
            </div>
          )}
          {statusFilter === "open" && (
            <div>
              <input
                placeholder="Corrected artist name (leave blank if dismissing)"
                value={correctedArtist[r.id] ?? r.reported_artist ?? ""}
                onChange={e => setCorrectedArtist(prev => ({ ...prev, [r.id]: e.target.value }))}
                style={{ fontFamily: MONO, fontSize: 10, border: "1px solid #ccc", padding: "4px 8px",
                  width: "100%", marginBottom: 6, boxSizing: "border-box" }}
              />
              <input
                placeholder="Resolution note (optional)"
                value={note[r.id] ?? ""}
                onChange={e => setNote(prev => ({ ...prev, [r.id]: e.target.value }))}
                style={{ fontFamily: MONO, fontSize: 10, border: "1px solid #ccc", padding: "4px 8px",
                  width: "100%", marginBottom: 8, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => reviewMutation.mutate({
                    id: r.id, status: "resolved",
                    corrected: correctedArtist[r.id] || r.reported_artist,
                    resNote: note[r.id],
                  })}
                  style={{ fontFamily: MONO, fontSize: 11, padding: "4px 14px",
                    background: "#1a7a1a", color: "#fff", border: "none", cursor: "pointer" }}>
                  ✓ RESOLVE{correctedArtist[r.id] || r.reported_artist ? " + FIX ARTIST" : ""}
                </button>
                <button
                  onClick={() => reviewMutation.mutate({ id: r.id, status: "dismissed", resNote: note[r.id] })}
                  style={{ fontFamily: MONO, fontSize: 11, padding: "4px 14px",
                    background: "#888", color: "#fff", border: "none", cursor: "pointer" }}>
                  ✗ DISMISS
                </button>
              </div>
            </div>
          )}
          {statusFilter !== "open" && (
            <div style={{ fontFamily: MONO, fontSize: 10, color: statusFilter === "resolved" ? "#007700" : "#888", marginTop: 6 }}>
              {statusFilter.toUpperCase()}{r.resolution_note ? ` — ${r.resolution_note}` : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

