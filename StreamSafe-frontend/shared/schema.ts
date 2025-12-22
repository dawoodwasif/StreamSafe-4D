import { z } from "zod";

// Risk band levels
export const RiskBand = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type RiskBand = z.infer<typeof RiskBand>;

// Behavior classifications
export const BehaviorClass = z.enum([
  "safe_walkway_violation",
  "unauthorized_intervention",
  "opened_panel_cover",
  "carrying_overload_with_forklift",
  "safe_walkway",
  "authorized_intervention",
  "closed_panel_cover",
  "safe_carrying"
]);
export type BehaviorClass = z.infer<typeof BehaviorClass>;

// Machine states
export const MachineState = z.enum([
  "RUNNING",
  "IDLE",
  "MAINTENANCE",
  "ERROR",
  "STOPPED"
]);
export type MachineState = z.infer<typeof MachineState>;

// Zone schema
export const zoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  activeWorkers: z.number(),
  alertCount: z.number(),
  riskLevel: RiskBand,
  machineState: MachineState,
});
export type Zone = z.infer<typeof zoneSchema>;

// Worker schema
export const workerSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  zone: z.string(),
  riskScore: z.number(),
  alertCount: z.number(),
  lastSeen: z.string(),
  status: z.enum(["ACTIVE", "BREAK", "OFFLINE"]),
});
export type Worker = z.infer<typeof workerSchema>;

// Alert schema
export const alertSchema = z.object({
  id: z.string(),
  workerId: z.string(),
  workerName: z.string(),
  zoneId: z.string(),
  zoneName: z.string(),
  timestamp: z.string(),
  riskScore: z.number(),
  riskBand: RiskBand,
  behaviorClass: BehaviorClass,
  machineState: MachineState,
  acknowledged: z.boolean(),
  description: z.string(),
});
export type Alert = z.infer<typeof alertSchema>;

// Risk thresholds settings
export const riskThresholdsSchema = z.object({
  low: z.number().min(0).max(100),
  medium: z.number().min(0).max(100),
  high: z.number().min(0).max(100),
  critical: z.number().min(0).max(100),
});
export type RiskThresholds = z.infer<typeof riskThresholdsSchema>;

// Settings schema
export const settingsSchema = z.object({
  riskThresholds: riskThresholdsSchema,
  useMockData: z.boolean(),
  autoRefreshInterval: z.number(),
  streamUrl: z.string().optional(),
  kafkaConfig: z.object({
    broker: z.string(),
    topic: z.string(),
    groupId: z.string(),
  }),
});
export type Settings = z.infer<typeof settingsSchema>;

// Dashboard metrics
export const dashboardMetricsSchema = z.object({
  criticalAlerts: z.number(),
  highAlerts: z.number(),
  zonesInAlert: z.number(),
  workersInAlert: z.number(),
  totalWorkers: z.number(),
  totalZones: z.number(),
});
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;

// Chart data types
export const riskTrendPointSchema = z.object({
  timestamp: z.string(),
  value: z.number(),
  zone: z.string().optional(),
});
export type RiskTrendPoint = z.infer<typeof riskTrendPointSchema>;

export const alertDistributionSchema = z.object({
  name: z.string(),
  low: z.number(),
  medium: z.number(),
  high: z.number(),
  critical: z.number(),
});
export type AlertDistribution = z.infer<typeof alertDistributionSchema>;

export const behaviorBreakdownSchema = z.object({
  behavior: z.string(),
  count: z.number(),
  percentage: z.number(),
});
export type BehaviorBreakdown = z.infer<typeof behaviorBreakdownSchema>;

export const heatmapCellSchema = z.object({
  hour: z.number(),
  day: z.string(),
  value: z.number(),
});
export type HeatmapCell = z.infer<typeof heatmapCellSchema>;

// API Response types
export const alertsResponseSchema = z.object({
  alerts: z.array(alertSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type AlertsResponse = z.infer<typeof alertsResponseSchema>;

// Keep existing user schema for auth if needed later
export const users = {
  id: "varchar",
  username: "text",
  password: "text",
};

export type User = {
  id: string;
  username: string;
  password: string;
};

export type InsertUser = Omit<User, "id">;
