// server/state.ts
import { v4 as uuidv4 } from "uuid";

export type RiskAlert = {
  id: string;                 // local id in Node
  worker_id: string;
  zone_id: string;
  timestamp: string;          // ISO
  risk_score: number;
  behavior_class: string | null;
  machine_state: string | null;
};

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Thresholds = {
  low: number;        // 0..100
  medium: number;
  high: number;
  critical: number;
};

export type KafkaConfig = {
  broker: string;
  topic: string;
  username?: string;
  password?: string;
};

export type AppSettings = {
  thresholds: Thresholds;
  mode: "mock" | "live";
  kafka: KafkaConfig;
};

export type ZoneState = {
  id: string;
  name: string;
  workersCount: number;
  alertsCount: number;
  lastSeverity: Severity;
};

export type WorkerState = {
  id: string;
  name: string;
  zoneId: string;
  lastRisk: number;
  lastSeen: string;
  alertsCount: number;
};

export type AppState = {
  alerts: RiskAlert[];
  zones: Record<string, ZoneState>;
  workers: Record<string, WorkerState>;
  lastSync: string | null;
  settings: AppSettings;
};

export const state: AppState = {
  alerts: [],
  zones: {},
  workers: {},
  lastSync: null,
  settings: {
    thresholds: {
      low: 25,
      medium: 50,
      high: 75,
      critical: 90,
    },
    mode: "mock",
    kafka: {
      broker: "pkc-xxxxx.europe-west1.gcp.confluent.cloud:9092",
      topic: "risk_alerts",
      username: process.env.KAFKA_USERNAME,
      password: process.env.KAFKA_PASSWORD,
    },
  },
};

// Helpers
function severityFor(score: number, t: Thresholds): Severity {
  if (score >= t.critical) return "CRITICAL";
  if (score >= t.high) return "HIGH";
  if (score >= t.medium) return "MEDIUM";
  return "LOW";
}

// Called by Kafka consumer for every new message
export function applyIncomingAlert(incoming: Omit<RiskAlert, "id">) {
  const alert: RiskAlert = { ...incoming, id: uuidv4() };

  state.alerts.push(alert);
  if (state.alerts.length > 2000) {
    state.alerts.shift();
  }

  state.lastSync = alert.timestamp;

  // Update zone aggregate
  const z = state.zones[alert.zone_id] || {
    id: alert.zone_id,
    name: alert.zone_id.replace(/_/g, " "),
    workersCount: 0,
    alertsCount: 0,
    lastSeverity: "LOW" as Severity,
  };

  z.alertsCount += 1;
  z.lastSeverity = severityFor(alert.risk_score * 100, state.settings.thresholds);
  state.zones[alert.zone_id] = z;

  // Update worker aggregate
  const w = state.workers[alert.worker_id] || {
    id: alert.worker_id,
    name: alert.worker_id,
    zoneId: alert.zone_id,
    lastRisk: 0,
    lastSeen: alert.timestamp,
    alertsCount: 0,
  };

  w.zoneId = alert.zone_id;
  w.lastRisk = alert.risk_score * 100;
  w.lastSeen = alert.timestamp;
  w.alertsCount += 1;
  state.workers[alert.worker_id] = w;
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  state.settings = {
    ...state.settings,
    ...partial,
    thresholds: {
      ...state.settings.thresholds,
      ...(partial.thresholds || {}),
    },
    kafka: {
      ...state.settings.kafka,
      ...(partial.kafka || {}),
    },
  };
  return state.settings;
}
