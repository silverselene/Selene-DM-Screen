import { existsSync } from "node:fs";
import { config } from "./config";
import { ALLOWED_TOOL_IDS } from "./ddbTools";
import { resolveAuth, setupHint, BridgeAuthError } from "./auth";
import { startServer } from "./server";

async function main() {
  let auth;
  try {
    auth = resolveAuth();
  } catch (err) {
    if (err instanceof BridgeAuthError) {
      console.error(`\n✗ ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  await startServer();

  console.log("Selene AI bridge");
  console.log(`  listening   http://${config.host}:${config.port}`);
  console.log(`  billing     ${auth.note}`);
  console.log(`  ddb-mcp     ${config.ddbMcpEntry ?? "(not resolved)"}`);
  if (!config.ddbMcpEntry || !existsSync(config.ddbMcpEntry)) {
    console.warn(
      `  ⚠ ddb-mcp not resolved — run \`pnpm install\`, or set DDB_MCP_ENTRY to a ` +
        `local clone's dist/index.js. General rules Q&A still works; D&D Beyond ` +
        `lookups are unavailable until this resolves.`,
    );
  }
  console.log(`  ddb tools   ${ALLOWED_TOOL_IDS.length} read-only (all others denied)`);
  const hint = setupHint(auth);
  if (hint) console.log(`  note        ${hint}`);
  console.log("\n  GET  /health   POST /chat  { \"message\": \"...\" }  (SSE)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
