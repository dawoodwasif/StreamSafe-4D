import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RiskBadge } from "@/components/risk-badge";
import { ChartWrapper } from "@/components/chart-wrapper";
import { LiveVideoPanel } from "@/components/live-video-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertRow } from "@/components/alert-row";
import { useZone, useAlertsByZone, useBehaviorBreakdown, useRiskTrend } from "@/hooks/use-alerts";
import { getMachineStateLabel, getMachineStateColor, getBehaviorLabel } from "@/lib/utils";
import { ArrowLeft, Users, AlertTriangle, Activity, Clock } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const BEHAVIOR_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--muted-foreground))",
];

export default function ZoneDetail() {
  const params = useParams<{ id: string }>();
  const zoneId = params.id || "";
  
  const { data: zone, isLoading: zoneLoading } = useZone(zoneId);
  const { data: alerts, isLoading: alertsLoading } = useAlertsByZone(zoneId);
  const { data: behaviors, isLoading: behaviorsLoading } = useBehaviorBreakdown({ zone: zoneId });
  const { data: riskTrend, isLoading: trendLoading } = useRiskTrend({ zone: zoneId, hours: 12 });

  if (zoneLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!zone) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-lg font-medium mb-2">Zone not found</h3>
        <Link href="/zones">
          <Button variant="outline">Back to Zones</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/zones">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold" data-testid="text-zone-name">{zone.name}</h1>
            <RiskBadge band={zone.riskLevel} pulse={zone.riskLevel === "CRITICAL"} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">{zone.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Workers</p>
              <p className="text-xl font-bold">{zone.activeWorkers}</p>
            </div>
          </div>
        </Card>
        <Card className="border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-risk-critical/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-risk-critical" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Alerts</p>
              <p className="text-xl font-bold">{zone.alertCount}</p>
            </div>
          </div>
        </Card>
        <Card className="border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center`}>
              <Activity className={`h-5 w-5 ${getMachineStateColor(zone.machineState)}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Machine State</p>
              <p className={`text-lg font-semibold ${getMachineStateColor(zone.machineState)}`}>
                {getMachineStateLabel(zone.machineState)}
              </p>
            </div>
          </div>
        </Card>
        <Card className="border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Uptime</p>
              <p className="text-xl font-bold">98.7%</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartWrapper title="Risk Trend (12h)" isLoading={trendLoading} heightClass="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={riskTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="timestamp" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "0.5rem",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Line
                  type="monotone"
                  dataKey="riskScore"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>
        <div>
          <LiveVideoPanel zoneId={zoneId} className="h-80" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper title="Behavior Breakdown" isLoading={behaviorsLoading} heightClass="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={behaviors || []}
                dataKey="count"
                nameKey="behavior"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                label={({ name, percentage }) => `${getBehaviorLabel(name as any)} (${percentage.toFixed(0)}%)`}
                labelLine={false}
              >
                {(behaviors || []).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={BEHAVIOR_COLORS[index % BEHAVIOR_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "0.5rem",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </div>

      <Card className="border rounded-lg">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {alertsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !alerts || alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No alerts in this zone
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Time</TableHead>
                    <TableHead className="w-32">Zone</TableHead>
                    <TableHead className="w-32">Worker</TableHead>
                    <TableHead className="w-24">Risk</TableHead>
                    <TableHead>Behavior</TableHead>
                    <TableHead className="w-24">Machine</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.slice(0, 10).map((alert) => (
                    <AlertRow key={alert.id} alert={alert} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
