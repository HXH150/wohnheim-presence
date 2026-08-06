export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function daysBetween(from: string | Date, to: Date): number {
  const ms = to.getTime() - new Date(from).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Function-name-based path parsing: an Edge Function invoked at
// /functions/v1/<name>/<rest...> only sees its own name in the URL, so we
// split on "/" and take everything after the segment matching <name>.
export function pathAfter(req: Request, name: string): string[] {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf(name);
  return idx >= 0 ? parts.slice(idx + 1) : [];
}
