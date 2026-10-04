/** Only allow same-origin relative paths as post-login destinations (no open redirects). */
export function safeNextPath(next: unknown, fallback = "/vehicles"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
