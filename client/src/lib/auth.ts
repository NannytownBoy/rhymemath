/**
 * Auth helpers — token storage in React state (no localStorage/cookies)
 * Token lives in module-level variable, survives re-renders but not page reload.
 * For persistence across reloads, store in a global React context.
 */
import { apiRequest } from "./queryClient";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: "member" | "moderator" | "admin";
  points: number;
}

// Module-level token — set once on login, read by apiRequest via header injection
let _token: string | null = null;

export function setToken(t: string | null) { _token = t; }
export function getToken(): string | null { return _token; }
export function isLoggedIn(): boolean { return _token !== null; }

export function authHeaders(): Record<string, string> {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

export async function loginRequest(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  return data as { token: string; user: AuthUser };
}

export async function registerRequest(username: string, email: string, password: string) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Registration failed");
  return data as { token: string; user: AuthUser };
}

export async function forgotPasswordRequest(email: string) {
  const res = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return res.json();
}

export async function resetPasswordRequest(token: string, password: string) {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Reset failed");
  return data;
}
