import { describe, it, expect } from "vitest";
import { parseMarkdownBlocks } from "./miniMarkdown";

describe("parseMarkdownBlocks", () => {
  it("parses headings by level", () => {
    expect(parseMarkdownBlocks("# Goblin")).toEqual([{ kind: "heading", level: 1, text: "Goblin" }]);
    expect(parseMarkdownBlocks("## Actions")).toEqual([{ kind: "heading", level: 2, text: "Actions" }]);
  });
  it("parses a horizontal rule", () => {
    expect(parseMarkdownBlocks("---")).toEqual([{ kind: "rule" }]);
  });
  it("groups consecutive - list items into one list block", () => {
    expect(parseMarkdownBlocks("- a\n- b")).toEqual([{ kind: "list", items: ["a", "b"] }]);
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
      { kind: "list", items: ["x"] },
    ]);
  });
});
