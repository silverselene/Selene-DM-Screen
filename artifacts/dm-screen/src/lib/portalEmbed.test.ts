import { describe, expect, it } from "vitest";
import { EMBED_HOSTS, toEmbedUrl } from "./portalEmbed";

describe("toEmbedUrl", () => {
  it("rejects non-https and unparseable input", () => {
    expect(toEmbedUrl("http://www.youtube.com/watch?v=abc")).toBeNull();
    expect(toEmbedUrl("not a url")).toBeNull();
    expect(toEmbedUrl("https://example.com/watch?v=abc")).toBeNull();
  });

  it("maps YouTube watch/short/live links to the nocookie embed host", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
    expect(toEmbedUrl("https://youtu.be/abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
    expect(toEmbedUrl("https://m.youtube.com/live/abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
  });

  // Regression: passthrough branches used to return the pasted URL verbatim,
  // whose host (youtube.com / m.youtube.com / bare youtube-nocookie.com) is
  // not in the Docker CSP's frame-src — a silent blank iframe in the container.
  it("canonicalizes /embed/ passthroughs onto www.youtube-nocookie.com", () => {
    expect(toEmbedUrl("https://youtube.com/embed/abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
    expect(toEmbedUrl("https://m.youtube.com/embed/abc123?start=30")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123?start=30",
    );
    expect(toEmbedUrl("https://youtube-nocookie.com/embed/abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
    expect(toEmbedUrl("https://www.youtube-nocookie.com/embed/abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
    expect(toEmbedUrl("https://www.youtube-nocookie.com/watch?v=abc123")).toBeNull();
  });

  it("maps Spotify share links (including intl-* locale prefixes) to /embed", () => {
    expect(toEmbedUrl("https://open.spotify.com/track/xyz")).toBe(
      "https://open.spotify.com/embed/track/xyz",
    );
    expect(toEmbedUrl("https://open.spotify.com/intl-fr/track/xyz")).toBe(
      "https://open.spotify.com/embed/track/xyz",
    );
    expect(toEmbedUrl("https://open.spotify.com/embed/track/xyz")).toBe(
      "https://open.spotify.com/embed/track/xyz",
    );
  });

  it("maps SoundCloud and Vimeo links to their player hosts", () => {
    expect(toEmbedUrl("https://soundcloud.com/artist/track")).toBe(
      `https://w.soundcloud.com/player/?url=${encodeURIComponent("https://soundcloud.com/artist/track")}&auto_play=false`,
    );
    expect(toEmbedUrl("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
    expect(toEmbedUrl("https://vimeo.com/not-an-id")).toBeNull();
    expect(toEmbedUrl("https://player.vimeo.com/video/12345")).toBe(
      "https://player.vimeo.com/video/12345",
    );
  });

  // The invariant the Docker deploy depends on: every URL this module can
  // return is served from a host in security-headers.conf's frame-src.
  it("only ever returns URLs on CSP-allowlisted embed hosts", () => {
    const inputs = [
      "https://www.youtube.com/watch?v=abc123",
      "https://youtube.com/embed/abc123",
      "https://m.youtube.com/embed/abc123",
      "https://m.youtube.com/live/abc123",
      "https://youtu.be/abc123",
      "https://youtube-nocookie.com/embed/abc123",
      "https://www.youtube-nocookie.com/embed/abc123",
      "https://open.spotify.com/track/xyz",
      "https://open.spotify.com/intl-de/album/xyz",
      "https://open.spotify.com/embed/playlist/xyz",
      "https://soundcloud.com/artist/track",
      "https://vimeo.com/12345",
      "https://player.vimeo.com/video/12345",
    ];
    for (const input of inputs) {
      const out = toEmbedUrl(input);
      expect(out, input).not.toBeNull();
      expect(EMBED_HOSTS, `${input} → ${out}`).toContain(new URL(out!).hostname);
    }
  });
});
