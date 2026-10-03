import { describe, expect, it } from "vitest";
import { parseYouTubeUrl, youTubeEmbedUrl } from "@/lib/youtube";

describe("parseYouTubeUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", null],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=90", "dQw4w9WgXcQ", 90],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s", "dQw4w9WgXcQ", 90],
    ["https://youtu.be/dQw4w9WgXcQ?t=1h2m3s", "dQw4w9WgXcQ", 3723],
    ["youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ", null],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ", null],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ?start=42", "dQw4w9WgXcQ", 42],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ", null],
    ["  https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ  ", "dQw4w9WgXcQ", null],
  ])("parses %s", (url, id, start) => {
    expect(parseYouTubeUrl(url)).toEqual({ videoId: id, startSeconds: start });
  });

  it.each([
    "",
    "not a url",
    "https://vimeo.com/123456",
    "https://evil.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UCxyz",
    "javascript:alert(1)",
  ])("rejects %s", (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });
});

describe("youTubeEmbedUrl", () => {
  it("uses the privacy-enhanced domain and passes the start time", () => {
    const url = new URL(youTubeEmbedUrl("dQw4w9WgXcQ", 90));
    expect(url.hostname).toBe("www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/dQw4w9WgXcQ");
    expect(url.searchParams.get("start")).toBe("90");
  });
});
