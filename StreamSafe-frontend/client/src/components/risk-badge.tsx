import { Badge } from "@/components/ui/badge";
import { cn, getRiskBandColor } from "@/lib/utils";
import type { RiskBand } from "@shared/schema";

interface RiskBadgeProps {
  band: RiskBand;
  size?: "sm" | "default";
  pulse?: boolean;
  className?: string;
}

export function RiskBadge({ band, size = "default", pulse = false, className }: RiskBadgeProps) {
  return (
    <Badge
      className={cn(
        getRiskBandColor(band),
        "font-semibold uppercase tracking-wide border-0",
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1",
        band === "CRITICAL" && pulse && "pulse-critical",
        className
      )}
      data-testid={`badge-risk-${band.toLowerCase()}`}
    >
      {band}
    </Badge>
  );
}
