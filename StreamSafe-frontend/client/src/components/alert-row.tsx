import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/risk-badge";
import { cn, formatTimestamp, getBehaviorLabel, getMachineStateLabel, getMachineStateColor, getZoneName, isBehaviorSafe } from "@/lib/utils";
import type { Alert } from "@shared/schema";
import { Check, Eye, Activity } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

interface AlertRowProps {
  alert: Alert;
  onAcknowledge?: (alertId: string) => void;
}

export function AlertRow({ alert, onAcknowledge }: AlertRowProps) {
  const isSafe = isBehaviorSafe(alert.behaviorClass);

  return (
    <TableRow 
      className={cn(
        "hover-elevate",
        alert.riskBand === "CRITICAL" && !alert.acknowledged && "bg-risk-critical/5"
      )}
      data-testid={`row-alert-${alert.id}`}
    >
      <TableCell className="font-mono text-xs whitespace-nowrap w-40">
        {formatTimestamp(alert.timestamp)}
      </TableCell>
      <TableCell className="w-32">
        <Link href={`/zones/${alert.zoneId}`} className="hover:underline text-sm">
          {alert.zoneName}
        </Link>
      </TableCell>
      <TableCell className="w-32">
        <Link href={`/workers/${alert.workerId}`} className="hover:underline text-sm">
          {alert.workerName}
        </Link>
      </TableCell>
      <TableCell className="w-24">
        <RiskBadge band={alert.riskBand} size="sm" pulse={alert.riskBand === "CRITICAL" && !alert.acknowledged} />
      </TableCell>
      <TableCell className="w-24">
        <Badge variant="outline" className={cn(
          "text-xs font-medium border",
          isSafe 
            ? "bg-green-500/10 text-green-600 border-green-200 dark:border-green-900" 
            : "bg-red-500/10 text-red-600 border-red-200 dark:border-red-900"
        )}>
          {isSafe ? "Safe" : "Unsafe"}
        </Badge>
      </TableCell>
      <TableCell className="text-sm">
        {getBehaviorLabel(alert.behaviorClass)}
      </TableCell>
      <TableCell className="w-24">
        <div className="flex items-center gap-1.5">
          <Activity className={cn("h-3.5 w-3.5", getMachineStateColor(alert.machineState))} />
          <span className={cn("text-xs", getMachineStateColor(alert.machineState))}>
            {getMachineStateLabel(alert.machineState)}
          </span>
        </div>
      </TableCell>
      <TableCell className="w-24">
        <div className="flex items-center gap-1">
          {!alert.acknowledged && onAcknowledge && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onAcknowledge(alert.id)}
              className="h-8 w-8"
              data-testid={`button-acknowledge-${alert.id}`}
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          <Link href={`/alerts/${alert.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-view-alert-${alert.id}`}>
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </TableCell>
    </TableRow>
  );
}
