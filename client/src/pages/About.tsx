import { Link } from "wouter";

const CATEGORIES = [
  { name: "Flow", weight: "30%", desc: "Cadence pocket (syllable variation in the groove zone), percussive attack (hard consonant density), internal assonance (vowel sound recurrence), phrase symmetry (anaphora/parallel structures), and multisyllabic rhyme chains." },
  { name: "Wordplay", weight: "20%", desc: "Metaphors, similes, homophones, double meanings, references, reversals, callbacks, and layered language." },
  { name: "Storytelling", weight: "20%", desc: "Clear topic, narrative progression, chronology, emotional arc, callbacks, thematic consistency, and verse coherence." },
  { name: "Rhyming", weight: "15%", desc: "End rhyme density, internal rhyme density, repeated vowel and consonant sounds, multisyllabic rhyme approximation, and rhyme chain length." },
  { name: "Punchlines", weight: "15%", desc: "Setup and payoff structure, surprise factor, reversals, quotability, contrast, and punch density." },
];

const MEASURED = [
  "End rhyme detection — last word of each line matched across the verse",
  "Internal rhyme density — same word endings repeating within and across lines",
  "Syllable count per line — approximated via vowel-cluster counting",
  "Cadence variation — coefficient of variation of syllable counts (CV %)",
  "Percussive consonant density — word-initial T, K, P, D, B, G hits per word",
  "Vowel phoneme recurrence — 7 phoneme families tracked for assonance",
  "Multisyllabic rhyme chains — 4+ char endings repeating 3x across the verse",
  "Phrase symmetry — repeated line openers (anaphora detection)",
  "Punchline structure — setup/payoff and contrast markers per line",
];

const FLOW_DIMENSIONS = [
  { dim: "Cadence Pocket", max: 35, what: "Syllable count variation across lines. CV of 15–40% = the groove zone. Under 10% = monotone. Over 55% = choppy and hard to follow." },
  { dim: "Percussive Attack", max: 20, what: "Density of word-initial hard consonants (T, K, P, D, B, G) relative to total words. The beat punch. Dense hard consonants in the 35–55% range = punchy pocket." },
  { dim: "Internal Assonance", max: 20, what: "Same vowel phoneme families (long-i, oo-sound, long-a, long-e, short-u, short-a) repeating within and across lines. This is the pocket lock — the sound that makes the verse feel musical without the audio." },
  { dim: "Phrase Symmetry", max: 15, what: "Parallel grammatical structures and anaphora — lines opening with the same word(s). Example: Never lose / Never choose / Never bruise. Creates rhythmic expectation and payoff." },
  { dim: "Multisyllabic Chains", max: 15, what: "Four-character word endings repeating 3 or more times across the verse. Example: dollars / parlors / scholars. The bounce — the element that makes dense verses feel effortless." },
];

const JUDGED = [
  "Flow quality (cadence variation scoring)",
  "Wordplay (device density and variety)",
  "Storytelling / Coherence (transitions, POV, emotional arc)",
  "Punchlines (setup/payoff structural detection)",
  "Originality (device count and variety)",
  "Thematic progression (transition word density)",
];

const COMING_SOON = [
  "Phonetic rhyme detection using CMU Pronouncing Dictionary for syllable-accurate rhyme matching",
  "Supabase-backed persistent comparison database for production-grade data durability",
  "Community voting alongside algorithmic scores, so the crowd can weigh in",
  "Phonetic rhyme matching via CMU Pronouncing Dictionary for syllable-accurate end rhyme detection",
  "Optional AI scoring overlay via OpenAI, Claude, or Gemini as a second opinion layer",
];

const DISCLAIMERS = [
  "RhymeMath does not claim perfect objectivity. No algorithm can fully capture the art of rap.",
  "Flow scoring is an approximation. True flow depends on audio, delivery, and timing, and text alone is a proxy for those qualities.",
  "Wordplay indicators are heuristic, and double meanings or coded language may not always be detected.",
  "Scores are estimates, not verdicts. The word Estimated is used deliberately throughout the interface.",
  "Confidence scores reflect the score gap between two verses, not certainty about artistic superiority.",
  "No AI model is used in the scoring engine. Results are deterministic and reproducible.",
];

