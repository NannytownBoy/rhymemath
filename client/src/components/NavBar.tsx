import { Link, useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";

const LINKS = [
  { href: "/", label: "Compare" },
  { href: "/rappers", label: "Rappers" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/community", label: "Community" },
  { href: "/about", label: "About" },
];

export function NavBar() {
  const [location] = useLocation();
  const { user, isMod, logout } = useAuth();

  return (
    <header style={{ background: "#1a3a7a", borderBottom: "3px solid #0d2655" }}>
      <div
        className="max-w-5xl mx-auto px-3 py-2 flex items-center justify-between gap-4"
        style={{ flexWrap: "wrap" }}
      >
        {/* Logo */}
        <Link href="/">
          <div style={{ cursor: "pointer" }}>
            <span style={{
              fontFamily: "Arial Black, Arial, sans-serif",
              fontWeight: 900, fontSize: "24px", color: "#ffffff",
              letterSpacing: "-0.03em", textShadow: "1px 1px 0 #000000",
            }}>
              RhymeMa<span style={{ color: "#f5c518" }}>+</span>h
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <nav style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
          {LINKS.map(({ href, label }) => (
            <Link key={href} href={href}>
              <div className="rm-nav-tab"
                style={location === href ? { background: "#ffffff", color: "#1a3a7a", borderColor: "#ffffff" } : {}}>
                {label}
              </div>
            </Link>
          ))}

          {/* Auth section */}
          {user ? (
            <>
              {isMod && (
                <Link href="/admin">
                  <div className="rm-nav-tab"
                    style={location === "/admin" ? { background: "#f5c518", color: "#1a3a7a" } : { background: "rgba(245,197,24,0.15)", color: "#f5c518", borderColor: "#f5c518" }}>
                    Admin
                  </div>
                </Link>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#aabbdd" }}>
                  {user.username} · <span style={{ color: "#f5c518" }}>{user.points}pts</span>
                </span>
                <button onClick={logout} style={{
                  fontFamily: "Courier New, monospace", fontSize: 10, color: "#aabbdd",
                  background: "none", border: "1px solid #2a4a8a", padding: "3px 8px", cursor: "pointer",
                }}>
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <Link href="/login">
              <div className="rm-nav-tab" style={{ background: "rgba(245,197,24,0.15)", color: "#f5c518", borderColor: "#f5c518" }}>
                Sign In
              </div>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
