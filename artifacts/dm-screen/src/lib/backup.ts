// Full-snapshot backup/restore. Operates on every localStorage key that
// matches the `dm-` prefix — so any state we add later (new widgets,
// versioned key bumps) is included automatically without updating this
// module.
//
// Restore replaces all existing `dm-*` keys with the imported set, then
// reloads the page. Reload is the simplest way to get every widget to
// pick up its new state, because most of them only read localStorage in
// their `useLocalStorage` initializer.

const KEY_PREFIX = "dm-";

interface FullBackupEnvelope {
  schema: "selene-dm-full";
  version: 1;
  exportedAt: string;
  /** Snapshot of every key that matched KEY_PREFIX. Values are stored as
   *  the raw localStorage strings (always JSON-serialized in this app), so
   *  the export is a string→string map. */
  keys: Record<string, string>;
}

function readAllDmKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith(KEY_PREFIX)) continue;
    const v = window.localStorage.getItem(k);
    if (v != null) out[k] = v;
  }
  return out;
}

export function exportFullBackupAsJson(): string {
  const env: FullBackupEnvelope = {
    schema: "selene-dm-full",
    version: 1,
    exportedAt: new Date().toISOString(),
    keys: readAllDmKeys(),
  };
  return JSON.stringify(env, null, 2);
}

/** Replace every `dm-*` key with the imported set, then reload. Returns
 *  the number of keys written. Throws on a malformed file. */
export function importFullBackupFromJson(text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("File isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("File isn't a full backup.");
  }
  const env = parsed as Partial<FullBackupEnvelope>;
  if (env.schema !== "selene-dm-full") {
    throw new Error(
      `Unexpected schema "${env.schema ?? "?"}" — looking for "selene-dm-full".`,
    );
  }
  if (!env.keys || typeof env.keys !== "object") {
    throw new Error("Envelope is missing a `keys` map.");
  }
  // Wipe existing dm-* keys so the restored set is exactly what's in the
  // file — no stale leftovers from before the backup.
  const existing: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(KEY_PREFIX)) existing.push(k);
  }
  for (const k of existing) window.localStorage.removeItem(k);
  // Write the imported set.
  let count = 0;
  for (const [k, v] of Object.entries(env.keys)) {
    if (typeof k !== "string" || !k.startsWith(KEY_PREFIX)) continue;
    if (typeof v !== "string") continue;
    window.localStorage.setItem(k, v);
    count++;
  }
  return count;
}

// ── DOM helpers used by both export buttons ───────────────────────────────

export function downloadJsonFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so the click has time to fire in all browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open a native file picker and resolve with the text contents. */
export function promptForJsonFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("No file selected."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Read failed."));
      reader.readAsText(file);
    };
    input.click();
  });
}