export default function About() {
  return (
    <main style={{ background: "#f7f5f0", minHeight: "100vh", paddingBottom: "40px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 16px" }}>

        {/* Page header */}
        <div className="rm-section-header-blue" style={{ marginTop: "20px" }}>
          [ ABOUT RHYMEMATH ]
        </div>

        <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "13px", color: "#444", marginBottom: "18px", lineHeight: "1.7" }}>
          RhymeMath is a rap analytics platform for accurate, transparent, head-to-head verse comparisons. It is not a judge. It is a measurement tool, designed to surface evidence and inform the debate, not settle it.
        </p>

        {/* How it works */}
        <div style={{ border: "1px solid #bbbbbb", background: "#fff", marginBottom: "12px" }}>
          <div className="rm-section-header" style={{ margin: 0 }}>
            [ HOW IT WORKS ]
          </div>
          <div style={{ padding: "12px 16px" }}>
            <ol style={{ margin: 0, paddingLeft: "20px", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "13px", color: "#444", lineHeight: "1.7" }}>
              {[
                "You enter two verses, with Artist, Song, and the full verse text for each side.",
                "RhymeMath tokenizes each verse into lines and words.",
                "The scoring engine runs deterministic text analysis on both verses.",
                "Each category is scored independently using a hybrid heuristic system.",
                "Weighted scores are combined into an overall RhymeMath Score.",
                "Evidence is surfaced for every category, so you can see exactly what was detected.",
                "A shareable result URL is generated for each comparison.",
              ].map((step, i) => (
                <li key={i} style={{ marginBottom: "6px" }}>{step}</li>
              ))}
            </ol>
          </div>
        </div>

        {/* Scoring weights */}
        <div style={{ border: "1px solid #bbbbbb", background: "#fff", marginBottom: "12px" }}>
          <div className="rm-section-header" style={{ margin: 0 }}>
            [ SCORING WEIGHTS ]
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Arial, sans-serif", fontSize: "12px" }}>
            <thead>
              <tr style={{ background: "#e0e8ff" }}>
                <th style={{ padding: "6px 14px", textAlign: "left", fontWeight: "bold", color: "#1a3a7a", fontSize: "11px", borderBottom: "1px solid #bbbbbb" }}>CATEGORY</th>
                <th style={{ padding: "6px 14px", textAlign: "center", fontWeight: "bold", color: "#1a3a7a", fontSize: "11px", borderBottom: "1px solid #bbbbbb", width: "60px" }}>WEIGHT</th>
                <th style={{ padding: "6px 14px", textAlign: "left", fontWeight: "bold", color: "#1a3a7a", fontSize: "11px", borderBottom: "1px solid #bbbbbb" }}>WHAT IT MEASURES</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(({ name, weight, desc }, i) => (
                <tr key={name} style={{ background: i % 2 === 0 ? "#ffffff" : "#f5f3ef" }}>
                  <td style={{ padding: "7px 14px", fontWeight: "bold", color: "#1a3a7a", borderBottom: "1px solid #e8e8e8", whiteSpace: "nowrap" }}>
                    {name}
                  </td>
                  <td style={{ padding: "7px 14px", textAlign: "center", fontFamily: "Courier New, monospace", fontWeight: "bold", color: "#8b0000", borderBottom: "1px solid #e8e8e8" }}>
                    {weight}
                  </td>
                  <td style={{ padding: "7px 14px", color: "#444", borderBottom: "1px solid #e8e8e8", fontSize: "11px", lineHeight: "1.5", fontFamily: "Georgia, serif" }}>
                    {desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Flow Engine Breakdown */}
        <div style={{ border: "1px solid #bbbbbb", background: "#fff", marginBottom: "12px" }}>
          <div className="rm-section-header" style={{ margin: 0, background: "#222222", borderColor: "#111111" }}>
            [ FLOW ENGINE — 5 DIMENSIONS ]
          </div>
          <div style={{ padding: "10px 14px 6px 14px" }}>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "12px", color: "#555", marginBottom: "10px", lineHeight: "1.6" }}>
              Flow is the most contested category in rap. RhymeMath measures it across five independent dimensions,
              each weighted to capture a different aspect of how a verse sits on the beat — without audio.
              Max possible flow score: 95. No verse scores 100.
            </p>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Arial, sans-serif", fontSize: "12px" }}>
            <thead>
              <tr style={{ background: "#1a1a1a" }}>
                <th style={{ padding: "6px 14px", textAlign: "left", fontWeight: "bold", color: "#ffcc44", fontSize: "11px", borderBottom: "1px solid #444" }}>DIMENSION</th>
                <th style={{ padding: "6px 14px", textAlign: "center", fontWeight: "bold", color: "#ffcc44", fontSize: "11px", borderBottom: "1px solid #444", width: "50px" }}>MAX</th>
                <th style={{ padding: "6px 14px", textAlign: "left", fontWeight: "bold", color: "#ffcc44", fontSize: "11px", borderBottom: "1px solid #444" }}>WHAT IT DETECTS</th>
              </tr>
            </thead>
            <tbody>
              {FLOW_DIMENSIONS.map(({ dim, max, what }, i) => (
                <tr key={dim} style={{ background: i % 2 === 0 ? "#ffffff" : "#f5f3ef" }}>
                  <td style={{ padding: "7px 14px", fontWeight: "bold", color: "#222", borderBottom: "1px solid #e8e8e8", whiteSpace: "nowrap", fontFamily: "Courier New, monospace", fontSize: "11px" }}>
                    {dim}
                  </td>
                  <td style={{ padding: "7px 14px", textAlign: "center", fontFamily: "Courier New, monospace", fontWeight: "bold", color: "#8b0000", borderBottom: "1px solid #e8e8e8" }}>
                    {max}
                  </td>
                  <td style={{ padding: "7px 14px", color: "#444", borderBottom: "1px solid #e8e8e8", fontSize: "11px", lineHeight: "1.6", fontFamily: "Georgia, serif" }}>
                    {what}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "8px 14px", borderTop: "1px solid #ddd", fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888" }}>
            * True flow depends on audio delivery and timing. Text-based scoring is a proxy. No algorithm captures what your ear hears.
            RhymeMath scores are estimates, not verdicts.
          </div>
        </div>

        {/* Score Ranking Bands */}
        <div style={{ border: "1px solid #bbbbbb", background: "#fff", marginBottom: "12px" }}>
          <div className="rm-section-header" style={{ margin: 0 }}>[ SCORE RANKING BANDS ]</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Courier New, monospace", fontSize: "12px" }}>
            <thead>
              <tr style={{ background: "#e0e8ff" }}>
                <th style={{ padding: "6px 14px", textAlign: "left", fontWeight: "bold", color: "#1a3a7a", fontSize: "11px", borderBottom: "1px solid #bbbbbb", width: "110px" }}>RANGE</th>
                <th style={{ padding: "6px 14px", textAlign: "left", fontWeight: "bold", color: "#1a3a7a", fontSize: "11px", borderBottom: "1px solid #bbbbbb", width: "140px" }}>TIER</th>
                <th style={{ padding: "6px 14px", textAlign: "left", fontWeight: "bold", color: "#1a3a7a", fontSize: "11px", borderBottom: "1px solid #bbbbbb" }}>WHAT IT MEANS</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  range: "90 – 100",
                  tier: "All-Time Elite",
                  color: "#b8860b",
                  meaning: "Exceptional across every measurable dimension — rhyme architecture, wordplay density, narrative cohesion, and punchline precision all firing simultaneously. Every technical lever is maxed.",
                },
                {
                  range: "80 – 89",
                  tier: "Elite",
                  color: "#006600",
                  meaning: "Dominant in most categories. Dense multi-syllabic rhyme schemes, layered wordplay, and structural control throughout. One or two dimensions may not peak, but the overall craft is undeniable. Verses that define careers.",
                },
                {
                  range: "70 – 79",
                  tier: "High Caliber",
                  color: "#4a7a9b",
                  meaning: "Strong verse with real technical merit. Likely excellent in 2–3 categories with no critical weak spots. The kind of verse that earns respect without necessarily being quoted forever.",
                },
                {
                  range: "60 – 69",
                  tier: "Solid",
                  color: "#1a3a7a",
                  meaning: "Above average. Competent across most areas with standout moments in at least one dimension. Holds its own on any track but may not be the verse that defines it.",
                },
                {
                  range: "50 – 59",
                  tier: "Average",
                  color: "#664400",
                  meaning: "Serviceable. The verse does its job. Limited complexity or a clear weakness in a key category — rhyme density, wordplay, or narrative arc. Gets the song done but doesn't elevate it.",
                },
                {
                  range: "40 – 49",
                  tier: "Below Average",
                  color: "#8b0000",
                  meaning: "Struggles in multiple dimensions on the page. May rely on delivery, energy, or production to compensate for what the text alone doesn't carry. Text-only scoring reveals the gap.",
                },
                {
                  range: "Below 40",
                  tier: "Weak",
                  color: "#cc0000",
                  meaning: "Minimal technical content detectable in text. Very short, repetitive, or structurally sparse. Delivery can make a low-scoring verse feel iconic — RhymeMath only reads the page, not the room.",
                },
              ].map((band, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#ffffff" : "#f5f3ef" }}>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid #e8e8e8", fontWeight: 700, color: band.color, fontSize: "13px" }}>
                    {band.range}
                  </td>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid #e8e8e8", fontWeight: 700, color: band.color, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.05em" }}>
                    {band.tier}
                  </td>
                  <td style={{ padding: "8px 14px", borderBottom: "1px solid #e8e8e8", fontFamily: "Georgia, serif", fontSize: "11px", color: "#444", lineHeight: 1.5 }}>
                    {band.meaning}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "8px 14px", borderTop: "1px solid #ddd", fontFamily: "Courier New, monospace", fontSize: "10px", color: "#888" }}>
            * Scores reflect the written text only. Vocal delivery, production, cultural context, and influence are not scored — those live in the ear, not on the page.
          </div>
        </div>

        {/* Measured vs Judged side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div style={{ border: "1px solid #bbbbbb", background: "#fff" }}>
            <div className="rm-section-header" style={{ margin: 0 }}>
              [ MEASURED ]
            </div>
            <div style={{ padding: "10px 14px" }}>
              <p style={{ fontFamily: "Georgia, serif", fontSize: "11px", color: "#666", marginBottom: "8px", lineHeight: "1.5" }}>
                Deterministic, calculated directly from the text with no judgment.
              </p>
              <ul style={{ margin: 0, paddingLeft: "16px", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "12px", color: "#444", lineHeight: "1.7" }}>
                {MEASURED.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          </div>
          <div style={{ border: "1px solid #bbbbbb", background: "#fff" }}>
            <div className="rm-section-header" style={{ margin: 0 }}>
              [ JUDGED ]
            </div>
            <div style={{ padding: "10px 14px" }}>
              <p style={{ fontFamily: "Georgia, serif", fontSize: "11px", color: "#666", marginBottom: "8px", lineHeight: "1.5" }}>
                Explainable rule-based scoring for subjective categories.
              </p>
              <ul style={{ margin: 0, paddingLeft: "16px", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "12px", color: "#444", lineHeight: "1.7" }}>
                {JUDGED.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          </div>
        </div>

        {/* Disclaimer box */}
        <div style={{ border: "2px solid #8b0000", background: "#fff8f8", marginBottom: "12px" }}>
          <div style={{ background: "#8b0000", color: "#ffffff", fontFamily: "Arial Black, Arial, sans-serif", fontSize: "11px", fontWeight: "bold", padding: "5px 12px", letterSpacing: "1px" }}>
            [ WHAT RHYMEMATH DOES NOT CLAIM ]
          </div>
          <div style={{ padding: "10px 14px" }}>
            <ul style={{ margin: 0, paddingLeft: "16px", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "12px", color: "#444", lineHeight: "1.7" }}>
              {DISCLAIMERS.map((d, i) => <li key={i} style={{ marginBottom: "4px" }}>{d}</li>)}
            </ul>
          </div>
        </div>

        {/* Coming soon */}
        <div style={{ border: "1px solid #bbbbbb", background: "#fff", marginBottom: "20px" }}>
          <div className="rm-section-header" style={{ margin: 0 }}>
            [ WHAT'S COMING ]
          </div>
          <div style={{ padding: "10px 14px" }}>
            <ul style={{ margin: 0, paddingLeft: "16px", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "12px", color: "#444", lineHeight: "1.9" }}>
              {COMING_SOON.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center" }}>
          <Link href="/">
            <a className="rm-button" style={{ display: "inline-block" }}>
              [ RUN A COMPARISON ]
            </a>
          </Link>
        </div>

      </div>
    </main>
  );
}
