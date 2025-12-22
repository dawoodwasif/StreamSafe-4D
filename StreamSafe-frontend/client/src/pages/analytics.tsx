import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartWrapper } from "@/components/chart-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlertDistribution, useBehaviorBreakdown, useHeatmapData, useRiskTrend } from "@/hooks/use-alerts";
import { getBehaviorLabel, ZONE_NAMES } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

const RISK_COLORS = {
  low: "hsl(var(--risk-low))",
  medium: "hsl(var(--risk-medium))",
  high: "hsl(var(--risk-high))",
  critical: "hsl(var(--risk-critical))",
};

const BEHAVIOR_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--muted-foreground))",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function Analytics() {
  const { data: distribution, isLoading: distributionLoading } = useAlertDistribution();
  const { data: behaviors, isLoading: behaviorsLoading } = useBehaviorBreakdown();
  const { data: heatmap, isLoading: heatmapLoading } = useHeatmapData();
  const { data: riskTrend, isLoading: trendLoading } = useRiskTrend({ hours: 168 });

  const heatmapMatrix = DAYS.map((day) => ({
    day,
    ...HOURS.reduce((acc, hour) => {
      const cell = heatmap?.find((h) => h.day === day && h.hour === hour);
      acc[`h${hour}`] = cell?.value || 0;
      return acc;
    }, {} as Record<string, number>),
  }));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Advanced safety analytics and pattern insights</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper
          title="Alert Distribution by Zone"
          isLoading={distributionLoading}
          heightClass="h-80"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickFormatter={(value) => ZONE_NAMES[value] || value}
              />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "0.5rem",
                }}
              />
              <Legend />
              <Bar dataKey="low" name="Low" stackId="a" fill={RISK_COLORS.low} />
              <Bar dataKey="medium" name="Medium" stackId="a" fill={RISK_COLORS.medium} />
              <Bar dataKey="high" name="High" stackId="a" fill={RISK_COLORS.high} />
              <Bar dataKey="critical" name="Critical" stackId="a" fill={RISK_COLORS.critical} />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>

        <ChartWrapper
          title="Behavior Classification"
          isLoading={behaviorsLoading}
          heightClass="h-80"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={behaviors || []}
                dataKey="count"
                nameKey="behavior"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={60}
                paddingAngle={2}
                label={({ behavior, percentage }) => `${percentage.toFixed(0)}%`}
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
                formatter={(value: number, name: string) => [value, getBehaviorLabel(name as any)]}
              />
              <Legend
                formatter={(value) => getBehaviorLabel(value as any)}
                layout="vertical"
                align="right"
                verticalAlign="middle"
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </div>

      <ChartWrapper
        title="Weekly Risk Trend"
        isLoading={trendLoading}
        heightClass="h-64"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={riskTrend || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="timestamp"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { weekday: "short" })}
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

      <Card className="border rounded-lg">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Alert Heatmap by Time of Day</CardTitle>
        </CardHeader>
        <CardContent>
          {heatmapLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="flex">
                  <div className="w-12" />
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="flex-1 text-center text-xs text-muted-foreground py-2"
                    >
                      {hour.toString().padStart(2, "0")}
                    </div>
                  ))}
                </div>
                {heatmapMatrix.map((row) => (
                  <div key={row.day} className="flex items-center">
                    <div className="w-12 text-xs text-muted-foreground py-2">{row.day}</div>
                    {HOURS.map((hour) => {
                      const value = row[`h${hour}`] || 0;
                      const intensity = Math.min(value / 10, 1);
                      return (
                        <div
                          key={hour}
                          className="flex-1 aspect-square m-0.5 rounded-sm transition-colors"
                          style={{
                            backgroundColor: value > 0
                              ? `hsl(var(--risk-critical) / ${0.1 + intensity * 0.8})`
                              : "hsl(var(--muted) / 0.3)",
                          }}
                          title={`${row.day} ${hour}:00 - ${value} alerts`}
                        />
                      );
                    })}
                  </div>
                ))}
                <div className="flex items-center justify-end gap-2 mt-4">
                  <span className="text-xs text-muted-foreground">Less</span>
                  <div className="flex gap-0.5">
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map((opacity) => (
                      <div
                        key={opacity}
                        className="w-4 h-4 rounded-sm"
                        style={{ backgroundColor: `hsl(var(--risk-critical) / ${opacity})` }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">More</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border rounded-lg p-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Alerts (7d)</p>
            <p className="text-3xl font-bold" data-testid="text-total-alerts">1,247</p>
            <p className="text-xs text-risk-low">-12% from last week</p>
          </div>
        </Card>
        <Card className="border rounded-lg p-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Risk Score</p>
            <p className="text-3xl font-bold font-mono" data-testid="text-avg-risk">42.3</p>
            <p className="text-xs text-risk-critical">+5.2 from last week</p>
          </div>
        </Card>
        <Card className="border rounded-lg p-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Peak Hour</p>
            <p className="text-3xl font-bold font-mono" data-testid="text-peak-hour">14:00</p>
            <p className="text-xs text-muted-foreground">Most incidents occur</p>
          </div>
        </Card>
        <Card className="border rounded-lg p-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Critical Rate</p>
            <p className="text-3xl font-bold" data-testid="text-critical-rate">8.2%</p>
            <p className="text-xs text-risk-low">-2.1% from last week</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
