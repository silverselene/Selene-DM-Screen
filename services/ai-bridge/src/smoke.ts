/**
 * Phase-1 smoke test. Runs one chat turn straight through runChatTurn() (no HTTP
 * layer) and prints the streamed events, so you can confirm the Agent SDK spins
 * up, authenticates on your subscription, and can reach ddb-mcp.
 *
 *   pnpm --filter @workspace/ai-bridge run smoke -- "your question"
 *
 * Defaults to a rules question that needs no D&D Beyond account data.
 */
import { runChatTurn } from "./agent";
import { resolveAuth } from "./auth";

async function main() {
  const message =
    process.argv.slice(2).join(" ").trim() ||
    "In D&D 5.5e (2024), how does the Grapple action work? Answer in two sentences.";

  console.error(`[smoke] billing: ${resolveAuth().note}`);
  console.error(`[smoke] prompt : ${message}\n`);

  for await (const ev of runChatTurn(message)) {
    switch (ev.type) {
      case "text":
        process.stdout.write(ev.text);
        break;
      case "tool":
        console.error(`\n[smoke] tool → ${ev.name}`);
        break;
      case "done":
        console.error(
          `\n\n[smoke] done (${ev.subtype})` +
            (ev.costUsd != null ? ` cost=$${ev.costUsd}` : "") +
            (ev.sessionId ? ` session=${ev.sessionId}` : ""),
        );
        break;
      case "error":
        console.error(`\n[smoke] ERROR: ${ev.message}`);
        process.exitCode = 1;
        break;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
