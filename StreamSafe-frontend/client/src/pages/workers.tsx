import { WorkerCard } from "@/components/worker-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useWorkers } from "@/hooks/use-alerts";
import { useState, useMemo } from "react";
import { Search, Filter, LayoutGrid, List } from "lucide-react";
import { getRiskBandFromScore, ZONE_NAMES } from "@/lib/utils";
import type { RiskBand } from "@shared/schema";

export default function Workers() {
  const { data: workers, isLoading } = useWorkers();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskBand | "ALL">("ALL");
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredWorkers = useMemo(() => {
    if (!workers) return [];
    return workers.filter((worker) => {
      const matchesSearch = worker.name.toLowerCase().includes(search.toLowerCase()) ||
        worker.role.toLowerCase().includes(search.toLowerCase());
      const matchesRisk = riskFilter === "ALL" || getRiskBandFromScore(worker.riskScore) === riskFilter;
      const matchesZone = zoneFilter === "ALL" || worker.zone === zoneFilter;
      return matchesSearch && matchesRisk && matchesZone;
    });
  }, [workers, search, riskFilter, zoneFilter]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Workers</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor individual worker safety metrics and alerts</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search workers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-workers"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={riskFilter} onValueChange={(value) => setRiskFilter(value as RiskBand | "ALL")}>
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
          <Select value={zoneFilter} onValueChange={setZoneFilter}>
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
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
            data-testid="button-view-grid"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("list")}
            data-testid="button-view-list"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className={viewMode === "grid" 
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          : "space-y-3"
        }>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className={viewMode === "grid" ? "h-48" : "h-16"} />
          ))}
        </div>
      ) : filteredWorkers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Filter className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">No workers found</h3>
          <p className="text-sm text-muted-foreground">
            {search || riskFilter !== "ALL" || zoneFilter !== "ALL"
              ? "Try adjusting your search or filter criteria"
              : "No workers are currently active"}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWorkers.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredWorkers.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} compact />
          ))}
        </div>
      )}
    </div>
  );
}
