import { useSyncExternalStore } from "react";

export type Role = "admin" | "security" | null;
export type RequiredRole = "admin" | "security";

// The signed role token issued by the server after a valid PIN. It is the single
// source of truth: the role is decoded from the token's (unsigned) payload for UI
// purposes, while the server verifies the signature on every protected request.
// A forged sessionStorage value therefore can't unlock anything real.
const KEY = "pickup_token";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem(KEY, token);
  else window.sessionStorage.removeItem(KEY);
  emit();
}

function decodeRole(token: string | null): Role {
  if (!token) return null;
  const b64 = token.split(".")[0];
  if (!b64) return null;
  try {
    const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
    const payload = atob(padded);
    const role = payload.split(".")[0];
    return role === "admin" || role === "security" ? role : null;
  } catch {
    return null;
  }
}

export function getRole(): Role {
  return decodeRole(getToken());
}

export function useRole(): Role {
  return useSyncExternalStore(subscribe, getRole, () => null);
}

// Clear the session (logout / on 401).
export function clearRole() {
  setToken(null);
}

// Admin can access everything; security can only access the security view.
export function hasAccess(role: Role, required: RequiredRole): boolean {
  if (role === "admin") return true;
  return role === required;
}
