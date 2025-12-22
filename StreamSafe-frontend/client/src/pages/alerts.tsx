import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertRow } from "@/components/alert-row";
import { useAlerts, useAutoRefresh } from "@/hooks/use-alerts";
import { useAlertsStream, RiskAlert } from "@/hooks/use-alerts-stream";
import { ZONE_NAMES, getRiskBandFromScore } from "@/lib/utils";
import { 
  Search, 
  Filter, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  AlertTriangle 
} from "lucide-react";
import type { RiskBand, Alert, BehaviorClass } from "@shared/schema";

export default function Alerts() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskBand | "ALL">("ALL");
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
  
  // Reset page when filters change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleRiskFilterChange = (value: RiskBand | "ALL") => {
    setRiskFilter(value);
    setPage(1);
  };

  const handleZoneFilterChange = (value: string) => {
    setZoneFilter(value);
    setPage(1);
  };
  
  const { data, isLoading, refetch } = useAlerts({
    page,
    pageSize,
    zone: zoneFilter !== "ALL" ? zoneFilter : undefined,
    riskBand: riskFilter !== "ALL" ? riskFilter : undefined,
    search: search || undefined,
    autoRefresh: autoRefreshEnabled,
    refreshInterval: 5000,
  });

  useAlertsStream((riskAlert) => {
    const alert: Alert = {
      id: riskAlert.id,
      workerId: riskAlert.worker_id,
      workerName: "N/A", // Fallback when worker details aren't available
      zoneId: riskAlert.zone_id,
      zoneName: ZONE_NAMES[riskAlert.zone_id] || riskAlert.zone_id,
      timestamp: riskAlert.timestamp,
      riskScore: riskAlert.risk_score,
      riskBand: getRiskBandFromScore(riskAlert.risk_score),
      behaviorClass: riskAlert.behavior_class as BehaviorClass,
      machineState: (riskAlert.machine_state as any) || "RUNNING",
      acknowledged: false,
      description: `Risk detected: ${riskAlert.behavior_class}`,
    };
    setLiveAlerts(prev => [alert, ...prev].slice(0, 50));
  });

  const { isRefreshing, lastRefresh } = useAutoRefresh(autoRefreshEnabled, 5000);

  // Merge live alerts with fetched alerts, prioritizing live ones
  // This is a simple merge strategy. In a real app, you might want to be more sophisticated.
  // For now, we'll just display the fetched alerts, but if we are on page 1 and have live alerts, show them.
  
  let displayAlerts = data?.alerts || [];
  if (page === 1 && liveAlerts.length > 0) {
      // Combine and deduplicate by ID
      const combined = [...liveAlerts, ...displayAlerts];
      const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
      // Sort by timestamp desc
      unique.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      displayAlerts = unique.slice(0, pageSize);
  }

  const totalPages = Math.ceil((data?.total || 0) / pageSize);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Alert Console</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time safety alerts from all monitored zones</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefreshEnabled}
              onCheckedChange={setAutoRefreshEnabled}
              data-testid="switch-auto-refresh"
            />
            <Label htmlFor="auto-refresh" className="text-sm cursor-pointer">
              Auto-refresh
            </Label>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Card className="border rounded-lg">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search alerts..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
                data-testid="input-search-alerts"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={riskFilter} onValueChange={(value) => handleRiskFilterChange(value as RiskBand | "ALL")}>
                <SelectTrigger className="w-36" data-testid="select-risk-filter">
                  <SelectValue placeholder="Risk Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Risks</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={zoneFilter} onValueChange={handleZoneFilterChange}>
                <SelectTrigger className="w-44" data-testid="select-zone-filter">
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Zones</SelectItem>
                  {Object.entries(ZONE_NAMES).map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {autoRefreshEnabled && (
              <span className="text-xs text-muted-foreground ml-auto">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : displayAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">No alerts found</h3>
              <p className="text-sm text-muted-foreground">
                {search || riskFilter !== "ALL" || zoneFilter !== "ALL"
                  ? "Try adjusting your filters"
                  : "All systems operating normally"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Time</TableHead>
                      <TableHead className="w-32">Zone</TableHead>
                      <TableHead className="w-32">Worker</TableHead>
                      <TableHead className="w-24">Risk</TableHead>
                      <TableHead className="w-24">Type</TableHead>
                      <TableHead>Behavior</TableHead>
                      <TableHead className="w-24">Machine</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayAlerts.map((alert) => (
                      <AlertRow key={alert.id} alert={alert} />
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows per page:</span>
                  <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}>
                    <SelectTrigger className="w-20" data-testid="select-page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages || 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
