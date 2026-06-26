import { Link, useLocation } from "wouter";
import { Package, Shield, Truck, LogOut } from "lucide-react";
import { useRole, clearRole } from "@/lib/use-role";

export function Nav() {
  const [location] = useLocation();
  const role = useRole();

  // Only admins get cross-mode navigation. Drivers and security stay locked to
  // their own view.
  if (role !== "admin") return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex bg-white/90 dark:bg-black/90 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-full border border-border p-1.5 gap-1" data-testid="nav-container">
      <Link href="/" className={`p-2.5 rounded-full transition-all duration-300 ${location === '/' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} title="Driver">
        <Truck className="w-5 h-5" />
      </Link>
      <Link href="/admin" className={`p-2.5 rounded-full transition-all duration-300 ${location === '/admin' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} title="Admin">
        <Package className="w-5 h-5" />
      </Link>
      <Link href="/dashboard" className={`p-2.5 rounded-full transition-all duration-300 ${location === '/dashboard' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} title="Dashboard">
        <Shield className="w-5 h-5" />
      </Link>
      <button
        onClick={() => clearRole()}
        className="p-2.5 rounded-full transition-all duration-300 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        title="Keluar Admin"
        data-testid="button-logout-admin"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </div>
  );
}
