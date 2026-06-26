import { Switch, Route, Router as WouterRouter } from "wouter";
import {
  QueryCache,
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Driver from "@/pages/driver";
import Admin from "@/pages/admin";
import Dashboard from "@/pages/dashboard";
import { Nav } from "@/components/nav";
import { clearRole } from "@/lib/use-role";

// An expired or invalid role token surfaces as a 401. Clear the session so the
// PIN gate reappears instead of the user being stuck on a broken view.
function handleApiError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    clearRole();
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleApiError }),
  mutationCache: new MutationCache({ onError: handleApiError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Driver} />
      <Route path="/admin" component={Admin} />
      <Route path="/dashboard" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="min-h-[100dvh] w-full bg-background flex flex-col font-sans selection:bg-primary/20 selection:text-primary">
            <Router />
            <Nav />
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
