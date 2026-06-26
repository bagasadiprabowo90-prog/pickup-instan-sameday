import { useState } from "react";
import { Lock } from "lucide-react";
import { useVerifyPin } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useRole, hasAccess, setToken, type RequiredRole } from "@/lib/use-role";

interface PinGateProps {
  required: RequiredRole;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

export function PinGate({ required, title, subtitle, icon, children }: PinGateProps) {
  const role = useRole();
  const [pin, setPin] = useState("");
  const verifyPin = useVerifyPin();

  if (hasAccess(role, required)) {
    return <>{children}</>;
  }

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    verifyPin.mutate(
      { data: { pin, role: required } },
      {
        onSuccess: (res) => {
          if (res.valid && res.token) {
            setToken(res.token);
            toast.success("Akses diberikan");
          } else {
            toast.error("PIN salah");
            setPin("");
          }
        },
        onError: () => toast.error("Terjadi kesalahan sistem"),
      },
    );
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[100dvh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm"
      >
        <Card className="shadow-xl border-border/50">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center text-foreground">
              {icon}
            </div>
            <div>
              <CardTitle className="text-2xl">{title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="password"
                  inputMode="numeric"
                  placeholder="PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="pl-10 h-12 text-center tracking-[1em] text-lg font-mono"
                  autoFocus
                  maxLength={6}
                  data-testid="input-pin"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12"
                disabled={verifyPin.isPending || pin.length < 4}
                data-testid="button-unlock"
              >
                {verifyPin.isPending ? "Memverifikasi..." : "Buka Kunci"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
