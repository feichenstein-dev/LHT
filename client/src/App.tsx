import { Switch, Route } from "wouter";
import { Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
// ...removed Toaster import...
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import Messages from "@/pages/messages";
import Logs from "@/pages/logs";
import NotFound from "@/pages/not-found";
import { MessageCircle, List } from "lucide-react";
import Login from "@/pages/login";

function Navigation() {
  // Use location for active tab highlight
  const [location] = useLocation();
  return (
    <header className="bg-card border-b border-border sticky top-0 z-10">
      <div className="px-4 py-3">
        <h1 className="text-xl font-semibold text-center text-foreground" data-testid="app-title">
          <br />
          Sefer Chofetz Chaim Texts
        </h1>
      </div>
      <nav className="flex">
        <Link
          href="/messages"
          className={cn(
            "flex-1 py-3 px-4 text-center font-medium border-b-2 transition-colors",
            location === "/" || location === "/messages"
              ? "text-primary border-primary bg-secondary/30"
              : "text-muted-foreground border-transparent hover:bg-muted"
          )}
          data-testid="tab-messages"
        >
          <MessageCircle className="inline-block w-4 h-4 mr-2" />
          Messages
        </Link>
        <Link
          href="/logs"
          className={cn(
            "flex-1 py-3 px-4 text-center font-medium border-b-2 transition-colors",
            location === "/logs"
              ? "text-primary border-primary bg-secondary/30"
              : "text-muted-foreground border-transparent hover:bg-muted"
          )}
          data-testid="tab-logs"
        >
          <List className="inline-block w-4 h-4 mr-2" />
          Delivery Logs
        </Link>
      </nav>
    </header>
  );
}

function Router() {
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Navigation />
      <main className="flex-1 flex flex-col min-h-0">
        <Switch>
          <Route path="/" component={Messages} />
          <Route path="/messages" component={Messages} />
          <Route path="/logs" component={Logs} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);

  // Check for authentication state (could use localStorage, cookie, etc. for persistence)
  if (!authenticated) {
    return <Login onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
