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
import { formatSmokeEvent } from "./smokeFormat";

async function main() {
  const message =
    process.argv.slice(2).join(" ").trim() ||
    "In D&D 5.5e (2024), how does the Grapple action work? Answer in two sentences.";

  console.error(`[smoke] billing: ${resolveAuth().note}`);
  console.error(`[smoke] prompt : ${message}\n`);

  for await (const ev of runChatTurn(message)) {
    for (const line of formatSmokeEvent(ev)) {
      // stdout = the streamed answer body (no trailing newline); stderr =
      // diagnostics (console.error appends one). A tool_error / error line marks
      // the run a failure so a broken ddb session exits non-zero.
      if (line.stream === "out") process.stdout.write(line.text);
      else console.error(line.text);
      if (line.failure) process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
