import { useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { PORTAL_URL_MAX, validateNullableStringMax } from "@/lib/backup";
import { Link2, ExternalLink, Pencil, X } from "lucide-react";

// Providers curated to match the `frame-src` allowlist in
// docker/security-headers.conf — keep the two in sync. Deliberately NOT a
// generic `frame-src https:` + pass-through-any-URL: that would let the
// Portal iframe an arbitrary origin (most sites also send
// X-Frame-Options/frame-ancestors that refuse to be framed anyway, so a
// generic allowlist would mostly just fail silently). Add a provider here
// AND to the nginx CSP together.
function toEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (url.pathname.startsWith("/embed/")) return url.toString();
    if (url.pathname.startsWith("/live/")) {
      const id = url.pathname.split("/")[2];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    return null;
  }
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtube-nocookie.com") {
    return url.pathname.startsWith("/embed/") ? url.toString() : null;
  }
  if (host === "open.spotify.com") {
    return url.pathname.startsWith("/embed/")
      ? url.toString()
      : `https://open.spotify.com/embed${url.pathname}`;
  }
  if (host === "soundcloud.com") {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&auto_play=false`;
  }
  if (host === "vimeo.com") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com") return url.toString();

  return null;
}

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
              onKeyDown={(e) => e.key === "Enter" && submit()}
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
