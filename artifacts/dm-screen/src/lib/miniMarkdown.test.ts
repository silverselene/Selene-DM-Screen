import { describe, it, expect } from "vitest";
import { parseMarkdownBlocks, tokenizeInline } from "./miniMarkdown";

describe("parseMarkdownBlocks", () => {
  it("parses headings by level", () => {
    expect(parseMarkdownBlocks("# Goblin")).toEqual([{ kind: "heading", level: 1, text: "Goblin" }]);
    expect(parseMarkdownBlocks("## Actions")).toEqual([{ kind: "heading", level: 2, text: "Actions" }]);
  });
  it("parses a level-3 heading", () => {
    expect(parseMarkdownBlocks("### Higher Levels")).toEqual([
      { kind: "heading", level: 3, text: "Higher Levels" },
    ]);
  });
  it("parses a horizontal rule", () => {
    expect(parseMarkdownBlocks("---")).toEqual([{ kind: "rule" }]);
  });
  it("groups consecutive - list items into one list block", () => {
    expect(parseMarkdownBlocks("- a\n- b")).toEqual([{ kind: "list", ordered: false, items: ["a", "b"] }]);
  });
  it("parses an ordered list with the ordered flag set", () => {
    expect(parseMarkdownBlocks("1. first\n2. second")).toEqual([
      { kind: "list", ordered: true, items: ["first", "second"] },
    ]);
  });
  it("splits a bullet run and an ordered run into separate blocks", () => {
    expect(parseMarkdownBlocks("- a\n1. b")).toEqual([
      { kind: "list", ordered: false, items: ["a"] },
      { kind: "list", ordered: true, items: ["b"] },
    ]);
  });
  it("treats other non-empty lines as paragraphs and drops blank lines", () => {
    expect(parseMarkdownBlocks("hello\n\nworld")).toEqual([
      { kind: "para", text: "hello" },
      { kind: "para", text: "world" },
    ]);
  });
  it("handles a mixed block", () => {
    expect(parseMarkdownBlocks("# T\n**AC** 15\n---\n## Actions\n- x")).toEqual([
      { kind: "heading", level: 1, text: "T" },
      { kind: "para", text: "**AC** 15" },
      { kind: "rule" },
      { kind: "heading", level: 2, text: "Actions" },
      { kind: "list", ordered: false, items: ["x"] },
    ]);
  });
  it("carries the start number when an ordered list does not begin at 1", () => {
    expect(parseMarkdownBlocks("3. foo\n4. bar")).toEqual([
      { kind: "list", ordered: true, start: 3, items: ["foo", "bar"] },
    ]);
  });
  it("omits start for a normal 1-based ordered list", () => {
    expect(parseMarkdownBlocks("1. foo")).toEqual([{ kind: "list", ordered: true, items: ["foo"] }]);
  });
  it("parses a fenced code block verbatim, ignoring the language and inner markup", () => {
    expect(parseMarkdownBlocks("```js\nconst x = 1; // - not a list\n```")).toEqual([
      { kind: "code", text: "const x = 1; // - not a list" },
    ]);
  });
  it("parses a pipe table into header and rows", () => {
    expect(parseMarkdownBlocks("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |")).toEqual([
      { kind: "table", header: ["A", "B"], rows: [["1", "2"], ["3", "4"]] },
    ]);
  });
  it("does not treat a plain --- rule as a headerless table", () => {
    expect(parseMarkdownBlocks("text\n---")).toEqual([
      { kind: "para", text: "text" },
      { kind: "rule" },
    ]);
  });
  it("groups consecutive > lines into one blockquote", () => {
    expect(parseMarkdownBlocks("> one\n> two")).toEqual([{ kind: "quote", text: "one\ntwo" }]);
  });
});

describe("tokenizeInline", () => {
  it("tokenizes inline code, bold and italic", () => {
    expect(tokenizeInline("run `pnpm dev` then **go** or *wait*")).toEqual([
      { kind: "text", text: "run " },
      { kind: "code", text: "pnpm dev" },
      { kind: "text", text: " then " },
      { kind: "bold", text: "go" },
      { kind: "text", text: " or " },
      { kind: "italic", text: "wait" },
    ]);
  });

  it("returns a single text token when there is no markup", () => {
    expect(tokenizeInline("plain")).toEqual([{ kind: "text", text: "plain" }]);
  });

  it("does not treat bare asterisks (multiplication) as italic", () => {
    expect(tokenizeInline("deal 2 * 1d6 and 3 * 2")).toEqual([
      { kind: "text", text: "deal 2 * 1d6 and 3 * 2" },
    ]);
  });

  it("tokenizes a safe link", () => {
    expect(tokenizeInline("see [docs](https://example.com/x)")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "docs", href: "https://example.com/x" },
    ]);
  });

  it("renders an unsafe-scheme link as inert literal text", () => {
    expect(tokenizeInline("[x](javascript:alert)")).toEqual([
      { kind: "text", text: "[x](javascript:alert)" },
    ]);
  });
});
