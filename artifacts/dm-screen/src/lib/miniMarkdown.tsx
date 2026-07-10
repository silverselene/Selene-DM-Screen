import { Fragment, type JSX } from "react";

// A tiny renderer for the markdown subset ddb-mcp emits in stat blocks
// (# / ## headings, **bold**, *italic*, --- rules, - lists). Deliberately NOT
// a full markdown parser and NOT a dependency — the app ships no markdown lib.
// Renders to JSX only (no HTML string, no dangerouslySetInnerHTML), so DDB
// user-authored text carries no injection risk.

export type MdBlock =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "rule" }
  | { kind: "list"; items: string[] }
  | { kind: "para"; text: string };

export function parseMarkdownBlocks(md: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let list: string[] | null = null;
  const flushList = () => {
    if (list) {
      blocks.push({ kind: "list", items: list });
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem) {
      (list ??= []).push(listItem[1]);
      continue;
    }
    flushList();
    if (line.trim() === "") continue;
    if (/^---+\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      continue;
    }
    const h = /^(#{1,2})\s+(.+)$/.exec(line);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length as 1 | 2, text: h[2].trim() });
      continue;
    }
    blocks.push({ kind: "para", text: line });
  }
  flushList();
  return blocks;
}

// Render inline **bold** and *italic* within one line to JSX spans.
function renderInline(text: string): JSX.Element {
  // Split on **...** or *...*, keeping the delimiters via capture groups.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return <strong key={i} className="font-semibold" style={{ color: "var(--dm-t1)" }}>{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith("*") && p.endsWith("*")) {
          return <em key={i}>{p.slice(1, -1)}</em>;
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export function MiniMarkdown({ text }: { text: string }): JSX.Element {
  const blocks = parseMarkdownBlocks(text);
  return (
    <div className="space-y-1 text-[11px] leading-relaxed" style={{ color: "var(--dm-t2)" }}>
      {blocks.map((b, i) => {
        if (b.kind === "heading") {
          return (
            <div key={i} className={b.level === 1 ? "text-xs font-bold" : "text-[11px] font-bold uppercase tracking-wider text-amber-300/80 mt-1.5"} style={b.level === 1 ? { color: "var(--dm-t1)" } : undefined}>
              {b.text}
            </div>
          );
        }
        if (b.kind === "rule") return <div key={i} className="border-t my-1" style={{ borderColor: "var(--dm-border)" }} />;
        if (b.kind === "list") {
          return (
            <ul key={i} className="list-disc pl-4 space-y-0.5">
              {b.items.map((it, j) => (<li key={j}>{renderInline(it)}</li>))}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-wrap break-words">{renderInline(b.text)}</p>;
      })}
    </div>
  );
}
