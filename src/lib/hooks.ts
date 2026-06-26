// TanStack Query hooks over the action-protocol client. The signatures mirror
// the previous Orval-generated hooks so the page components need only swap their
// import source.
import {
  useQuery,
  useMutation,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  api,
  ApiError,
  type Package,
  type Pickup,
  type Stats,
  type PackageItem,
  type ImportResult,
  type ResetResult,
  type VerifyPinResult,
  type Role,
} from "./api";
import { getToken } from "./use-role";

type QueryOpts<T> = {
  query?: Partial<UseQueryOptions<T, ApiError, T>>;
};

// --- Packages -------------------------------------------------------------

export function getListPackagesQueryKey(params?: { q?: string }) {
  return ["packages", params?.q ?? ""] as const;
}

export function useListPackages(
  params?: { q?: string },
  options?: QueryOpts<Package[]>,
) {
  const q = (params?.q ?? "").trim().toLowerCase();
  return useQuery<Package[], ApiError>({
    queryKey: getListPackagesQueryKey(params),
    queryFn: async () => {
      const all = await api.listPackages();
      return q ? all.filter((p) => p.kode_pickup.toLowerCase().includes(q)) : all;
    },
    ...(options?.query as object),
  });
}

// --- Pickups --------------------------------------------------------------

export function getListPickupsQueryKey(params?: { todayOnly?: boolean }) {
  return ["pickups", params?.todayOnly ?? false] as const;
}

export function useListPickups(
  params?: { todayOnly?: boolean },
  options?: QueryOpts<Pickup[]>,
) {
  return useQuery<Pickup[], ApiError>({
    queryKey: getListPickupsQueryKey(params),
    queryFn: () => api.listPickups(params?.todayOnly ?? false, getToken()),
    ...(options?.query as object),
  });
}

// --- Stats ----------------------------------------------------------------

export function getGetStatsQueryKey() {
  return ["stats"] as const;
}

export function useGetStats(options?: QueryOpts<Stats>) {
  return useQuery<Stats, ApiError>({
    queryKey: getGetStatsQueryKey(),
    queryFn: () => api.getStats(getToken()),
    ...(options?.query as object),
  });
}

// --- Mutations ------------------------------------------------------------

export function useImportPackages() {
  return useMutation<ImportResult, ApiError, { data: { items: PackageItem[] } }>({
    mutationFn: (vars) => api.importPackages(vars.data.items, getToken()),
  });
}

export function useResetPackages() {
  return useMutation<ResetResult, ApiError, void>({
    mutationFn: () => api.resetPackages(getToken()),
  });
}

export function useVerifyPin() {
  return useMutation<
    VerifyPinResult,
    ApiError,
    { data: { pin: string; role: Role } }
  >({
    mutationFn: (vars) => api.verifyPin(vars.data.pin, vars.data.role),
  });
}
