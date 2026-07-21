// URL → embeddable iframe URL for the Portal widget. Pure module (no React)
// so the mapping is unit-testable beside the other src/lib validators.
//
// Providers are curated to match the `frame-src` allowlist in
// docker/security-headers.conf — keep the two in sync. Deliberately NOT a
// generic `frame-src https:` + pass-through-any-URL: that would let the
// Portal iframe an arbitrary origin (most sites also send
// X-Frame-Options/frame-ancestors that refuse to be framed anyway, so a
// generic allowlist would mostly just fail silently). Add a provider here
// AND to the nginx CSP together.
//
// Every branch REBUILDS the URL on one of the exact hosts in `frame-src`
// rather than passing the input through verbatim. Host aliases the user can
// paste (`youtube.com`, `m.youtube.com`, bare `youtube-nocookie.com`) are
// valid URLs that play fine in dev — where no CSP is sent — but the Docker
// deploy's CSP lists only the canonical hosts, so a verbatim passthrough
// renders a silent blank iframe in the container.

/** The exact hosts listed in security-headers.conf `frame-src`. Every URL this
 *  module returns uses one of them (asserted by portalEmbed.test.ts). */
export const EMBED_HOSTS = [
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "open.spotify.com",
  "w.soundcloud.com",
  "player.vimeo.com",
] as const;

/** The saved Portal URL is only safe to expose as an external anchor href when
 *  it's an http(s) URL. The read/backup validator for dm-portal-url-v1 is
 *  length-only, so a restored or hand-edited backup could plant a
 *  `javascript:`/`data:` value; this gate keeps a hostile scheme out of the
 *  "Open in new tab" href. Returns the url when safe, else undefined. */
export function toExternalHref(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

export function toEmbedUrl(raw: string): string | null {
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
    // Canonicalize onto the nocookie host (keeping ?start= etc.) — the
    // pasted host may be youtube.com or m.youtube.com, neither in frame-src.
    if (url.pathname.startsWith("/embed/")) {
      return `https://www.youtube-nocookie.com${url.pathname}${url.search}`;
    }
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
    // Rebuild instead of passthrough: the pasted host may lack the `www.`
    // that frame-src requires.
    return url.pathname.startsWith("/embed/")
      ? `https://www.youtube-nocookie.com${url.pathname}${url.search}`
      : null;
  }
  if (host === "open.spotify.com") {
    // Locale-prefixed share links (`/intl-fr/track/…`) aren't valid embed
    // paths — strip the segment before prefixing `/embed`.
    const path = url.pathname.replace(/^\/intl-[^/]+/, "");
    return path.startsWith("/embed/")
      ? `https://open.spotify.com${path}${url.search}`
      : `https://open.spotify.com/embed${path}`;
  }
  if (host === "soundcloud.com") {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&auto_play=false`;
  }
  if (host === "vimeo.com") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com") {
    return `https://player.vimeo.com${url.pathname}${url.search}`;
  }

  return null;
}
