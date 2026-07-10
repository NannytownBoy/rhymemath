/**
 * communityRoutes.ts
 * Auth, annotations, points, admin panel routes
 */
import type { Express } from "express";
import { Pool } from "pg";
import crypto from "crypto";
import {
  signToken, hashPassword, comparePassword,
  requireAuth, requireMod, requireAdmin, optionalAuth,
  type JWTPayload,
} from "./auth";
import { POINTS } from "@shared/schema";

const DB = process.env.DATABASE_URL!;

function pool() {
  return new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });
}

function now() { return Math.floor(Date.now() / 1000); }

async function awardPoints(p: Pool, userId: number, delta: number, reason: string, referenceId?: number) {
  await p.query(`UPDATE users SET points = points + $1 WHERE id = $2`, [delta, userId]);
  await p.query(
    `INSERT INTO points_ledger (user_id, delta, reason, reference_id, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [userId, delta, reason, referenceId ?? null, now()]
  );
}

export function registerCommunityRoutes(app: Express) {

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════════════════

  // POST /api/auth/register
  app.post("/api/auth/register", async (req, res) => {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password)
      return res.status(400).json({ error: "username, email, and password required" });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    if (!/^[a-zA-Z0-9_\-\.éàüöï]+$/.test(username))
      return res.status(400).json({ error: "Username may only contain letters, numbers, _ - ." });

    const p = pool();
    try {
      const exists = await p.query(
        `SELECT id FROM users WHERE email=$1 OR username=$2`, [email.toLowerCase(), username]
      );
      if (exists.rows.length > 0)
        return res.status(409).json({ error: "Email or username already taken" });

      const hash = await hashPassword(password);
      const result = await p.query(
        `INSERT INTO users (username, email, password_hash, role, points, created_at)
         VALUES ($1,$2,$3,'member',$4,$5) RETURNING id, username, email, role, points`,
        [username, email.toLowerCase(), hash, POINTS.PROFILE_CREATED, now()]
      );
      const user = result.rows[0];

      // Log signup points
      await awardPoints(p, user.id, POINTS.PROFILE_CREATED, "profile_created");

      const token = signToken({ userId: user.id, username: user.username, email: user.email, role: user.role });
      res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role, points: user.points } });
    } finally { await p.end(); }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "email and password required" });

    const p = pool();
    try {
      const result = await p.query(
        `SELECT id, username, email, password_hash, role, points FROM users WHERE email=$1`,
        [email.toLowerCase()]
      );
      if (result.rows.length === 0)
        return res.status(401).json({ error: "Invalid email or password" });

      const user = result.rows[0];
      const valid = await comparePassword(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: "Invalid email or password" });

      await p.query(`UPDATE users SET last_login_at=$1 WHERE id=$2`, [now(), user.id]);
      const token = signToken({ userId: user.id, username: user.username, email: user.email, role: user.role });
      res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role, points: user.points } });
    } finally { await p.end(); }
  });

  // POST /api/auth/forgot-password
  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "email required" });

    const p = pool();
    try {
      const result = await p.query(`SELECT id, username FROM users WHERE email=$1`, [email.toLowerCase()]);
      // Always return success to prevent email enumeration
      if (result.rows.length === 0) return res.json({ success: true });

      const user = result.rows[0];
      const token = crypto.randomBytes(32).toString("hex");
      const expiry = now() + 3600; // 1 hour

      await p.query(`UPDATE users SET reset_token=$1, reset_token_expiry=$2 WHERE id=$3`, [token, expiry, user.id]);

      // In production: send email. For now, return token in response for testing.
      // TODO: wire up SendGrid/Resend
      const resetUrl = `https://rhymemath.com/#/reset-password?token=${token}`;
      console.log(`[reset] ${email} → ${resetUrl}`);

      res.json({ success: true, _devToken: token, _devUrl: resetUrl });
    } finally { await p.end(); }
  });

  // POST /api/auth/reset-password
  app.post("/api/auth/reset-password", async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: "token and password required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const p = pool();
    try {
      const result = await p.query(
        `SELECT id FROM users WHERE reset_token=$1 AND reset_token_expiry > $2`,
        [token, now()]
      );
      if (result.rows.length === 0)
        return res.status(400).json({ error: "Invalid or expired reset token" });

      const hash = await hashPassword(password);
      await p.query(
        `UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expiry=NULL WHERE id=$2`,
        [hash, result.rows[0].id]
      );
      res.json({ success: true });
    } finally { await p.end(); }
  });

  // GET /api/auth/me
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const { userId } = (req as any).user as JWTPayload;
    const p = pool();
    try {
      const result = await p.query(
        `SELECT id, username, email, role, points, bio, avatar_url, created_at FROM users WHERE id=$1`,
        [userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
      res.json(result.rows[0]);
    } finally { await p.end(); }
  });

  // PATCH /api/auth/change-password
  app.patch("/api/auth/change-password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "currentPassword and newPassword required" });
    if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

    const { userId } = (req as any).user as JWTPayload;
    const p = pool();
    try {
      const result = await p.query(`SELECT password_hash FROM users WHERE id=$1`, [userId]);
      const valid = await comparePassword(currentPassword, result.rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: "Current password incorrect" });

      const hash = await hashPassword(newPassword);
      await p.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, userId]);
      res.json({ success: true });
    } finally { await p.end(); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ANNOTATIONS
  // ══════════════════════════════════════════════════════════════════════════

  // POST /api/annotations — submit a new annotation
  app.post("/api/annotations", requireAuth, async (req, res) => {
    const user = (req as any).user as JWTPayload;
    const { analysisId, comparisonId, side, anchorText, startIndex, endIndex,
            meaning, meaningType, interpretation1, interpretation2, interpretation3, domainTags } = req.body || {};

    if (!anchorText || !meaning || !meaningType)
      return res.status(400).json({ error: "anchorText, meaning, meaningType required" });
    if (!analysisId && !comparisonId)
      return res.status(400).json({ error: "analysisId or comparisonId required" });

    const p = pool();
    try {
      const result = await p.query(`
        INSERT INTO annotations
          (analysis_id, comparison_id, side, anchor_text, start_index, end_index,
           meaning, meaning_type, interpretation_1, interpretation_2, interpretation_3,
           domain_tags, status, submitted_by, submitted_by_username, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,$15)
        RETURNING *
      `, [
        analysisId ?? null, comparisonId ?? null, side ?? null,
        anchorText, startIndex ?? null, endIndex ?? null,
        meaning, meaningType, interpretation1 ?? null, interpretation2 ?? null, interpretation3 ?? null,
        domainTags ?? null, user.userId, user.username, now()
      ]);

      const ann = result.rows[0];
      // Award submission points
      await awardPoints(p, user.userId, POINTS.ANNOTATION_SUBMITTED, "annotation_submitted", ann.id);

      res.json({ annotation: ann, pointsEarned: POINTS.ANNOTATION_SUBMITTED });
    } finally { await p.end(); }
  });

  // GET /api/annotations?analysisId=&comparisonId=&status=
  app.get("/api/annotations", optionalAuth, async (req, res) => {
    const { analysisId, comparisonId, status } = req.query;
    const user = (req as any).user as JWTPayload | undefined;

    const p = pool();
    try {
      const conditions: string[] = [];
      const params: any[] = [];

      if (analysisId) { conditions.push(`analysis_id=$${params.length+1}`); params.push(analysisId); }
      if (comparisonId) { conditions.push(`comparison_id=$${params.length+1}`); params.push(comparisonId); }

      // Non-mods only see approved annotations (or their own pending)
      if (!user || (user.role !== "moderator" && user.role !== "admin")) {
        if (user) {
          conditions.push(`(status='approved' OR submitted_by=$${params.length+1})`);
          params.push(user.userId);
        } else {
          conditions.push(`status='approved'`);
        }
      } else if (status) {
        conditions.push(`status=$${params.length+1}`);
        params.push(status);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await p.query(
        `SELECT * FROM annotations ${where} ORDER BY created_at DESC LIMIT 100`,
        params
      );
      res.json(result.rows);
    } finally { await p.end(); }
  });

  // POST /api/annotations/:id/challenge
  // Silent — no public count exposed. 5 unique challenges → flag for mod review.
  app.post("/api/annotations/:id/challenge", requireAuth, async (req, res) => {
    const annotationId = parseInt(req.params.id);
    const { reason } = req.body || {};
    if (!reason?.trim()) return res.status(400).json({ error: "Reason required" });
    const p = pool();
    try {
      // Verify annotation exists and is approved
      const ann = await p.query(`SELECT * FROM annotations WHERE id=$1`, [annotationId]);
      if (!ann.rows[0]) return res.status(404).json({ error: "Not found" });
      if (ann.rows[0].status !== "approved") return res.status(400).json({ error: "Can only challenge approved annotations" });
      if (ann.rows[0].submitted_by === (req as any).user.userId) {
        return res.status(400).json({ error: "Cannot challenge your own annotation" });
      }

      // Insert challenge (unique per user+annotation)
      try {
        await p.query(
          `INSERT INTO annotation_challenges (annotation_id, user_id, reason) VALUES ($1,$2,$3)`,
          [annotationId, (req as any).user.userId, reason.trim()]
        );
      } catch (e: any) {
        if (e.code === "23505") return res.status(409).json({ error: "Already challenged" });
        throw e;
      }

      // Count total challenges — if threshold hit, silently flag for mod review
      const THRESHOLD = 5;
      const count = await p.query(
        `SELECT COUNT(*) FROM annotation_challenges WHERE annotation_id=$1`,
        [annotationId]
      );
      const total = parseInt(count.rows[0].count);
      if (total >= THRESHOLD && ann.rows[0].status === "approved") {
        await p.query(
          `UPDATE annotations SET status='challenged' WHERE id=$1`,
          [annotationId]
        );
        // Award challenger +5 pts for triggering the review
        await awardPoints(p, (req as any).user.userId, 5, "challenge_triggered_review", annotationId);
      }

      res.json({ success: true });
    } finally { await p.end(); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN / MODERATOR — annotation queue
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/admin/annotations?status=pending
  app.get("/api/admin/annotations", requireMod, async (req, res) => {
    const { status = "pending" } = req.query;
    const p = pool();
    try {
      const result = await p.query(
        `SELECT * FROM annotations WHERE status=$1 ORDER BY created_at ASC`,
        [status]
      );
      res.json(result.rows);
    } finally { await p.end(); }
  });

  // GET /api/admin/annotations/:id/challenges — challenge reasons for a flagged annotation
  app.get("/api/admin/annotations/:id/challenges", requireMod, async (req, res) => {
    const p = pool();
    try {
      const result = await p.query(
        `SELECT ac.id, ac.reason, ac.created_at, u.username
         FROM annotation_challenges ac
         JOIN users u ON u.id = ac.user_id
         WHERE ac.annotation_id = $1
         ORDER BY ac.created_at ASC`,
        [req.params.id]
      );
      res.json(result.rows);
    } finally { await p.end(); }
  });

  // PATCH /api/admin/annotations/:id — approve or reject
  app.patch("/api/admin/annotations/:id", requireMod, async (req, res) => {
    const reviewer = (req as any).user as JWTPayload;
    const { id } = req.params;
    const { status, reviewNote, promoteToCID } = req.body || {};

    if (!["approved", "rejected", "upheld"].includes(status))
      return res.status(400).json({ error: "status must be 'approved', 'rejected', or 'upheld'" });

    const p = pool();
    try {
      const existing = await p.query(`SELECT * FROM annotations WHERE id=$1`, [id]);
      if (existing.rows.length === 0) return res.status(404).json({ error: "Annotation not found" });
      const ann = existing.rows[0];
      if (!(["pending", "challenged"].includes(ann.status)))
        return res.status(409).json({ error: "Annotation already reviewed" });

      const isChallengeReview = ann.status === "challenged";
      // For challenged annotations: 'upheld' = mod agrees annotation is correct, 'rejected' = mod sides with challengers
      const finalStatus = status === "upheld" ? "approved" : status;
      const pointsDelta = finalStatus === "approved" ? POINTS.ANNOTATION_APPROVED : POINTS.ANNOTATION_REJECTED;
      const cidPromo = finalStatus === "approved" && promoteToCID === true;

      await p.query(`
        UPDATE annotations SET
          status=$1, reviewed_by=$2, review_note=$3,
          promote_to_cid=$4, reviewed_at=$5, points_awarded=$6
        WHERE id=$7
      `, [finalStatus, reviewer.username, reviewNote ?? null, cidPromo, now(), pointsDelta, id]);

      // Award / deduct points to submitter
      await awardPoints(p, ann.submitted_by, pointsDelta,
        finalStatus === "approved" ? "annotation_approved" : "annotation_rejected", ann.id);

      // Extra CID promotion bonus
      if (cidPromo) {
        await awardPoints(p, ann.submitted_by, POINTS.ANNOTATION_CID_PROMOTED, "annotation_cid_promoted", ann.id);
      }

      // Challenge review: reward challengers if annotation was rejected
      if (isChallengeReview && finalStatus === "rejected") {
        const challengers = await p.query(
          `SELECT user_id FROM annotation_challenges WHERE annotation_id=$1`,
          [ann.id]
        );
        for (const row of challengers.rows) {
          await awardPoints(p, row.user_id, 15, "challenge_upheld", ann.id);
        }
      }

      res.json({ success: true, pointsAwarded: pointsDelta + (cidPromo ? POINTS.ANNOTATION_CID_PROMOTED : 0) });
    } finally { await p.end(); }
  });

  // GET /api/admin/users — list all users (admin only)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const p = pool();
    try {
      const result = await p.query(
        `SELECT id, username, email, role, points, created_at, last_login_at FROM users ORDER BY created_at DESC`
      );
      res.json(result.rows);
    } finally { await p.end(); }
  });

  // PATCH /api/admin/users/:id/role — promote/demote user role
  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body || {};
    if (!["member", "moderator", "admin"].includes(role))
      return res.status(400).json({ error: "role must be member | moderator | admin" });

    const p = pool();
    try {
      await p.query(`UPDATE users SET role=$1 WHERE id=$2`, [role, id]);
      res.json({ success: true });
    } finally { await p.end(); }
  });

  // GET /api/users/:username/profile — public profile
  app.get("/api/users/:username/profile", async (req, res) => {
    const p = pool();
    try {
      const result = await p.query(
        `SELECT id, username, role, points, bio, avatar_url, created_at FROM users WHERE username=$1`,
        [req.params.username]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
      const user = result.rows[0];

      const annCount = await p.query(
        `SELECT COUNT(*) as n, COUNT(*) FILTER (WHERE status='approved') as approved FROM annotations WHERE submitted_by=$1`,
        [user.id]
      );
      const ledger = await p.query(
        `SELECT delta, reason, created_at FROM points_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
        [user.id]
      );

      res.json({
        ...user,
        annotationsSubmitted: parseInt(annCount.rows[0].n),
        annotationsApproved: parseInt(annCount.rows[0].approved),
        recentActivity: ledger.rows,
      });
    } finally { await p.end(); }
  });

  // GET /api/community/leaderboard — top contributors by points
  app.get("/api/community/leaderboard", async (req, res) => {
    const p = pool();
    try {
      const result = await p.query(`
        SELECT username, role, points,
          (SELECT COUNT(*) FROM annotations WHERE submitted_by=u.id AND status='approved') as approved_annotations
        FROM users u
        ORDER BY points DESC
        LIMIT 50
      `);
      res.json(result.rows);
    } finally { await p.end(); }
  });

  // GET /api/admin/stats — dashboard summary
  app.get("/api/admin/stats", requireMod, async (req, res) => {
    const p = pool();
    try {
      const [users, pending, approved, rejected, total, challenged] = await Promise.all([
        p.query(`SELECT COUNT(*) as n FROM users`),
        p.query(`SELECT COUNT(*) as n FROM annotations WHERE status='pending'`),
        p.query(`SELECT COUNT(*) as n FROM annotations WHERE status='approved'`),
        p.query(`SELECT COUNT(*) as n FROM annotations WHERE status='rejected'`),
        p.query(`SELECT COUNT(*) as n FROM annotations`),
        p.query(`SELECT COUNT(*) as n FROM annotations WHERE status='challenged'`),
      ]);
      res.json({
        totalUsers: parseInt(users.rows[0].n),
        pendingAnnotations: parseInt(pending.rows[0].n),
        approvedAnnotations: parseInt(approved.rows[0].n),
        rejectedAnnotations: parseInt(rejected.rows[0].n),
        totalAnnotations: parseInt(total.rows[0].n),
        challengedAnnotations: parseInt(challenged.rows[0].n),
      });
    } finally { await p.end(); }
  });
}
