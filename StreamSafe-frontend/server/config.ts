import fs from "fs/promises";
import path from "path";

export interface DashboardConfig {
  broker: string;
  saslMechanism: "plain" | "scram-sha-256" | "scram-sha-512";
  saslUsername?: string;
  saslPassword?: string;
  riskAlertsTopic: string;
  clientId: string;
  consumerGroupId: string;
  lowRiskMax: number;
  mediumRiskMax: number;
  highRiskMax: number;
  criticalRiskMax: number;
  useMockData: boolean;
  streamUrl: string;
}

const CONFIG_PATH = path.resolve(process.cwd(), "config", "streamsafe.config.json");

const DEFAULT_CONFIG: DashboardConfig = {
  broker: "localhost:9092",
  saslMechanism: "plain",
  riskAlertsTopic: "risk-alerts",
  clientId: "streamsafe-dashboard",
  consumerGroupId: "streamsafe-dashboard-group",
  lowRiskMax: 25,
  mediumRiskMax: 50,
  highRiskMax: 75,
  criticalRiskMax: 90,
  useMockData: false,
  streamUrl: "http://localhost:8823/stream",
};

export async function getConfig(): Promise<DashboardConfig> {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(data);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    // If file doesn't exist or is invalid, write default and return it
    console.warn("Config file not found or invalid, creating default.");
    await updateConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
}

export async function updateConfig(newConfig: DashboardConfig): Promise<DashboardConfig> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 2), "utf-8");
  return newConfig;
}
