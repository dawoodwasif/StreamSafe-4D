import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RiskBadge } from "@/components/risk-badge";
import { ChartWrapper } from "@/components/chart-wrapper";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertRow } from "@/components/alert-row";
import { useWorker, useAlertsByWorker, useBehaviorBreakdown, useRiskTrend } from "@/hooks/use-alerts";
import { getRiskBandFromScore, getZoneName, getRelativeTime, getBehaviorLabel } from "@/lib/utils";
import { ArrowLeft, User, MapPin, AlertTriangle, Clock, Activity } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

export default function WorkerDetail() {
  const params = useParams<{ id: string }>();
  const workerId = params.id || "";
  
  const { data: worker, isLoading: workerLoading } = useWorker(workerId);
  const { data: alerts, isLoading: alertsLoading } = useAlertsByWorker(workerId);
  const { data: behaviors, isLoading: behaviorsLoading } = useBehaviorBreakdown({ worker: workerId });
  const { data: riskTrend, isLoading: trendLoading } = useRiskTrend({ worker: workerId, hours: 24 });

  const statusColors = {
    ACTIVE: "bg-risk-low",
    BREAK: "bg-risk-medium",
    OFFLINE: "bg-muted-foreground",
  };

  if (workerLoading) {
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

  if (!worker) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-lg font-medium mb-2">Worker not found</h3>
        <Link href="/workers">
          <Button variant="outline">Back to Workers</Button>
        </Link>
      </div>
    );
  }

  const riskBand = getRiskBandFromScore(worker.riskScore);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/workers">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-background ${statusColors[worker.status]}`} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold" data-testid="text-worker-name">{worker.name}</h1>
                <RiskBadge band={riskBand} pulse={riskBand === "CRITICAL"} />
              </div>
              <p className="text-sm text-muted-foreground">{worker.role}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Risk Score</p>
              <p className="text-xl font-bold font-mono">{worker.riskScore}</p>
            </div>
          </div>
        </Card>
        <Card className="border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <MapPin className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current Zone</p>
              <p className="text-sm font-semibold truncate">{getZoneName(worker.zone)}</p>
            </div>
          </div>
        </Card>
        <Card className="border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-risk-critical/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-risk-critical" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Alerts</p>
              <p className="text-xl font-bold">{worker.alertCount}</p>
            </div>
          </div>
        </Card>
        <Card className="border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Seen</p>
              <p className="text-sm font-semibold">{getRelativeTime(worker.lastSeen)}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper title="Risk Score History (24h)" isLoading={trendLoading} heightClass="h-64">
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
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper title="Behavior Incidents" isLoading={behaviorsLoading} heightClass="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={behaviors || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis
                type="category"
                dataKey="behavior"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={100}
                tickFormatter={(value) => getBehaviorLabel(value)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "0.5rem",
                }}
                formatter={(value: number, name: string) => [value, getBehaviorLabel(name as any)]}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </div>

      <Card className="border rounded-lg">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Alert History</CardTitle>
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
              No alert history for this worker
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
