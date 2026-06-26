import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Package, Plus, Upload, Trash2, Package2, ShieldAlert, FileText, Loader2, X
} from "lucide-react";
import { 
  useListPackages, 
  getListPackagesQueryKey,
  useImportPackages,
  useResetPackages,
  useGetStats,
  getGetStatsQueryKey
} from "@/lib/hooks";
import type { PackageItem } from "@/lib/api";
import { PinGate } from "@/components/pin-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { extractPdfPages } from "@/lib/extract-pdf";
import { parseShippingPdf } from "@/lib/parse-shipping-pdf";

const COURIER_OPTIONS = [
  "SPX Instan", "SPX Sameday", 
  "Grab Instan", "Grab Sameday", 
  "Gojek Instan", "Gojek Sameday", 
  "Instan", "Sameday"
];

interface PendingRow extends PackageItem {
  _id: string;
}

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function AdminContent() {
  const queryClient = useQueryClient();
  const [pendingItems, setPendingItems] = useState<PendingRow[]>([]);
  
  const [kodePickup, setKodePickup] = useState("");
  const [namaPenerima, setNamaPenerima] = useState("");
  const [alamat, setAlamat] = useState("");
  const [kurir, setKurir] = useState("");

  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: stats, isLoading: isStatsLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() }
  });

  const { data: packages, isLoading: isPackagesLoading } = useListPackages({}, {
    query: { queryKey: getListPackagesQueryKey() }
  });

  const importPackages = useImportPackages();
  const resetPackages = useResetPackages();

  const mergeItems = (incoming: PackageItem[]): { added: number; dupes: number } => {
    const existing = new Set(
      pendingItems.map(i => i.kode_pickup.trim().toUpperCase()).filter(Boolean)
    );
    const toAdd: PendingRow[] = [];
    let dupes = 0;
    for (const item of incoming) {
      const key = item.kode_pickup.trim().toUpperCase();
      if (key && existing.has(key)) {
        dupes++;
        continue;
      }
      if (key) existing.add(key);
      toAdd.push({ ...item, _id: newId() });
    }
    if (toAdd.length > 0) {
      setPendingItems(prev => [...prev, ...toAdd]);
    }
    return { added: toAdd.length, dupes };
  };

  const handleAddPending = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kodePickup) {
      toast.error("Kode Pickup harus diisi");
      return;
    }
    
    if (pendingItems.some(item => item.kode_pickup === kodePickup)) {
      toast.error("Kode Pickup sudah ada di daftar tunggu");
      return;
    }

    setPendingItems([...pendingItems, {
      _id: newId(),
      kode_pickup: kodePickup,
      nama_penerima: namaPenerima,
      alamat,
      kurir
    }]);

    setKodePickup("");
    setNamaPenerima("");
    setAlamat("");
    setKurir("");
    toast.success("Ditambahkan ke daftar tunggu");
  };

  const handleFiles = async (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter(
      f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfs.length === 0) {
      toast.error("Hanya file PDF yang didukung");
      return;
    }

    setIsParsing(true);
    try {
      const all: PackageItem[] = [];
      for (const file of pdfs) {
        const buffer = await file.arrayBuffer();
        const pages = await extractPdfPages(buffer);
        const parsed = parseShippingPdf(pages);
        all.push(...parsed);
      }
      if (all.length === 0) {
        toast.error("Tidak ada data paket yang terbaca dari PDF");
      } else {
        const { added, dupes } = mergeItems(all);
        const suffix = dupes > 0 ? ` (${dupes} duplikat dilewati)` : "";
        toast.success(`${added} paket ditambahkan dari ${pdfs.length} file PDF${suffix}`);
      }
    } catch (err) {
      toast.error("Gagal membaca file PDF");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const updateRow = (id: string, patch: Partial<PackageItem>) => {
    setPendingItems(prev =>
      prev.map(item => (item._id === id ? { ...item, ...patch } : item))
    );
  };

  const handleRemovePending = (id: string) => {
    setPendingItems(pendingItems.filter(i => i._id !== id));
  };

  const handleImport = () => {
    if (pendingItems.length === 0) return;

    const invalid = pendingItems.filter(i => !i.kode_pickup.trim());
    if (invalid.length > 0) {
      toast.error("Ada paket tanpa Kode Pickup. Lengkapi atau hapus dulu.");
      return;
    }

    const items: PackageItem[] = pendingItems.map(({ _id, ...rest }) => ({
      ...rest,
      kode_pickup: rest.kode_pickup.trim().toUpperCase(),
    }));

    importPackages.mutate({ data: { items } }, {
      onSuccess: (res) => {
        toast.success(`Import berhasil: ${res.added} ditambahkan, ${res.skipped} dilewati`);
        setPendingItems([]);
        queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      },
      onError: () => {
        toast.error("Gagal melakukan import");
      }
    });
  };

  const handleResetAll = () => {
    resetPackages.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(`${res.deleted} paket berhasil dihapus`);
        queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      },
      onError: () => {
        toast.error("Gagal mereset paket");
      }
    });
  };

  return (
    <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-8 pb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Gudang</h1>
          <p className="text-muted-foreground mt-1">Kelola data paket dan import manifest harian</p>
        </div>
        <div className="flex gap-2">
          {isStatsLoading ? (
            <Skeleton className="h-10 w-32" />
          ) : (
            <Badge variant="outline" className="h-10 px-4 text-sm font-medium border-primary/20 bg-primary/5 text-primary gap-2">
              <Package2 className="w-4 h-4" />
              {stats?.pendingPackages || 0} Menunggu
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-sm border-primary/20">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Import dari PDF
              </CardTitle>
              <CardDescription>
                Upload label shipping (Shopee, TikTok, dll). Bisa banyak file & banyak halaman.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                role="button"
                tabIndex={0}
                onClick={() => !isParsing && fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !isParsing) fileInputRef.current?.click();
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                data-testid="pdf-drop-zone"
                className={`flex flex-col items-center justify-center text-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer ${
                  isDragging
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/40"
                } ${isParsing ? "pointer-events-none opacity-70" : ""}`}
              >
                {isParsing ? (
                  <>
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm font-medium">Membaca PDF...</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Tarik & lepas file PDF di sini</p>
                    <p className="text-xs text-muted-foreground">atau klik untuk memilih file</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); }}
                data-testid="input-pdf-file"
              />
              <p className="text-xs text-muted-foreground mt-3">
                Data hasil baca masuk ke daftar tunggu dan bisa Anda edit sebelum diimport.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Input Manual</CardTitle>
              <CardDescription>Tambahkan paket satu per satu</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddPending} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="kode">Kode Pickup <span className="text-destructive">*</span></Label>
                  <Input 
                    id="kode" 
                    value={kodePickup} 
                    onChange={e => setKodePickup(e.target.value.toUpperCase())}
                    placeholder="Contoh: SPX12345678"
                    data-testid="input-kode-pickup"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="penerima">Nama Penerima</Label>
                  <Input 
                    id="penerima" 
                    value={namaPenerima} 
                    onChange={e => setNamaPenerima(e.target.value)}
                    placeholder="Nama penerima paket"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kurir">Kurir</Label>
                  <Select value={kurir} onValueChange={setKurir}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Kurir" />
                    </SelectTrigger>
                    <SelectContent>
                      {COURIER_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alamat">Alamat</Label>
                  <Textarea 
                    id="alamat" 
                    value={alamat} 
                    onChange={e => setAlamat(e.target.value)}
                    placeholder="Alamat lengkap"
                    rows={2}
                  />
                </div>
                <Button type="submit" className="w-full" variant="secondary" data-testid="button-add-pending">
                  <Plus className="w-4 h-4 mr-2" />
                  Tambah ke Antrean
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-primary/20">
            <CardHeader className="pb-4 border-b border-border bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Daftar Tunggu Import</CardTitle>
                  <CardDescription>{pendingItems.length} paket siap diimport — periksa & edit dulu</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {pendingItems.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingItems([])}
                      data-testid="button-clear-pending"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Kosongkan
                    </Button>
                  )}
                  <Button 
                    onClick={handleImport} 
                    disabled={pendingItems.length === 0 || importPackages.isPending}
                    className="shadow-sm"
                    data-testid="button-import"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {importPackages.isPending ? "Mengimport..." : "Import Semua"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {pendingItems.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="min-w-32">Kode Pickup</TableHead>
                        <TableHead className="min-w-40">Penerima</TableHead>
                        <TableHead className="min-w-64">Alamat</TableHead>
                        <TableHead className="min-w-36">Kurir</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingItems.map(item => (
                        <TableRow key={item._id}>
                          <TableCell className="align-top">
                            <Input
                              value={item.kode_pickup}
                              onChange={e => updateRow(item._id, { kode_pickup: e.target.value.toUpperCase() })}
                              className="h-9 font-semibold"
                              data-testid={`edit-kode-${item._id}`}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <Input
                              value={item.nama_penerima}
                              onChange={e => updateRow(item._id, { nama_penerima: e.target.value })}
                              className="h-9"
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <Textarea
                              value={item.alamat}
                              onChange={e => updateRow(item._id, { alamat: e.target.value })}
                              rows={2}
                              className="min-h-9 text-sm"
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <Select value={item.kurir || undefined} onValueChange={v => updateRow(item._id, { kurir: v })}>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Pilih" />
                              </SelectTrigger>
                              <SelectContent>
                                {COURIER_OPTIONS.map(opt => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="align-top">
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => handleRemovePending(item._id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center text-muted-foreground">
                  <Package className="w-10 h-10 mb-3 opacity-20" />
                  <p>Belum ada paket di daftar tunggu</p>
                  <p className="text-sm mt-1">Upload PDF atau gunakan input manual di sebelah kiri</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Database Paket Hari Ini</CardTitle>
                <CardDescription>Semua paket yang terdaftar di sistem</CardDescription>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/10">
                    <ShieldAlert className="w-4 h-4 mr-2" />
                    Reset Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset semua data paket?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tindakan ini akan menghapus semua paket dari database secara permanen. 
                      Pastikan hari operasional sudah selesai.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction onClick={handleResetAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Ya, Reset Data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardHeader>
            <CardContent className="p-0 max-h-[500px] overflow-auto">
              {isPackagesLoading ? (
                <div className="p-4 space-y-4">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : packages && packages.length > 0 ? (
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Kurir</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packages.map(pkg => (
                      <TableRow key={pkg.kode_pickup}>
                        <TableCell className="font-semibold">{pkg.kode_pickup}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{pkg.kurir || "-"}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={pkg.status.toLowerCase() === "sudah diambil" || pkg.status.toLowerCase() === "completed" ? "default" : "secondary"} 
                            className={pkg.status.toLowerCase() === "sudah diambil" || pkg.status.toLowerCase() === "completed" ? "bg-green-500 hover:bg-green-600 text-white border-transparent" : ""}
                          >
                            {pkg.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <p>Database kosong.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  return (
    <PinGate
      required="admin"
      title="Mode Admin"
      subtitle="Masukkan PIN admin untuk mengelola data paket"
      icon={<Package className="w-8 h-8" />}
    >
      <AdminContent />
    </PinGate>
  );
}
