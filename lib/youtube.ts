export interface YouTubeRef {
  videoId: string;
  startSeconds: number | null;
}

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

/** Parses "1h2m3s", "90s", "90" into seconds. */
function parseStart(raw: string | null): number | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || m[0] === "") return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * Extracts the video id (and optional start time) from any common YouTube URL:
 * watch?v=, youtu.be/, /shorts/, /embed/, /live/, with or without the scheme.
 * Returns null for anything that isn't a YouTube video link.
 */
export function parseYouTubeUrl(input: string): YouTubeRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  let id: string | null = null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname.toLowerCase() === "youtu.be") {
    id = parts[0] ?? null;
  } else if (parts[0] === "watch") {
    id = url.searchParams.get("v");
  } else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) {
    id = parts[1] ?? null;
  }
  if (!id || !ID.test(id)) return null;

  return { videoId: id, startSeconds: parseStart(url.searchParams.get("t") ?? url.searchParams.get("start")) };
}

/** Privacy-enhanced embed URL (no tracking cookies until the user presses play). */
export function youTubeEmbedUrl(videoId: string, startSeconds?: number | null): string {
  const params = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
  if (startSeconds) params.set("start", String(startSeconds));
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}
