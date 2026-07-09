import { useState, useEffect, useRef } from "react";
import { Search, CheckCircle2, User, Phone, Package2, MapPin, Truck as TruckIcon, ArrowRight, X, CloudOff, RefreshCw, AlertTriangle, Plus } from "lucide-react";
import {
  useListPackages,
  getListPackagesQueryKey,
} from "@/lib/hooks";
import type { Package } from "@/lib/api";
import { usePickupQueue } from "@/lib/pickup-queue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";

const driverFormSchema = z.object({
  nama_driver: z.string().min(2, "Nama driver harus diisi"),
  no_hp: z.string().min(8, "No HP tidak valid").max(15, "No HP terlalu panjang"),
  additional_codes: z.array(
    z.object({
      value: z.string()
        .min(1, "Kode tidak boleh kosong")
        .regex(/^[a-zA-Z0-9_-]+$/, "Format kode tidak valid")
    })
  ).default([])
});

export default function Driver() {
  const { enqueue, items: queueItems } = usePickupQueue();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [success, setSuccess] = useState(false);
  const [lastIds, setLastIds] = useState<string[]>([]);
  const [lastCodes, setLastCodes] = useState<string[]>([]);
  
  // Filter queue items that belong to the current submission
  const activeQueueItems = queueItems.filter((it) => lastIds.includes(it.id));
  
  // Determine consolidated status
  let syncStatus: "synced" | "syncing" | "error" = "synced";
  let errorMessage = "";
  
  if (activeQueueItems.length > 0) {
    const errorItem = activeQueueItems.find((it) => it.status === "error");
    if (errorItem) {
      syncStatus = "error";
      errorMessage = errorItem.error || "Gagal sinkron";
    } else {
      syncStatus = "syncing";
    }
  }

  // Guards against a rapid double-tap enqueuing the same pickup twice before
  // the success screen replaces the form. Reset on handleReset.
  const submittedRef = useRef(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: packages, isLoading } = useListPackages(
    { q: debouncedSearch },
    { query: { enabled: debouncedSearch.length >= 3, queryKey: getListPackagesQueryKey({ q: debouncedSearch }) } }
  );

  const { data: allPackages } = useListPackages();

  const form = useForm<z.infer<typeof driverFormSchema>>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: {
      nama_driver: "",
      no_hp: "",
      additional_codes: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "additional_codes",
  });

  // Local-first: save the pickup to the device immediately and let the
  // background syncer push it to the server. The driver never waits on network.
  const onSubmit = (data: z.infer<typeof driverFormSchema>) => {
    if (!selectedPackage || submittedRef.current) return;
    submittedRef.current = true;

    const codes = [
      selectedPackage.kode_pickup,
      ...(data.additional_codes || [])
        .map((c) => c.value.trim().toUpperCase())
        .filter(Boolean),
    ];
    setLastCodes(codes);

    const ids: string[] = [];

    // Enqueue primary package
    const primaryId = enqueue({
      kode_pickup: selectedPackage.kode_pickup,
      nama_driver: data.nama_driver,
      no_hp: data.no_hp,
      nama_penerima: selectedPackage.nama_penerima,
      alamat: selectedPackage.alamat,
      kurir: selectedPackage.kurir,
    });
    ids.push(primaryId);

    // Enqueue additional packages
    (data.additional_codes || []).forEach((c) => {
      const code = c.value.trim().toUpperCase();
      if (code) {
        const addId = enqueue({
          kode_pickup: code,
          nama_driver: data.nama_driver,
          no_hp: data.no_hp,
        });
        ids.push(addId);
      }
    });

    setLastIds(ids);
    setSuccess(true);
  };

  const handleReset = () => {
    setSuccess(false);
    setSelectedPackage(null);
    setSearchQuery("");
    setDebouncedSearch("");
    setLastIds([]);
    setLastCodes([]);
    submittedRef.current = false;
    form.reset();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden w-full max-w-md mx-auto">
      {/* Background Decor */}
      <div className="absolute top-[-20%] left-[-10%] w-72 h-72 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-72 h-72 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full flex flex-col items-center z-10 space-y-6 mt-[-10dvh]">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground shadow-lg mb-2">
            <TruckIcon className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Pickup Gudang</h1>
          <p className="text-muted-foreground text-sm font-medium">Scan atau masukkan kode pickup</p>
        </div>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full"
            >
              <Card className="p-8 flex flex-col items-center text-center space-y-6 border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900 shadow-lg">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
                >
                  <div className="w-20 h-20 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-500" />
                  </div>
                </motion.div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-green-900 dark:text-green-400">Pickup Berhasil!</h2>
                  <p className="text-green-700/80 dark:text-green-500/80 text-sm">
                    {lastCodes.length === 1 ? (
                      <>
                        Paket <span className="font-bold text-green-900 dark:text-green-400">{lastCodes[0]}</span> telah diserahkan.
                      </>
                    ) : (
                      <>
                        {lastCodes.length} paket telah diserahkan:{" "}
                        <span className="font-bold text-green-900 dark:text-green-400">
                          {lastCodes.join(", ")}
                        </span>.
                      </>
                    )}
                  </p>
                </div>

                {syncStatus === "error" ? (
                  <div className="w-full flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-left">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 dark:text-amber-400">
                      Tersimpan di perangkat, tapi gagal sinkron: {errorMessage}
                    </p>
                  </div>
                ) : syncStatus === "syncing" ? (
                  <div className="w-full flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 text-left">
                    {typeof navigator !== "undefined" && navigator.onLine === false ? (
                      <CloudOff className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-blue-600 shrink-0 animate-spin" />
                    )}
                    <p className="text-xs text-blue-800 dark:text-blue-400">
                      Tersimpan di perangkat. Menyinkronkan ke server...
                    </p>
                  </div>
                ) : (
                  <div className="w-full flex items-center gap-2 rounded-xl bg-green-100/60 dark:bg-green-900/30 border border-green-200 dark:border-green-900 p-3 text-left">
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    <p className="text-xs text-green-800 dark:text-green-400">
                      Tersinkron ke server.
                    </p>
                  </div>
                )}

                <Button onClick={handleReset} size="lg" className="w-full h-14 text-base font-semibold shadow-md active:scale-[0.98] transition-all">
                  Scan Paket Berikutnya
                </Button>
              </Card>
            </motion.div>
          ) : !selectedPackage ? (
            <motion.div 
              key="search"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full space-y-4"
            >
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-6 h-6 group-focus-within:text-primary transition-colors" />
                <Input 
                  placeholder="Masukkan Kode Pickup..." 
                  className="pl-12 h-16 text-lg font-semibold rounded-2xl shadow-sm border-2 border-transparent focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 transition-all bg-white dark:bg-card"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                  autoFocus
                  data-testid="input-search-pickup"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {debouncedSearch.length >= 3 && (
                <div className="space-y-2 mt-4">
                  {isLoading ? (
                    <Card className="p-4 flex items-center space-x-4">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    </Card>
                  ) : packages && packages.length > 0 ? (
                    packages.map((pkg, idx) => (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={pkg.kode_pickup}
                      >
                        <Card 
                          className="p-4 hover:border-primary cursor-pointer transition-all active:scale-[0.98] shadow-sm hover:shadow-md bg-white dark:bg-card group"
                          onClick={() => setSelectedPackage(pkg)}
                          data-testid={`card-package-${pkg.kode_pickup}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                                <Package2 className="w-6 h-6" />
                              </div>
                              <div>
                                <h3 className="font-bold text-lg">{pkg.kode_pickup}</h3>
                                <p className="text-sm text-muted-foreground">{pkg.kurir}</p>
                              </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-1" />
                          </div>
                        </Card>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>Paket tidak ditemukan</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full space-y-4"
            >
              <Card className="p-5 bg-primary/5 border-primary/20 space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none" />
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wider">Detail Paket</p>
                    <h3 className="text-xl font-bold">{selectedPackage.kode_pickup}</h3>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedPackage(null)} className="h-8 w-8 -mr-2 -mt-2 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-3 pt-2 border-t border-primary/10">
                  <div className="flex items-start gap-3 text-sm">
                    <User className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{selectedPackage.nama_penerima || "-"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground leading-relaxed line-clamp-2">{selectedPackage.alamat || "-"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <TruckIcon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                        {selectedPackage.kurir || "-"}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-5 shadow-md border-border bg-white dark:bg-card">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    {/* Additional Pickup Codes Section */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Kode Pickup Tambahan (Opsional)</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs font-semibold h-8 rounded-lg flex items-center gap-1 border-dashed hover:border-primary hover:text-primary"
                          onClick={() => append({ value: "" })}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Tambah Kode
                        </Button>
                      </div>
                      
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                        <AnimatePresence initial={false}>
                          {fields.map((field, index) => (
                            <motion.div
                              key={field.id}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.15 }}
                              className="flex gap-2 items-start"
                            >
                              <FormField
                                control={form.control}
                                name={`additional_codes.${index}.value`}
                                render={({ field: inputField }) => {
                                  const pkgVal = inputField.value || "";
                                  const matchedPkg = allPackages?.find(
                                    (p) => p.kode_pickup.toUpperCase() === pkgVal.toUpperCase()
                                  );

                                  return (
                                    <FormItem className="flex-1 space-y-1.5">
                                      <FormControl>
                                        <div className="relative">
                                          <Package2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                          <Input
                                            {...inputField}
                                            placeholder="Contoh: PKP12345"
                                            className="pl-9 h-11 text-sm rounded-xl uppercase font-semibold bg-white dark:bg-card"
                                            onChange={(e) => inputField.onChange(e.target.value.toUpperCase())}
                                          />
                                        </div>
                                      </FormControl>
                                      
                                      {/* Package Details Display */}
                                      {pkgVal.length >= 3 && (
                                        <div className="p-3 rounded-xl bg-muted/40 border border-muted-foreground/10 text-xs space-y-1.5 animate-in fade-in duration-200 text-left">
                                          {matchedPkg ? (
                                            <>
                                              <div className="flex items-center gap-1.5 font-medium text-foreground">
                                                <User className="w-3.5 h-3.5 text-muted-foreground" />
                                                <span>{matchedPkg.nama_penerima || "-"}</span>
                                              </div>
                                              <div className="flex items-start gap-1.5 text-muted-foreground">
                                                <MapPin className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0 mt-0.5" />
                                                <span className="line-clamp-1">{matchedPkg.alamat || "-"}</span>
                                              </div>
                                              <div className="flex items-center gap-1.5">
                                                <TruckIcon className="w-3.5 h-3.5 text-muted-foreground" />
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                                                  {matchedPkg.kurir || "-"}
                                                </span>
                                              </div>
                                            </>
                                          ) : (
                                            <div className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-medium">
                                              <AlertTriangle className="w-3.5 h-3.5" />
                                              <span>Detail paket tidak ditemukan di data master</span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      
                                      <FormMessage className="text-xs mt-1" />
                                    </FormItem>
                                  );
                                }}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => remove(index)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="nama_driver"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold">Nama Driver</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                              <Input placeholder="Budi Santoso" className="pl-10 h-12 text-base rounded-xl" {...field} autoFocus data-testid="input-driver-name" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="no_hp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold">No. HP Driver</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                              <Input type="tel" placeholder="081234567890" className="pl-10 h-12 text-base rounded-xl" {...field} data-testid="input-driver-phone" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Button 
                      type="submit" 
                      className="w-full h-14 text-base font-bold rounded-xl shadow-md active:scale-[0.98] transition-all mt-2" 
                      disabled={form.formState.isSubmitting}
                      data-testid="button-submit-pickup"
                    >
                      Konfirmasi Pickup
                    </Button>
                  </form>
                </Form>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
