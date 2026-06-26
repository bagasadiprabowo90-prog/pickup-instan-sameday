import { useMemo, useRef, useState, useEffect } from "react";
import {
  Shield,
  Activity,
  Users,
  PackageCheck,
  History,
  Clock,
  MapPin,
  Truck as TruckIcon,
  User,
  Phone,
} from "lucide-react";
import {
  useListPickups,
  getListPickupsQueryKey,
  useGetStats,
  getGetStatsQueryKey,
  useListPackages,
  getListPackagesQueryKey,
} from "@/lib/hooks";
import type { Pickup, Package as Pkg } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { PinGate } from "@/components/pin-gate";

type View = "today" | "drivers" | "pending" | "total";

const DONE_STATUS = "sudah diambil";

function jakartaDay(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function StatCard({
  active,
  onClick,
  icon,
  label,
  value,
  loading,
  accent,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
  accent: string;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`text-left rounded-2xl border p-4 sm:p-5 transition-all active:scale-[0.98] ${
        active
          ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
          : "border-border bg-white dark:bg-card hover:border-primary/40 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent}`}>
          {icon}
        </div>
        {active && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Dipilih
          </span>
        )}
      </div>
      <p className="text-xs sm:text-sm font-medium text-muted-foreground mt-3">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-14 mt-1" />
      ) : (
        <h3 className="text-2xl sm:text-3xl font-bold mt-0.5">{value}</h3>
      )}
    </button>
  );
}

