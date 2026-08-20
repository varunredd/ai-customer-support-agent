const STORAGE_KEY = "jobform.support.session.v1";

export interface StoredSupportSession {
  sessionId: string;
  accessToken: string;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readStoredSupportSession(): StoredSupportSession | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.sessionId !== "string" || !record.sessionId.trim()) return null;
    if (typeof record.accessToken !== "string" || !record.accessToken.trim()) return null;
    return { sessionId: record.sessionId.trim(), accessToken: record.accessToken.trim() };
  } catch {
    return null;
  }
}

export function writeStoredSupportSession(value: StoredSupportSession) {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearStoredSupportSession() {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
