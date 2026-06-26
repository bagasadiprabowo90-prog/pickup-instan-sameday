// Local-first pickup queue with background sync.
//
// When a driver confirms a pickup we persist it to localStorage and report
// success immediately — the warehouse handover should never block on the
// network. A background loop then syncs each queued pickup to the backend,
// retrying transient/network failures and surfacing business errors (e.g. a
// code already picked up) so the operator can react.
import { useSyncExternalStore, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type CreatePickupInput } from "./api";
import {
  getListPickupsQueryKey,
  getGetStatsQueryKey,
  getListPackagesQueryKey,
} from "./hooks";

export type QueueStatus = "pending" | "syncing" | "synced" | "error";

export interface QueueItem {
  id: string;
  payload: CreatePickupInput;
  status: QueueStatus;
  error?: string;
  attempts: number;
  createdAt: number;
}

const KEY = "pickup_sync_queue";
const RETRY_MS = 15000;

let items: QueueItem[] = load();
const listeners = new Set<() => void>();
let onSynced: (() => void) | null = null;
let started = false;
let flushing = false;
let timer: ReturnType<typeof setInterval> | null = null;

function load(): QueueItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function emit(): void {
  persist();
  listeners.forEach((l) => l());
}

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function update(id: string, patch: Partial<QueueItem>): void {
  items = items.map((it) => (it.id === id ? { ...it, ...patch } : it));
}

export function enqueue(payload: CreatePickupInput): string {
  const id = newId();
  items = [
    ...items,
    { id, payload, status: "pending", attempts: 0, createdAt: Date.now() },
  ];
  emit();
  void flush();
  return id;
}

export function retry(id: string): void {
  update(id, { status: "pending", error: undefined });
  emit();
  void flush();
}

export function dismiss(id: string): void {
  items = items.filter((it) => it.id !== id);
  emit();
}

async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  flushing = true;
  let synced = false;
  try {
    for (const it of items) {
      if (it.status !== "pending") continue;
      update(it.id, { status: "syncing", attempts: it.attempts + 1 });
      emit();
      try {
        await api.createPickup(it.payload);
        update(it.id, { status: "synced" });
        synced = true;
        emit();
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          // Business error (duplicate / invalid). Retrying won't help.
          update(it.id, { status: "error", error: err.data.error });
          emit();
        } else {
          // Network / server hiccup — leave pending and try again later.
          update(it.id, {
            status: "pending",
            error: err instanceof Error ? err.message : "Gagal terhubung",
          });
          emit();
          break;
        }
      }
    }
    // Drop synced items shortly after so the UI can show the "synced" state.
    if (items.some((it) => it.status === "synced")) {
      setTimeout(() => {
        items = items.filter((it) => it.status !== "synced");
        emit();
      }, 4000);
    }
  } finally {
    flushing = false;
    if (synced && onSynced) onSynced();
  }
}

function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void flush());
  timer = setInterval(() => {
    if (items.some((it) => it.status === "pending")) void flush();
  }, RETRY_MS);
  void flush();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function snapshot(): QueueItem[] {
  return items;
}

const EMPTY: QueueItem[] = [];

export function usePickupQueue() {
  const queryClient = useQueryClient();
  const all = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

  useEffect(() => {
    onSynced = () => {
      queryClient.invalidateQueries({ queryKey: getListPickupsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
    };
    start();
    return () => {
      onSynced = null;
    };
  }, [queryClient]);

  const pending = all.filter(
    (it) => it.status === "pending" || it.status === "syncing",
  ).length;
  const errors = all.filter((it) => it.status === "error").length;

  return { items: all, pending, errors, enqueue, retry, dismiss };
}

export function useQueueItem(id: string | null): QueueItem | null {
  const all = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  if (!id) return null;
  return all.find((it) => it.id === id) ?? null;
}

// Stop the timer on hot-reload teardown to avoid duplicate intervals in dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (timer) clearInterval(timer);
    started = false;
  });
}
