import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/risk-badge";
import { cn, getMachineStateLabel, getMachineStateColor } from "@/lib/utils";
import type { Zone } from "@shared/schema";
import { Users, AlertTriangle, Activity, ChevronRight } from "lucide-react";
import { Link } from "wouter";

interface ZoneCardProps {
  zone: Zone;
  className?: string;
}

export function ZoneCard({ zone, className }: ZoneCardProps) {
  return (
    <Card className={cn("border rounded-lg hover-elevate", className)} data-testid={`card-zone-${zone.id}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base font-medium truncate">{zone.name}</CardTitle>
        <RiskBadge band={zone.riskLevel} size="sm" pulse={zone.riskLevel === "CRITICAL"} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Workers</p>
              <p className="text-sm font-semibold">{zone.activeWorkers}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Alerts</p>
              <p className="text-sm font-semibold">{zone.alertCount}</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Activity className={cn("h-4 w-4", getMachineStateColor(zone.machineState))} />
            <span className={cn("text-xs font-medium", getMachineStateColor(zone.machineState))}>
              {getMachineStateLabel(zone.machineState)}
            </span>
          </div>
          <Link href={`/zones/${zone.id}`}>
            <Button variant="ghost" size="sm" className="gap-1" data-testid={`button-view-zone-${zone.id}`}>
              View
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