function DashboardContent() {
  const [view, setView] = useState<View>("today");

  const { data: stats, isLoading: isStatsLoading } = useGetStats({
    query: {
      queryKey: getGetStatsQueryKey(),
      refetchInterval: 10000,
    },
  });

  const { data: allPickups, isLoading: isPickupsLoading } = useListPickups(
    { todayOnly: false },
    {
      query: {
        queryKey: getListPickupsQueryKey({ todayOnly: false }),
        refetchInterval: 10000,
      },
    },
  );

  const { data: packages, isLoading: isPackagesLoading } = useListPackages(
    {},
    {
      query: {
        queryKey: getListPackagesQueryKey({}),
        refetchInterval: 15000,
      },
    },
  );

  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    [],
  );

  const todayPickups = useMemo(
    () => (allPickups ?? []).filter((p) => jakartaDay(p.timestamp) === today),
    [allPickups, today],
  );

  // Drivers active today, with their pickup counts and latest activity.
  const drivers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; count: number; last: string }>();
    for (const p of todayPickups) {
      const key = p.nama_driver.toLowerCase();
      const ex = map.get(key);
      if (ex) {
        ex.count += 1;
        if (p.timestamp > ex.last) ex.last = p.timestamp;
      } else {
        map.set(key, { name: p.nama_driver, phone: p.no_hp ?? "", count: 1, last: p.timestamp });
      }
    }
    return [...map.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
  }, [todayPickups]);

  // Packages still waiting (not yet picked up).
  const pendingPackages = useMemo(() => {
    const picked = new Set((allPickups ?? []).map((p) => p.kode_pickup.toLowerCase()));
    return (packages ?? []).filter(
      (p) =>
        p.status.toLowerCase() !== DONE_STATUS && !picked.has(p.kode_pickup.toLowerCase()),
    );
  }, [packages, allPickups]);

  // Live notification: toast when a new pickup arrives during polling.
  const lastTopRef = useRef<string | null>(null);
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    const top = todayPickups[0];
    if (!top) return undefined;
    if (lastTopRef.current === null) {
      lastTopRef.current = top.timestamp;
      return undefined;
    }
    if (top.timestamp === lastTopRef.current) return undefined;

    const prevTop = lastTopRef.current;
    const fresh = todayPickups.filter((p) => p.timestamp > prevTop);
    const keys = new Set(fresh.map((p) => p.kode_pickup + p.timestamp));
    fresh.forEach((p) =>
      toast.success(`Pickup baru: ${p.nama_driver}`, {
        description: `Paket ${p.kode_pickup} berhasil diserahkan`,
        duration: 7000,
      }),
    );
    lastTopRef.current = top.timestamp;
    setFreshKeys(keys);
    const t = setTimeout(() => setFreshKeys(new Set()), 10000);
    return () => clearTimeout(t);
  }, [todayPickups]);

  const detailLoading =
    view === "pending" || view === "total"
      ? isPackagesLoading || isPickupsLoading
      : isPickupsLoading;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 p-4 sm:p-6 md:p-10 max-w-5xl mx-auto w-full space-y-6 pb-24"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <Shield className="w-7 h-7 text-primary" />
            Security Log
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Pantau serah terima paket. Ketuk kartu untuk lihat detail.
          </p>
        </div>
        <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2 shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          Live
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          testId="stat-today"
          active={view === "today"}
          onClick={() => setView("today")}
          icon={<PackageCheck className="w-5 h-5 text-primary" />}
          accent="bg-primary/10"
          label="Pickup Hari Ini"
          value={stats?.todayPickup ?? 0}
          loading={isStatsLoading}
        />
        <StatCard
          testId="stat-drivers"
          active={view === "drivers"}
          onClick={() => setView("drivers")}
          icon={<Users className="w-5 h-5 text-blue-600" />}
          accent="bg-blue-500/10"
          label="Driver Aktif"
          value={stats?.activeDrivers ?? 0}
          loading={isStatsLoading}
        />
        <StatCard
          testId="stat-pending"
          active={view === "pending"}
          onClick={() => setView("pending")}
          icon={<Activity className="w-5 h-5 text-orange-600" />}
          accent="bg-orange-500/10"
          label="Sisa Antrean"
          value={stats?.pendingPackages ?? 0}
          loading={isStatsLoading}
        />
        <StatCard
          testId="stat-total"
          active={view === "total"}
          onClick={() => setView("total")}
          icon={<History className="w-5 h-5 text-slate-600" />}
          accent="bg-slate-500/10"
          label="Total Keseluruhan"
          value={stats?.totalPackages ?? 0}
          loading={isStatsLoading}
        />
      </div>

      <Card className="shadow-sm border-border overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-muted/30">
          <h2 className="font-semibold">
            {view === "today" && "Serah Terima Hari Ini"}
            {view === "drivers" && "Driver Aktif Hari Ini"}
            {view === "pending" && "Paket Menunggu Diambil"}
            {view === "total" && "Semua Paket"}
          </h2>
        </div>

        <div className="p-3 sm:p-4">
          {detailLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-2.5"
              >
                {view === "today" && (
                  <PickupList items={todayPickups} freshKeys={freshKeys} emptyText="Belum ada serah terima hari ini." />
                )}
                {view === "drivers" && <DriverList drivers={drivers} />}
                {view === "pending" && (
                  <PackageList items={pendingPackages} variant="pending" emptyText="Tidak ada paket yang menunggu." />
                )}
                {view === "total" && (
                  <PackageList items={packages ?? []} variant="all" emptyText="Belum ada data paket." />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-12 text-center text-muted-foreground flex flex-col items-center">
      <History className="w-10 h-10 mb-3 opacity-20" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function PickupList({
  items,
  freshKeys,
  emptyText,
}: {
  items: Pickup[];
  freshKeys: Set<string>;
  emptyText: string;
}) {
  if (items.length === 0) return <EmptyState text={emptyText} />;
  return (
    <>
      {items.map((p) => {
        const fresh = freshKeys.has(p.kode_pickup + p.timestamp);
        return (
          <div
            key={p.kode_pickup + p.timestamp}
            data-testid={`pickup-${p.kode_pickup}`}
            className={`rounded-xl border p-3.5 transition-colors ${
              fresh ? "border-green-400 bg-green-50 dark:bg-green-950/30" : "border-border bg-card"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-base">{p.nama_driver}</span>
                  {fresh && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-green-600 text-white">
                      Baru
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  <Phone className="w-3 h-3" />
                  {p.no_hp || "-"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center justify-end gap-1 text-xs font-medium">
                  <Clock className="w-3 h-3" />
                  {format(new Date(p.timestamp), "HH:mm", { locale: idLocale })}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {format(new Date(p.timestamp), "dd MMM yyyy", { locale: idLocale })}
                </div>
              </div>
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-1">
              <div className="flex items-center gap-1.5 text-sm">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{p.nama_penerima || "-"}</span>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{p.alamat || "-"}</span>
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border/60">
              <span className="font-mono font-semibold text-sm">{p.kode_pickup}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                {p.kurir || "-"}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function DriverList({
  drivers,
}: {
  drivers: { name: string; phone: string; count: number; last: string }[];
}) {
  if (drivers.length === 0) return <EmptyState text="Belum ada driver aktif hari ini." />;
  return (
    <>
      {drivers.map((d) => (
        <div
          key={d.name + d.phone}
          data-testid={`driver-${d.name}`}
          className="rounded-xl border border-border bg-card p-3.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold truncate">{d.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Terakhir {format(new Date(d.last), "HH:mm", { locale: idLocale })}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-bold text-primary">{d.count}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">paket</p>
          </div>
        </div>
      ))}
    </>
  );
}

function PackageList({
  items,
  variant,
  emptyText,
}: {
  items: Pkg[];
  variant: "pending" | "all";
  emptyText: string;
}) {
  if (items.length === 0) return <EmptyState text={emptyText} />;
  return (
    <>
      {items.map((p) => {
        const done = p.status.toLowerCase() === DONE_STATUS;
        return (
          <div
            key={p.kode_pickup}
            data-testid={`package-${p.kode_pickup}`}
            className="rounded-xl border border-border bg-card p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono font-bold text-sm">{p.kode_pickup}</p>
                <p className="text-sm mt-0.5 truncate">{p.nama_penerima || "-"}</p>
              </div>
              {variant === "all" ? (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                    done
                      ? "bg-green-500/10 text-green-700 dark:text-green-400"
                      : "bg-orange-500/10 text-orange-700 dark:text-orange-400"
                  }`}
                >
                  {done ? "Sudah Diambil" : "Menunggu"}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-500/10 text-orange-700 dark:text-orange-400 shrink-0">
                  Menunggu
                </span>
              )}
            </div>
            {p.alamat && (
              <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
                <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{p.alamat}</span>
              </p>
            )}
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                <TruckIcon className="w-3 h-3" />
                {p.kurir || "-"}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function Dashboard() {
  return (
    <PinGate
      required="security"
      title="Security Dashboard"
      subtitle="Masukkan PIN untuk mengakses log serah terima"
      icon={<Shield className="w-8 h-8" />}
    >
      <DashboardContent />
    </PinGate>
  );
}
