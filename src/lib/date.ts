export type Expiry = { month: number; year: number };

// Accepts formats like MM/YY, MM/YYYY, YY/MM; returns MM/YY
export function normalizeExpiry(input: string): string | null {
  const v = (input || '').trim();
  if (!v) return null;
  const m = v.match(/(\d{1,2})\s*\/?\s*(\d{2,4})/);
  if (!m) return null;
  let month = parseInt(m[1], 10);
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, '0');
  return `${mm}/${String(year).slice(-2)}`;
}

export function parseExpiry(expiry: string): Expiry | null {
  const n = normalizeExpiry(expiry);
  if (!n) return null;
  const [mm, yy] = n.split('/');
  return { month: parseInt(mm, 10), year: 2000 + parseInt(yy, 10) };
}

export function isExpiryAtLeast(expiry: string, min: Expiry): boolean {
  const e = parseExpiry(expiry);
  if (!e) return false;
  if (e.year > min.year) return true;
  if (e.year < min.year) return false;
  return e.month >= min.month;
}


