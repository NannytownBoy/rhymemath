import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.js";
import { Toaster } from "./components/ui/toaster.js";
import { NavBar } from "./components/NavBar.js";
import { AuthProvider } from "./context/AuthContext.js";
import Home from "./pages/Home.js";
import Results from "./pages/Results.js";
import Rappers from "./pages/Rappers.js";
import RapperProfile from "./pages/RapperProfile.js";
import Leaderboard from "./pages/Leaderboard.js";
import About from "./pages/About.js";
import Community from "./pages/Community.js";
import Terms from "./pages/Terms.js";
import Privacy from "./pages/Privacy.js";
import SoloResults from "./pages/SoloResults.js";
import Login from "./pages/Login.js";
import Admin from "./pages/Admin.js";
import NotFound from "./pages/not-found.js";

// Inline SVG icons for social links
function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-label="X (Twitter)">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.264 5.633 5.9-5.633zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-label="Instagram">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
}

function IconTikTok() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-label="TikTok">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.19 8.19 0 004.79 1.54V6.79a4.85 4.85 0 01-1.02-.1z"/>
    </svg>
  );
}

function Footer() {
  const socialStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#aabbdd",
    padding: "4px 8px",
    border: "1px solid #2a4a8a",
    textDecoration: "none",
    transition: "color 0.1s",
    gap: "5px",
    fontFamily: "Arial, sans-serif",
    fontSize: "11px",
  } as React.CSSProperties;

  return (
    <footer style={{ borderTop: "2px solid #1a3a7a", background: "#1a3a7a", padding: "12px 16px", marginTop: "auto" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        {/* Social row */}
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "10px" }}>
          <a href="https://instagram.com/rhymemath" target="_blank" rel="noopener noreferrer" style={socialStyle}>
            <IconInstagram /> Instagram
          </a>
          <a href="https://tiktok.com/@rhymemath" target="_blank" rel="noopener noreferrer" style={socialStyle}>
            <IconTikTok /> TikTok
          </a>
          <a href="https://x.com/rhymemath" target="_blank" rel="noopener noreferrer" style={socialStyle}>
            <IconX /> X
          </a>
        </div>

        {/* Bottom row */}
        <p style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#aabbdd", margin: 0, textAlign: "center" }}>
          &copy; {new Date().getFullYear()}{" "}
          <strong style={{ color: "#ffffff" }}>RhymeMa<span style={{ color: "#f5c518" }}>+</span>h</strong>
          {" | "}
          Powered by <strong style={{ color: "#f5c842" }}>Petite Haché Labs</strong>
          {" | "}
          <a href="/#/about" style={{ color: "#aabbdd" }}>About</a>
          {" | "}
          <a href="/#/leaderboard" style={{ color: "#aabbdd" }}>Leaderboard</a>
          {" | "}
          <a href="/#/community" style={{ color: "#aabbdd" }}>Community</a>
          {" | "}
          <a href="/#/terms" style={{ color: "#aabbdd" }}>Terms of Service</a> &nbsp;|&nbsp; <a href="/#/privacy" style={{ color: "#aabbdd" }}>Privacy Policy</a>
          {" | "}
          <a href="mailto:notices@rhymemath.com" style={{ color: "#aabbdd" }}>notices@rhymemath.com</a>
        </p>
      </div>
    </footer>
  );
}

function AppRoutes() {
  return (
    <div className="flex flex-col min-h-screen">
      <NavBar />
      <div className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/results/:id" component={Results} />
          <Route path="/rappers" component={Rappers} />
          <Route path="/rappers/:slug" component={RapperProfile} />
          <Route path="/leaderboard" component={Leaderboard} />
          <Route path="/community" component={Community} />
          <Route path="/about" component={About} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/analysis/:id" component={SoloResults} />
          <Route path="/login" component={Login} />
          <Route path="/admin" component={Admin} />
          <Route component={NotFound} />
        </Switch>
      </div>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router hook={useHashLocation}>
          <AppRoutes />
        </Router>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
