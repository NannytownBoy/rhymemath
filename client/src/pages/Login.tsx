import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";
import { loginRequest, registerRequest, forgotPasswordRequest, resetPasswordRequest } from "../lib/auth";

type Mode = "login" | "register" | "forgot" | "reset";

const MONO = "Courier New, monospace";
const BLUE = "#1a3a7a";
const ACCENT = "#f5c518";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "", resetToken: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Pull reset token from URL hash params
  const hashParams = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const urlToken = hashParams.get("token");
  if (urlToken && mode !== "reset" && !form.resetToken) {
    setForm(f => ({ ...f, resetToken: urlToken }));
    setMode("reset");
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (mode === "login") {
        const { token, user } = await loginRequest(form.email, form.password);
        login(token, user);
        setLocation("/");
      } else if (mode === "register") {
        if (form.password !== form.confirm) throw new Error("Passwords do not match");
        const { token, user } = await registerRequest(form.username, form.email, form.password);
        login(token, user);
        setSuccess(`Welcome, ${user.username}! You earned ${user.points} points for joining.`);
        setTimeout(() => setLocation("/"), 1800);
      } else if (mode === "forgot") {
        await forgotPasswordRequest(form.email);
        setSuccess("If that email exists, a reset link was sent. Check your inbox.");
      } else if (mode === "reset") {
        await resetPasswordRequest(form.resetToken, form.password);
        setSuccess("Password reset. You can now log in.");
        setTimeout(() => setMode("login"), 1800);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally { setLoading(false); }
  }

  const titles: Record<Mode, string> = {
    login: "Sign In", register: "Create Account",
    forgot: "Reset Password", reset: "Set New Password",
  };

  const inputStyle: React.CSSProperties = {
    display: "block", width: "100%", padding: "8px 10px",
    fontFamily: MONO, fontSize: "13px",
    background: "#fff", border: "1px solid #ccc",
    marginBottom: "12px", boxSizing: "border-box",
  };
  const btnStyle: React.CSSProperties = {
    width: "100%", padding: "10px", fontFamily: MONO,
    fontSize: "14px", fontWeight: "bold", background: BLUE,
    color: "#fff", border: "none", cursor: "pointer",
    letterSpacing: "0.05em",
  };
  const linkStyle: React.CSSProperties = {
    color: BLUE, fontFamily: MONO, fontSize: "12px",
    cursor: "pointer", textDecoration: "underline", background: "none",
    border: "none", padding: 0,
  };

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", padding: "0 16px" }}>
      <div style={{ border: `2px solid ${BLUE}`, padding: "28px 32px", background: "#fff" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: "bold", color: BLUE }}>
            RhymeMa<span style={{ color: ACCENT }}>+</span>h
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: "#666", marginTop: 4 }}>
            {titles[mode]}
          </div>
        </div>

        {error && (
          <div style={{ background: "#fff0f0", border: "1px solid #cc0000", padding: "8px 12px",
            fontFamily: MONO, fontSize: 12, color: "#cc0000", marginBottom: 14 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: "#f0fff4", border: "1px solid #009900", padding: "8px 12px",
            fontFamily: MONO, fontSize: 12, color: "#007700", marginBottom: 14 }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <label style={{ fontFamily: MONO, fontSize: 11, color: "#666" }}>USERNAME</label>
              <input data-testid="input-username" style={inputStyle} value={form.username}
                onChange={set("username")} placeholder="your_handle" required />
            </>
          )}

          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <>
              <label style={{ fontFamily: MONO, fontSize: 11, color: "#666" }}>EMAIL</label>
              <input data-testid="input-email" style={inputStyle} type="email" value={form.email}
                onChange={set("email")} placeholder="you@example.com" required />
            </>
          )}

          {(mode === "login" || mode === "register" || mode === "reset") && (
            <>
              <label style={{ fontFamily: MONO, fontSize: 11, color: "#666" }}>
                {mode === "reset" ? "NEW PASSWORD" : "PASSWORD"}
              </label>
              <input data-testid="input-password" style={inputStyle} type="password" value={form.password}
                onChange={set("password")} placeholder="••••••••" required minLength={8} />
            </>
          )}

          {(mode === "register" || mode === "reset") && (
            <>
              <label style={{ fontFamily: MONO, fontSize: 11, color: "#666" }}>CONFIRM PASSWORD</label>
              <input data-testid="input-confirm" style={inputStyle} type="password" value={form.confirm}
                onChange={set("confirm")} placeholder="••••••••" required minLength={8} />
            </>
          )}

          {mode === "register" && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: "#888", marginBottom: 14,
              padding: "8px 10px", background: "#f9f9f9", border: "1px solid #eee" }}>
              🎤 You earn <strong>50 points</strong> just for joining. Points unlock contributor status and future perks.
            </div>
          )}

          <button data-testid="button-submit" style={btnStyle} type="submit" disabled={loading}>
            {loading ? "..." : titles[mode].toUpperCase()}
          </button>
        </form>

        {/* Mode switcher */}
        <div style={{ marginTop: 16, textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
          {mode === "login" && <>
            <button style={linkStyle} onClick={() => setMode("register")}>Don't have an account? Join now</button>
            <button style={linkStyle} onClick={() => setMode("forgot")}>Forgot password?</button>
          </>}
          {mode === "register" && (
            <button style={linkStyle} onClick={() => setMode("login")}>Already have an account? Sign in</button>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <button style={linkStyle} onClick={() => setMode("login")}>← Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}
