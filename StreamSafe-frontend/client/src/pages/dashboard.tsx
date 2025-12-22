import { MetricCard } from "@/components/metric-card";
import { ZoneCard } from "@/components/zone-card";
import { WorkerCard } from "@/components/worker-card";
import { ChartWrapper } from "@/components/chart-wrapper";
import { LiveVideoPanel } from "@/components/live-video-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardMetrics, useZones, useWorkers, useRiskTrend } from "@/hooks/use-alerts";
import { useAlertsStream } from "@/hooks/use-alerts-stream";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Shield, MapPin, Users, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: zones, isLoading: zonesLoading } = useZones();
  const { data: workers, isLoading: workersLoading } = useWorkers();
  const { data: riskTrend, isLoading: trendLoading } = useRiskTrend({ hours: 24 });

  useAlertsStream((alert) => {
    // Invalidate queries to refresh data when new alerts arrive
    queryClient.invalidateQueries({ queryKey: ["/api/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
    queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/risk-trend"] });
  });

  const topRiskyWorkers = workers
    ? [...workers].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5)
    : [];

  const chartColors = {
    "zone-a": "hsl(var(--chart-1))",
    "zone-b": "hsl(var(--chart-2))",
    "zone-c": "hsl(var(--chart-3))",
    "zone-d": "hsl(var(--chart-4))",
    "zone-e": "hsl(var(--chart-5))",
  };

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Safety Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time industrial safety monitoring overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricsLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : (
          <>
            <MetricCard
              title="Critical Alerts"
              value={metrics?.criticalAlerts || 0}
              icon={AlertTriangle}
              variant={metrics?.criticalAlerts && metrics.criticalAlerts > 0 ? "critical" : "default"}
            />
            <MetricCard
              title="High Risk Alerts"
              value={metrics?.highAlerts || 0}
              icon={Shield}
              variant={metrics?.highAlerts && metrics.highAlerts > 0 ? "warning" : "default"}
            />
            <MetricCard
              title="Zones in Alert"
              value={`${metrics?.zonesInAlert || 0} / ${metrics?.totalZones || 0}`}
              icon={MapPin}
              variant="default"
            />
            <MetricCard
              title="Workers Active"
              value={`${metrics?.workersInAlert || 0} at risk`}
              icon={Users}
              variant="default"
            />
          </>
        )}
      </div>

      <ChartWrapper
        title="Risk Trend - Last 24 Hours"
        isLoading={trendLoading}
        heightClass="h-auto"
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Live data</span>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-[300px] lg:h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={riskTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "0.5rem",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend />
                {Object.entries(chartColors).map(([zone, color]) => (
                  <Line
                    key={zone}
                    type="monotone"
                    dataKey={zone}
                    name={zone.replace("-", " ").toUpperCase()}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[300px] lg:h-[400px]">
            <LiveVideoPanel zoneId="zone_walkway" className="h-full" />
          </div>
        </div>
      </ChartWrapper>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="border rounded-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-medium">Zone Health Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {zonesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Skeleton className="h-40" />
                  <Skeleton className="h-40" />
                  <Skeleton className="h-40" />
                  <Skeleton className="h-40" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {zones?.slice(0, 6).map((zone) => (
                    <ZoneCard key={zone.id} zone={zone} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="border rounded-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-medium">Top Risk Workers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {workersLoading ? (
                <>
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </>
              ) : (
                topRiskyWorkers?.map((worker) => (
                  <WorkerCard key={worker.id} worker={worker} compact />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
