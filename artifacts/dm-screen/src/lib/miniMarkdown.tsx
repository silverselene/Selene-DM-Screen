import { Fragment, useMemo, type JSX } from "react";

// A tiny renderer for the markdown subset the AI chat emits — both ddb-mcp stat
// blocks (# / ## / ### headings, **bold**, *italic*, `code`, --- rules, - / 1.
// lists) and free-form assistant prose (fenced code blocks, > blockquotes,
// [links](…), and | pipe | tables). Deliberately NOT a full CommonMark parser
// and NOT a dependency — the app ships no markdown lib. Renders to JSX only (no
// HTML string, no dangerouslySetInnerHTML) and only ever emits http(s)/mailto/
// relative link hrefs, so DDB- or model-authored text carries no injection risk.

export type MdBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "rule" }
  | { kind: "list"; ordered: boolean; start?: number; items: string[] }
  | { kind: "code"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "para"; text: string };

// A GitHub-style table delimiter row (e.g. `|---|:--:|`). Requires a pipe so a
// plain `---` horizontal rule isn't mistaken for a headerless table.
function isTableDelimiter(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && t.includes("-") && /^[|\s:-]+$/.test(t);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseMarkdownBlocks(md: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let list: string[] | null = null;
  let listOrdered = false;
  let listStart = 1;
  const flushList = () => {
    if (list) {
      const block: MdBlock = { kind: "list", ordered: listOrdered, items: list };
      // Only carry a `start` when the source list didn't begin at 1, so bullet
      // and normal 1-based ordered lists keep the same shape.
      if (listOrdered && listStart !== 1) block.start = listStart;
      blocks.push(block);
      list = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // Fenced code block: ```lang … ``` — content is captured verbatim (leading
    // indentation preserved) and never parsed as headings/lists.
    if (/^\s*```/.test(line)) {
      flushList();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      // i now rests on the closing fence (or one past the end if unterminated).
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }

    const bullet = /^\s*-\s+(.*)$/.exec(line);
    const ordered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      const isOrdered = ordered !== null;
      const item = ordered ? ordered[2] : bullet![1];
      // A switch between bullet and numbered starts a new list block.
      if (list && listOrdered !== isOrdered) flushList();
      if (list === null && isOrdered) listStart = parseInt(ordered![1], 10);
      listOrdered = isOrdered;
      (list ??= []).push(item);
      continue;
    }
    flushList();

    if (line.trim() === "") continue;

    // Pipe table: a `| a | b |` header immediately followed by a `|---|---|`
    // delimiter row, then zero or more body rows.
    if (line.includes("|") && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
      const header = splitTableRow(line);
      const rows: string[][] = [];
      i++; // consume the delimiter row
      while (i + 1 < lines.length && lines[i + 1].includes("|") && lines[i + 1].trim() !== "") {
        i++;
        rows.push(splitTableRow(lines[i]));
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // Blockquote: one or more consecutive `> …` lines, joined with newlines.
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      const quoteLines = [quote[1]];
      while (i + 1 < lines.length) {
        const q = /^\s*>\s?(.*)$/.exec(lines[i + 1].trimEnd());
        if (!q) break;
        i++;
        quoteLines.push(q[1]);
      }
      blocks.push({ kind: "quote", text: quoteLines.join("\n") });
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, text: h[2].trim() });
      continue;
    }
    blocks.push({ kind: "para", text: line });
  }
  flushList();
  return blocks;
}

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

// Only link to schemes that can't execute script. A `[x](javascript:…)` or
// `data:` URL falls back to inert literal text.
function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(href.trim());
}

// The inline emphasis markers require a non-space character just inside the
// delimiters (`*foo*`, not `2 * 3`), so ordinary asterisks in prose — dice
// math, glob patterns — aren't mistaken for italics. `**bold**` is matched
// before `*italic*` (alternation order); links are matched first so their URL
// text isn't re-scanned; `` `code` `` is literal (no nested markup).
const INLINE_SPLIT =
  /(\[[^\]]+\]\([^)]+\)|\*\*[^*\s](?:[^*]*[^*\s])?\*\*|\*[^*\s](?:[^*]*[^*\s])?\*|`[^`]+`)/g;

export function tokenizeInline(text: string): InlineToken[] {
  return text
    .split(INLINE_SPLIT)
    .filter((p) => p !== "")
    .map((p): InlineToken => {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
      if (link && isSafeHref(link[2])) return { kind: "link", text: link[1], href: link[2].trim() };
      if (p.startsWith("**") && p.endsWith("**")) return { kind: "bold", text: p.slice(2, -2) };
      if (p.startsWith("`") && p.endsWith("`")) return { kind: "code", text: p.slice(1, -1) };
      if (p.startsWith("*") && p.endsWith("*")) return { kind: "italic", text: p.slice(1, -1) };
      return { kind: "text", text: p };
    });
}

// Render inline **bold**, *italic*, `code`, and [links](…) within one line.
function renderInline(text: string): JSX.Element {
  return (
    <>
      {tokenizeInline(text).map((t, i) => {
        if (t.kind === "bold") {
          return <strong key={i} className="font-semibold" style={{ color: "var(--dm-t1)" }}>{t.text}</strong>;
        }
        if (t.kind === "italic") return <em key={i}>{t.text}</em>;
        if (t.kind === "code") {
          return <code key={i} className="px-1 py-0.5 rounded bg-black/30 text-[0.95em]" style={{ color: "var(--dm-t1)" }}>{t.text}</code>;
        }
        if (t.kind === "link") {
          return (
            <a key={i} href={t.href} target="_blank" rel="noreferrer noopener" className="underline text-amber-300/90 hover:text-amber-200">
              {t.text}
            </a>
          );
        }
        return <Fragment key={i}>{t.text}</Fragment>;
      })}
    </>
  );
}

export function MiniMarkdown({ text, variant = "card" }: { text: string; variant?: "card" | "prose" }): JSX.Element {
  // Parse is memoized on `text` so a completed message doesn't re-parse on every
  // re-render (each streamed token re-renders the whole message list).
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);
  const wrapperClass =
    variant === "prose"
      ? "space-y-1.5 text-xs leading-relaxed break-words"
      : "space-y-1 text-[11px] leading-relaxed";
  return (
    <div className={wrapperClass} style={{ color: "var(--dm-t2)" }}>
      {blocks.map((b, i) => {
        if (b.kind === "heading") {
          if (b.level === 1) {
            return <div key={i} className="text-xs font-bold" style={{ color: "var(--dm-t1)" }}>{b.text}</div>;
          }
          if (b.level === 2) {
            return <div key={i} className="text-[11px] font-bold uppercase tracking-wider text-amber-300/80 mt-1.5">{b.text}</div>;
          }
          return <div key={i} className="text-[11px] font-semibold mt-1" style={{ color: "var(--dm-t1)" }}>{b.text}</div>;
        }
        if (b.kind === "rule") return <div key={i} className="border-t my-1" style={{ borderColor: "var(--dm-border)" }} />;
        if (b.kind === "code") {
          return (
            <pre key={i} className="overflow-x-auto rounded bg-black/30 px-2 py-1.5 text-[11px]" style={{ color: "var(--dm-t1)" }}>
              <code>{b.text}</code>
            </pre>
          );
        }
        if (b.kind === "quote") {
          return (
            <blockquote key={i} className="border-l-2 pl-2 italic whitespace-pre-wrap break-words" style={{ borderColor: "var(--dm-border)", color: "var(--dm-t3)" }}>
              {renderInline(b.text)}
            </blockquote>
          );
        }
        if (b.kind === "table") {
          return (
            <div key={i} className="overflow-x-auto">
              <table className="text-[11px] border-collapse">
                <thead>
                  <tr>
                    {b.header.map((h, j) => (
                      <th key={j} className="border px-1.5 py-0.5 text-left font-semibold" style={{ borderColor: "var(--dm-border)", color: "var(--dm-t1)" }}>
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k} className="border px-1.5 py-0.5 align-top" style={{ borderColor: "var(--dm-border)" }}>
                          {renderInline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.kind === "list") {
          const items = b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>);
          return b.ordered ? (
            <ol key={i} start={b.start} className="list-decimal pl-4 space-y-0.5">{items}</ol>
          ) : (
            <ul key={i} className="list-disc pl-4 space-y-0.5">{items}</ul>
          );
        }
        return <p key={i} className="whitespace-pre-wrap break-words">{renderInline(b.text)}</p>;
      })}
    </div>
  );
}
