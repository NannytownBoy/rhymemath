import { Link, useLocation } from "wouter";

const LINKS = [
  { href: "/", label: "Compare" },
  { href: "/rappers", label: "Rappers" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/community", label: "Community" },
  { href: "/about", label: "About" },
];

export function NavBar() {
  const [location] = useLocation();

  return (
    <header style={{ background: "#1a3a7a", borderBottom: "3px solid #0d2655" }}>
      <div
        className="max-w-5xl mx-auto px-3 py-2 flex items-center justify-between gap-4"
        style={{ flexWrap: "wrap" }}
      >
        {/* Logo only — no subtitle bar */}
        <Link href="/">
          <div style={{ cursor: "pointer" }}>
            <span style={{
              fontFamily: "Arial Black, Arial, sans-serif",
              fontWeight: 900,
              fontSize: "24px",
              color: "#ffffff",
              letterSpacing: "-0.03em",
              textShadow: "1px 1px 0 #000000",
            }}>
              RhymeMa<span style={{ color: "#f5c518" }}>+</span>h
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <nav style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {LINKS.map(({ href, label }) => (
            <Link key={href} href={href}>
              <div
                className="rm-nav-tab"
                style={
                  location === href
                    ? { background: "#ffffff", color: "#1a3a7a", borderColor: "#ffffff" }
                    : {}
                }
              >
                {label}
              </div>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
