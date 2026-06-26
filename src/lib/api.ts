// Single-endpoint API client for the Apps Script Web App backend.
//
// The backend (Google Apps Script in production, an Express adapter at
// `/api/gas` in Replit dev) speaks one "action protocol":
//   - reads:  GET  BASE?action=<a>&...&token=...
//   - writes: POST BASE  body = JSON string { action, token?, ... }
//             with Content-Type text/plain (NOT application/json)
// Using text/plain and keeping the auth token in the query/body (never an
// Authorization header) means the browser sends no CORS preflight, which an
// Apps Script Web App cannot answer. Every response is HTTP 200 with an
// envelope: { ok: true, data } | { ok: false, error, code? }.

export interface Package {
  kode_pickup: string;
  nama_penerima: string;
  alamat: string;
  kurir: string;
  status: string;
  notes: string;
}

export interface Pickup {
  timestamp: string;
  nama_driver: string;
  no_hp: string;
  kode_pickup: string;
  nama_penerima: string;
  alamat: string;
  kurir: string;
  status: string;
}

export interface PackageItem {
  kode_pickup: string;
  nama_penerima?: string;
  alamat?: string;
  kurir?: string;
}

export interface Stats {
  todayPickup: number;
  activeDrivers: number;
  totalPackages: number;
  pendingPackages: number;
}

export interface CreatePickupInput {
  kode_pickup: string;
  nama_driver: string;
  no_hp: string;
  nama_penerima?: string;
  alamat?: string;
  kurir?: string;
}

export interface ImportResult {
  added: number;
  skipped: number;
  message: string;
}

export interface ResetResult {
  deleted: number;
  message: string;
}

export interface VerifyPinResult {
  valid: boolean;
  token?: string;
}

export type Role = "admin" | "security";

// Mirrors the shape the pages rely on (`err.data?.error`, `err.status`).
export class ApiError extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly data: { error: string };
  constructor(status: number, error: string) {
    super(error);
    Object.setPrototypeOf(this, new.target.prototype);
    this.status = status;
    this.data = { error };
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

function resolveBase(): string {
  const env = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined;
  if (env && env.trim()) return env.trim().replace(/\/+$/, "");
  // Dev fallback: the Express adapter mounted at /api/gas (same origin).
  const base = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  return `${base}/api/gas`;
}

function absolute(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, window.location.origin).toString();
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  let env: Envelope<T>;
  try {
    env = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(502, "Respons server tidak valid.");
  }
  if (!env.ok) {
    // Map the envelope's error code to an HTTP-like status so the background
    // sync queue knows whether to retry: 5xx (and network errors) are retried,
    // 4xx (business/validation errors like a duplicate code) are permanent.
    let status = 400;
    if (env.code === "unauthorized") status = 401;
    else if (env.code === "server_error") status = 500;
    throw new ApiError(status, env.error || "Permintaan gagal.");
  }
  return env.data as T;
}

async function get<T>(
  action: string,
  params: Record<string, string | undefined> = {},
): Promise<T> {
  const u = new URL(absolute(resolveBase()));
  u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.searchParams.set(k, v);
  }
  const res = await fetch(u.toString(), { method: "GET", redirect: "follow" });
  return unwrap<T>(res);
}

async function post<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(resolveBase(), {
    method: "POST",
    redirect: "follow",
    // text/plain avoids a CORS preflight the Apps Script backend can't answer.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  return unwrap<T>(res);
}

// --- Offline cache (lets the driver autofill keep working without network) ---

const CACHE_PREFIX = "pickup_cache_";

function saveCache<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

function loadCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const api = {
  async listPackages(): Promise<Package[]> {
    try {
      const data = await get<Package[]>("packages");
      saveCache("packages", data);
      return data;
    } catch (err) {
      // Fall back to the last known list so drivers can still look up codes.
      const cached = loadCache<Package[]>("packages");
      if (cached) return cached;
      throw err;
    }
  },

  listPickups(todayOnly: boolean, token: string | null): Promise<Pickup[]> {
    return get<Pickup[]>("pickups", {
      todayOnly: todayOnly ? "true" : "false",
      token: token ?? undefined,
    });
  },

  getStats(token: string | null): Promise<Stats> {
    return get<Stats>("stats", { token: token ?? undefined });
  },

  createPickup(input: CreatePickupInput): Promise<Pickup> {
    return post<Pickup>("createPickup", { ...input });
  },

  importPackages(
    items: PackageItem[],
    token: string | null,
  ): Promise<ImportResult> {
    return post<ImportResult>("importPackages", { items, token });
  },

  resetPackages(token: string | null): Promise<ResetResult> {
    return post<ResetResult>("resetPackages", { token });
  },

  verifyPin(pin: string, role: Role): Promise<VerifyPinResult> {
    return post<VerifyPinResult>("verifyPin", { pin, role });
  },
};
