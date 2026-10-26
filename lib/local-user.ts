export type AnalysisEntry = {
  id: string;
  source: 'chesscom' | 'pgn' | 'play';
  white: string;
  black: string;
  result: string;
  played?: string;
  profile?: string;
  stored: boolean;
  ts: number;
};

export type ProfileEntry = { username: string; name?: string; ts: number };

const ANALYSIS_LIMIT = 12;
const PROFILE_LIMIT = 8;
const PGN_LIMIT = 3200;

export function canStorePgn(pgn: string): boolean {
  try {
    return encodeURIComponent(pgn).length <= PGN_LIMIT;
  } catch {
    return false;
  }
}

export function capNewest<T extends { ts: number }>(items: T[], limit: number): T[] {
  return [...items].sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export function upsertNewest<T extends { id: string; ts: number }>(items: T[], entry: T, limit: number): T[] {
  return capNewest([entry, ...items.filter((item) => item.id !== entry.id)], limit);
}

export function analysisId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const item = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${name}=`));
    return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

function readNamespacedJSON(name: string): unknown[] {
  try {
    const value = readCookie(name);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function listAnalyses(): AnalysisEntry[] {
  return readNamespacedJSON('arbiter:analyses').filter((entry): entry is AnalysisEntry => {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as Partial<AnalysisEntry>;
    return typeof candidate.id === 'string' && typeof candidate.white === 'string' &&
      typeof candidate.black === 'string' && typeof candidate.result === 'string' &&
      typeof candidate.ts === 'number' && typeof candidate.stored === 'boolean';
  });
}

export function rememberAnalyses(entry: AnalysisEntry): void {
  writeCookie('arbiter:analyses', JSON.stringify(upsertNewest(listAnalyses(), entry, ANALYSIS_LIMIT)));
}

export function rememberAnalysis(entry: Omit<AnalysisEntry, 'stored' | 'ts'> & { stored?: boolean; ts?: number }, pgn?: string): AnalysisEntry {
  const stored = Boolean(pgn && canStorePgn(pgn));
  const complete: AnalysisEntry = { ...entry, stored, ts: entry.ts ?? Date.now() };
  if (pgn && stored) writeCookie(`arbiter:g:${entry.id}`, pgn);
  rememberAnalyses(complete);
  return complete;
}

export function loadAnalysisPgn(id: string): string | null {
  return readCookie(`arbiter:g:${id}`);
}

export function listProfiles(): ProfileEntry[] {
  return readNamespacedJSON('arbiter:profiles').filter((entry): entry is ProfileEntry => {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as Partial<ProfileEntry>;
    return typeof candidate.username === 'string' && typeof candidate.ts === 'number';
  });
}

export function rememberProfile(username: string, name?: string): void {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return;
  const entry: ProfileEntry = { username: normalized, ...(name ? { name } : {}), ts: Date.now() };
  const profiles = [entry, ...listProfiles().filter((profile) => profile.username !== normalized)]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, PROFILE_LIMIT);
  writeCookie('arbiter:profiles', JSON.stringify(profiles));
}
