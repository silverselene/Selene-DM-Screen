// "Import from D&D Beyond" panel for the Party widget. Takes a character
// link / id, tries a direct fetch, and — when the browser can't reach
// D&D Beyond (CORS, offline, private character) — falls back to pasting or
// uploading the character JSON. Either way the result is handed to the
// widget, which prefills its editable form for review instead of saving.

import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileUp, Loader2, X } from "lucide-react";

import {
  DdbFetchError,
  ddbCharacterJsonUrl,
  fetchDdbCharacter,
  parseDdbCharacterId,
  parseDdbCharacterJson,
  type DdbImportResult,
} from "@/lib/ddbImport";
import { promptForJsonFile } from "@/lib/backup";
import { isImeComposing } from "@/lib/keyboard";

const FETCH_TIMEOUT_MS = 15_000;

const INPUT_CLS =
  "w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sky-500";

export function DdbImportPanel({
  onImported,
  onCancel,
}: {
  onImported: (result: DdbImportResult) => void;
  onCancel: () => void;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Abort an in-flight fetch if the panel closes mid-request.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const id = parseDdbCharacterId(link);
  const jsonUrl = id ? ddbCharacterJsonUrl(id) : null;

  const fetchCharacter = async () => {
    if (busy) return;
    if (!id) {
      setError("Paste a D&D Beyond character link (…/characters/12345678) or its numeric ID.");
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    setBusy(true);
    setError(null);
    try {
      const result = await fetchDdbCharacter(id, { signal: ctrl.signal });
      if (abortRef.current !== ctrl) return;
      onImported(result);
    } catch (e) {
      if (abortRef.current !== ctrl) return; // panel closed / superseded
      const err = e as Error;
      if (err.name === "AbortError") {
        setError("D&D Beyond took too long to answer.");
      } else {
        setError(err.message);
      }
      // Every fetch failure except "not a character" can be worked around
      // by pasting the JSON, so open that path straight away.
      if (err.name === "AbortError" || e instanceof DdbFetchError) setShowPaste(true);
    } finally {
      clearTimeout(timer);
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  const importPasted = (text: string) => {
    try {
      onImported(parseDdbCharacterJson(text));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const loadFile = async () => {
    let text: string;
    try {
      text = await promptForJsonFile();
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
      setError(`Couldn't read the file: ${(e as Error).message}`);
      return;
    }
    importPasted(text);
  };

  return (
    <div className="mb-2 p-2 bg-gray-900/80 border border-sky-700/40 rounded min-h-0 overflow-y-auto space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-400">Import from D&amp;D Beyond</p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close D&D Beyond import"
          className="text-gray-600 hover:text-gray-400"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-1">
        <input
          autoFocus
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isImeComposing(e)) void fetchCharacter();
          }}
          placeholder="Character link or ID"
          aria-label="D&D Beyond character link or ID"
          className={INPUT_CLS}
        />
        <button
          type="button"
          onClick={() => void fetchCharacter()}
          disabled={busy || !link.trim()}
          className="shrink-0 flex items-center gap-1 px-2 py-1 bg-sky-700 hover:bg-sky-600 disabled:opacity-40 rounded text-sm text-white font-semibold transition-colors"
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          Fetch
        </button>
      </div>
      <p className="text-[12px] text-gray-500">
        The character's privacy must be set to <span className="text-gray-400">Public</span> on D&amp;D Beyond.
      </p>

      {error && (
        <div role="alert" className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1">
          {error}
        </div>
      )}

      {!showPaste ? (
        <button
          type="button"
          onClick={() => setShowPaste(true)}
          className="text-[12px] text-sky-500 hover:text-sky-300 underline-offset-2 hover:underline"
        >
          Paste the character JSON instead
        </button>
      ) : (
        <div className="space-y-1 pt-1 border-t border-gray-800">
          <p className="text-[12px] text-gray-400">
            {jsonUrl ? (
              <>
                Open{" "}
                <a
                  href={jsonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-0.5"
                >
                  the character JSON<ExternalLink className="w-3 h-3" />
                </a>
                , select all, copy, and paste it here — or save it and load the file.
              </>
            ) : (
              <>
                Open <code className="text-gray-300">character-service.dndbeyond.com/character/v5/character/&lt;id&gt;</code>,
                select all, copy, and paste it here — or save it and load the file.
              </>
            )}
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder='{"id": …, "success": true, "data": { … } }'
            aria-label="D&D Beyond character JSON"
            rows={3}
            className={`${INPUT_CLS} font-mono text-[12px] resize-y`}
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => importPasted(pasteText)}
              disabled={!pasteText.trim()}
              className="flex-1 py-1 bg-sky-700 hover:bg-sky-600 disabled:opacity-40 rounded text-sm text-white font-semibold transition-colors"
            >
              Use pasted JSON
            </button>
            <button
              type="button"
              onClick={() => void loadFile()}
              className="flex items-center gap-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-300 transition-colors"
            >
              <FileUp className="w-3 h-3" />File…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
