import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/risk-badge";
import { cn, getRiskBandFromScore, getRelativeTime, getZoneName } from "@/lib/utils";
import type { Worker } from "@shared/schema";
import { User, MapPin, AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "wouter";

interface WorkerCardProps {
  worker: Worker;
  className?: string;
  compact?: boolean;
}

export function WorkerCard({ worker, className, compact = false }: WorkerCardProps) {
  const riskBand = getRiskBandFromScore(worker.riskScore);
  
  const statusColors = {
    ACTIVE: "bg-risk-low",
    BREAK: "bg-risk-medium",
    OFFLINE: "bg-muted-foreground",
  };

  if (compact) {
    return (
      <div className={cn("flex items-center justify-between p-3 rounded-md bg-muted/50 hover-elevate", className)} data-testid={`row-worker-${worker.id}`}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background", statusColors[worker.status])} />
          </div>
          <div>
            <p className="text-sm font-medium">{worker.name}</p>
            <p className="text-xs text-muted-foreground">{getZoneName(worker.zone)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-semibold">{worker.riskScore}</span>
          <RiskBadge band={riskBand} size="sm" />
        </div>
      </div>
    );
  }

  return (
    <Card className={cn("border rounded-lg hover-elevate", className)} data-testid={`card-worker-${worker.id}`}>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className={cn("absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card", statusColors[worker.status])} />
            </div>
            <div>
              <p className="text-base font-medium">{worker.name}</p>
              <p className="text-xs text-muted-foreground">{worker.role}</p>
            </div>
          </div>
          <RiskBadge band={riskBand} pulse={riskBand === "CRITICAL"} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground truncate">{getZoneName(worker.zone)}</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{worker.alertCount} alerts</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Risk Score</span>
            <span className="text-lg font-mono font-bold">{worker.riskScore}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{getRelativeTime(worker.lastSeen)}</span>
            <Link href={`/workers/${worker.id}`}>
              <Button variant="ghost" size="sm" className="gap-1" data-testid={`button-view-worker-${worker.id}`}>
                View
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
