import type { SteamData } from "../types";
import { isSteamData } from "./steam";

const STORAGE_KEY = "achievement-atlas:data";

export function saveData(data: SteamData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded (very large libraries) — the app still works this session.
  }
}

export function loadData(): SteamData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSteamData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearData(): void {
  localStorage.removeItem(STORAGE_KEY);
}
