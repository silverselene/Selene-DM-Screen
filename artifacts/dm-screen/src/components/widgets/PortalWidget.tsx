import { useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { PORTAL_URL_MAX, validateNullableStringMax } from "@/lib/backup";
import { toEmbedUrl } from "@/lib/portalEmbed";
import { isImeComposing } from "@/lib/keyboard";
import { Link2, ExternalLink, Pencil, X } from "lucide-react";

// URL → iframe mapping lives in @/lib/portalEmbed (pure, unit-tested there —
// including the invariant that every returned URL uses a host from the Docker
// CSP's `frame-src` allowlist).

export function PortalWidget() {
  const [savedUrl, setSavedUrl] = useLocalStorage<string | null>(
    "dm-portal-url-v1",
    null,
    validateNullableStringMax(PORTAL_URL_MAX),
  );
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-derived from the saved raw URL on every render (not cached at save
  // time) so a future addition to the allowlist above starts working for
  // an already-saved link without the DM having to re-paste it.
  const embedUrl = useMemo(() => (savedUrl ? toEmbedUrl(savedUrl) : null), [savedUrl]);

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (trimmed.length > PORTAL_URL_MAX) {
      setError("That link is too long.");
      return;
    }
    if (!toEmbedUrl(trimmed)) {
      setError("Couldn't embed that link — supported: YouTube, Spotify, SoundCloud, Vimeo.");
      return;
    }
    setError(null);
    setSavedUrl(trimmed);
    setEditing(false);
    setDraft("");
  };

  const showForm = editing || !savedUrl;

  return (
    <div className="h-full min-h-0 flex flex-col gap-1.5">
      {showForm ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 p-2">
          <Link2 className="w-5 h-5 text-purple-500/70" />
          <div className="flex w-full max-w-xs gap-1.5">
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && !isImeComposing(e) && submit()}
              placeholder="Paste a YouTube, Spotify, SoundCloud, or Vimeo link…"
              maxLength={PORTAL_URL_MAX}
              className="flex-1 min-w-0 bg-gray-900/80 border border-purple-800/30 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/60"
              autoFocus
            />
            <button
              onClick={submit}
              className="px-2 py-1 text-xs rounded bg-purple-800/40 border border-purple-700/50 text-purple-200 hover:bg-purple-700/50 transition-colors shrink-0"
            >
              Load
            </button>
          </div>
          {error && <div className="text-xs text-red-400 text-center max-w-xs">{error}</div>}
          {savedUrl && (
            <button
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between shrink-0 gap-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
              <Link2 className="w-3 h-3 text-purple-400 shrink-0" />
              <span className="truncate">{savedUrl}</span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <a
                href={savedUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                title="Open in new tab"
                className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-purple-400 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => {
                  setDraft(savedUrl ?? "");
                  setEditing(true);
                }}
                title="Change link"
                className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-purple-400 transition-colors"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={() => setSavedUrl(null)}
                title="Remove link"
                className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 rounded overflow-hidden border border-purple-800/30 bg-black/40">
            {embedUrl ? (
              <iframe
                key={embedUrl}
                src={embedUrl}
                title="Portal embed"
                className="w-full h-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-red-400 text-center px-4">
                This link is no longer supported. Click the pencil to change it.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
