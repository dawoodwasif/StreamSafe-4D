import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "critical" | "warning" | "success";
  className?: string;
}

export function MetricCard({ title, value, icon: Icon, trend, variant = "default", className }: MetricCardProps) {
  const variantStyles = {
    default: "border-border",
    critical: "border-risk-critical/50 bg-risk-critical/5",
    warning: "border-risk-high/50 bg-risk-high/5",
    success: "border-risk-low/50 bg-risk-low/5",
  };

  const iconVariantStyles = {
    default: "text-primary",
    critical: "text-risk-critical",
    warning: "text-risk-high",
    success: "text-risk-low",
  };

  return (
    <Card className={cn("p-6 border rounded-lg", variantStyles[variant], className)} data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-0">
        <div className="flex flex-col space-y-2">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", iconVariantStyles[variant])} />
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn(
              "text-3xl font-bold",
              variant === "critical" && "text-risk-critical",
              variant === "warning" && "text-risk-high",
              variant === "success" && "text-risk-low"
            )}>
              {value}
            </span>
            {trend && (
              <span className={cn(
                "text-xs font-medium",
                trend.isPositive ? "text-risk-low" : "text-risk-critical"
              )}>
                {trend.isPositive ? "+" : ""}{trend.value}%
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
