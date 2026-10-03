/** Parses a user-entered money string ("12.5", "$1,299.99") into integer cents. */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = input.replace(/[\s,$€£]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return NaN;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export function formatMoney(cents: number | null | undefined, currency = "USD"): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function formatMileage(value: number | null | undefined, unit: string = "mi"): string {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("en-US").format(value)} ${unit}`;
}

/** Parses "1h 30m", "1:30", "90" (minutes), "1.5h" into minutes. */
export function parseLaborMinutes(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = input.trim().toLowerCase();
  if (s === "") return null;
  if (/^\d+$/.test(s)) return Number(s);
  let m = s.match(/^(\d+):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?$/);
  if (m) return Math.round(Number(m[1]) * 60);
  m = s.match(/^(?:(\d+)\s*h(?:rs?|ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return NaN;
}

export function formatLabor(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Dates are calendar dates (no time zone); parse as UTC to avoid off-by-one.
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}

export function vehicleName(v: { year?: number | null; make: string; model: string; trim?: string | null }) {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}
