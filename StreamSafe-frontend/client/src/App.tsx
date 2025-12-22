import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Bell, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import Dashboard from "@/pages/dashboard";
import Zones from "@/pages/zones";
import ZoneDetail from "@/pages/zone-detail";
import Workers from "@/pages/workers";
import WorkerDetail from "@/pages/worker-detail";
import Alerts from "@/pages/alerts";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/zones" component={Zones} />
      <Route path="/zones/:id" component={ZoneDetail} />
      <Route path="/workers" component={Workers} />
      <Route path="/workers/:id" component={WorkerDetail} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function CurrentTime() {
  const now = new Date();
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4" />
      <span className="font-mono">
        {now.toLocaleTimeString("en-US", { 
          hour: "2-digit", 
          minute: "2-digit", 
          second: "2-digit",
          hour12: false 
        })}
      </span>
    </div>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <AppSidebar />
            <SidebarInset>
              <header className="flex items-center justify-between gap-4 px-4 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
                <div className="flex items-center gap-4">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <div className="h-6 w-px bg-border" />
                  <CurrentTime />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                    <Bell className="h-5 w-5" />
                    <Badge 
                      className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-risk-critical text-risk-critical-foreground border-0"
                    >
                      3
                    </Badge>
                  </Button>
                  <ThemeToggle />
                </div>
              </header>
              <div className="flex-1 overflow-auto bg-background">
                <Router />
              </div>
            </SidebarInset>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
