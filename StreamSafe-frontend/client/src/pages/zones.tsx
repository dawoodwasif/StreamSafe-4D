import { ZoneCard } from "@/components/zone-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useZones } from "@/hooks/use-alerts";
import { useState, useMemo } from "react";
import { Search, Filter } from "lucide-react";
import type { RiskBand } from "@shared/schema";

export default function Zones() {
  const { data: zones, isLoading } = useZones();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskBand | "ALL">("ALL");

  const filteredZones = useMemo(() => {
    if (!zones) return [];
    return zones.filter((zone) => {
      const matchesSearch = zone.name.toLowerCase().includes(search.toLowerCase()) ||
        zone.description.toLowerCase().includes(search.toLowerCase());
      const matchesRisk = riskFilter === "ALL" || zone.riskLevel === riskFilter;
      return matchesSearch && matchesRisk;
    });
  }, [zones, search, riskFilter]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Zones</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor safety status across all facility zones</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search zones..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-zones"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={riskFilter} onValueChange={(value) => setRiskFilter(value as RiskBand | "ALL")}>
            <SelectTrigger className="w-40" data-testid="select-risk-filter">
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Levels</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredZones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Filter className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">No zones found</h3>
          <p className="text-sm text-muted-foreground">
            {search || riskFilter !== "ALL"
              ? "Try adjusting your search or filter criteria"
              : "No zones have been configured yet"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredZones.map((zone) => (
            <ZoneCard key={zone.id} zone={zone} />
          ))}
        </div>
      )}
    </div>
  );
}
