/**
 * LyricViewer
 * Renders verse text with three highlight layers:
 *   1. Teal glow   — CID-matched tokens
 *   2. Gold underline — approved annotations (by char range)
 *   3. Blue selection — live user text selection
 *
 * Emits onSelect(anchorText, charStart, charEnd) when user highlights text.
 * Emits onAnnotationClick(annotation) when user clicks an annotated phrase.
 */
import { useRef, useEffect, useState } from "react";

const MONO = "'Courier New', monospace";
const TEAL = "#00b8c8";
const GOLD = "#c8960a";
const SEL  = "rgba(26,58,122,0.18)";

export interface CIDToken {
  term: string;
  matchType: "cultural" | "entendre" | "alias";
  meaning?: string;
}

export interface AnnotationRange {
  id: number;
  anchor_text: string;
  char_start: number | null;
  char_end: number | null;
  meaning: string;
  upvotes: number;
  image_url?: string | null;
  submitted_by_username: string;
}

interface Props {
  verse: string;
  cidTokens: CIDToken[];
  annotations: AnnotationRange[];          // approved annotations
  activeAnnotationId?: number | null;      // currently selected annotation card
  isLoggedIn: boolean;
  onSelect: (text: string, charStart: number, charEnd: number) => void;
  onAnnotationClick: (ann: AnnotationRange) => void;
}

interface Segment {
  text: string;
  offset: number;
  cid?: CIDToken;
  ann?: AnnotationRange;
}

/** Build character-level spans with priority: annotation > cid */
function buildSegments(verse: string, cids: CIDToken[], anns: AnnotationRange[]): Segment[] {
  const len = verse.length;
  // Mark each character: 0=plain, 1=cid, 2=annotation
  const layer = new Uint8Array(len);
  const cidMap = new Map<number, CIDToken>();
  const annMap = new Map<number, AnnotationRange>();

  // CID: scan all occurrences
  for (const tok of cids) {
    const lower = tok.term.toLowerCase();
    let pos = 0;
    while (pos < len) {
      const idx = verse.toLowerCase().indexOf(lower, pos);
      if (idx === -1) break;
      for (let i = idx; i < idx + tok.term.length; i++) {
        if (layer[i] < 1) { layer[i] = 1; cidMap.set(i, tok); }
      }
      pos = idx + 1;
    }
  }

  // Annotations (char_start/char_end wins over CID)
  for (const ann of anns) {
    if (ann.char_start == null || ann.char_end == null) {
      // Fallback: find by anchor text
      const idx = verse.indexOf(ann.anchor_text);
      if (idx !== -1) {
        for (let i = idx; i < idx + ann.anchor_text.length; i++) {
          layer[i] = 2; annMap.set(i, ann);
        }
      }
    } else {
      for (let i = ann.char_start; i < Math.min(ann.char_end, len); i++) {
        layer[i] = 2; annMap.set(i, ann);
      }
    }
  }

  // Build runs
  const segs: Segment[] = [];
  let i = 0;
  while (i < len) {
    const type = layer[i];
    const start = i;
    const ref = type === 2 ? annMap.get(i) : type === 1 ? cidMap.get(i) : undefined;
    while (i < len && layer[i] === type &&
      (type === 0 || (type === 1 ? cidMap.get(i) === ref : annMap.get(i) === ref))) {
      i++;
    }
    segs.push({ text: verse.slice(start, i), offset: start, cid: type === 1 ? ref as CIDToken : undefined, ann: type === 2 ? ref as AnnotationRange : undefined });
  }
  return segs;
}

export function LyricViewer({ verse, cidTokens, annotations, activeAnnotationId, isLoggedIn, onSelect, onAnnotationClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selRange, setSelRange] = useState<{ start: number; end: number } | null>(null);

  const segments = buildSegments(verse, cidTokens, annotations);

  function getCharOffset(node: Node, offsetInNode: number): number {
    if (!containerRef.current) return -1;
    const walker = document.createTreeWalker(containerRef.current, NodeFilter.SHOW_TEXT);
    let total = 0;
    let cur: Node | null;
    while ((cur = walker.nextNode())) {
      if (cur === node) return total + offsetInNode;
      total += (cur.textContent?.length ?? 0);
    }
    return -1;
  }

  function handleMouseUp() {
    if (!isLoggedIn) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSelRange(null); return; }
    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();
    if (text.length < 2) { setSelRange(null); return; }

    const start = getCharOffset(range.startContainer, range.startOffset);
    const end   = getCharOffset(range.endContainer,   range.endOffset);
    if (start < 0 || end <= start) { setSelRange(null); return; }

    setSelRange({ start, end });
    onSelect(text, start, end);
  }

  // Clear selection highlight when panel closes
  useEffect(() => { setSelRange(null); }, [verse]);

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      style={{
        fontFamily: MONO,
        fontSize: 13,
        lineHeight: 2,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        userSelect: isLoggedIn ? "text" : "none",
        cursor: isLoggedIn ? "text" : "default",
        padding: "2px 0",
      }}
    >
      {segments.map((seg, i) => {
        const isActive = seg.ann?.id === activeAnnotationId;

        if (seg.ann) {
          return (
            <span
              key={i}
              onClick={() => onAnnotationClick(seg.ann!)}
              title={seg.ann.meaning.slice(0, 80)}
              style={{
                borderBottom: `2px solid ${GOLD}`,
                background: isActive ? "rgba(200,150,10,0.18)" : "rgba(200,150,10,0.07)",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >{seg.text}</span>
          );
        }

        if (seg.cid) {
          return (
            <span
              key={i}
              title={seg.cid.meaning ? `CID: ${seg.cid.meaning}` : `CID match: ${seg.cid.term}`}
              style={{
                borderBottom: `2px solid ${TEAL}`,
                background: "rgba(0,184,200,0.09)",
                boxShadow: "0 0 5px rgba(0,184,200,0.25)",
                cursor: "help",
              }}
            >{seg.text}</span>
          );
        }

        return <span key={i}>{seg.text}</span>;
      })}
    </div>
  );
}
