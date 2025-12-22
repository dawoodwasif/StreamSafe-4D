import { Kafka, Consumer } from "kafkajs";
import { getConfig } from "./config";
import { v4 as uuidv4 } from "uuid";

export type RiskAlert = {
  id: string;
  worker_id: string;
  zone_id: string;
  timestamp: string;
  risk_score: number;
  behavior_class: string | null;
  machine_state: string | null;
};

export type ZoneState = {
  id: string;
  name: string;
  workersCount: number;
  alertsCount: number;
  lastSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

export type WorkerState = {
  id: string;
  name: string;
  zoneId: string;
  lastRisk: number;
  lastSeen: string;
  alertsCount: number;
};

export type SummaryStats = {
  criticalAlerts: number;
  highAlerts: number;
  workersAtRisk: number;
  zonesInAlert: number;
};

// In-memory state
const alerts: RiskAlert[] = [];
const zones: Map<string, ZoneState> = new Map();
const workers: Map<string, WorkerState> = new Map();
let summaryStats: SummaryStats = {
  criticalAlerts: 0,
  highAlerts: 0,
  workersAtRisk: 0,
  zonesInAlert: 0,
};

let consumer: Consumer | null = null;
let alertListeners: ((alert: RiskAlert) => void)[] = [];
let mockInterval: NodeJS.Timeout | null = null;

export function onAlert(listener: (alert: RiskAlert) => void) {
  alertListeners.push(listener);
}

function broadcastAlert(alert: RiskAlert) {
  alertListeners.forEach(listener => listener(alert));
}

function getSeverity(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 90) return "CRITICAL";
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

function processAlert(alert: RiskAlert) {
  // Update Ring Buffer
  alerts.push(alert);
  if (alerts.length > 2500) {
    alerts.shift();
  }

  // Update Worker State
  const workerId = alert.worker_id;
  const staticWorker = MOCK_WORKERS.find(w => w.id === workerId);
  const currentWorker = workers.get(workerId) || {
    id: workerId,
    name: staticWorker ? staticWorker.name : "N/A",
    zoneId: alert.zone_id,
    lastRisk: 0,
    lastSeen: "",
    alertsCount: 0
  };
  
  currentWorker.lastRisk = alert.risk_score;
  currentWorker.lastSeen = alert.timestamp;
  currentWorker.alertsCount += 1;
  currentWorker.zoneId = alert.zone_id; // Update location
  workers.set(workerId, currentWorker);

  // Update Zone State
  const zoneId = alert.zone_id;
  const staticZone = MOCK_ZONES.find(z => z.id === zoneId);
  const currentZone = zones.get(zoneId) || {
    id: zoneId,
    name: staticZone ? staticZone.name : `Zone ${zoneId}`,
    workersCount: 0,
    alertsCount: 0,
    lastSeverity: "LOW"
  };

  currentZone.alertsCount += 1;
  currentZone.lastSeverity = getSeverity(alert.risk_score);
  // Recalculate workers count in this zone
  let zoneWorkers = 0;
  for (const w of Array.from(workers.values())) {
    if (w.zoneId === zoneId) zoneWorkers++;
  }
  currentZone.workersCount = zoneWorkers;
  zones.set(zoneId, currentZone);

  // Update Summary Stats
  let critical = 0;
  let high = 0;
  let atRisk = 0;
  let zonesAlert = 0;
  
  for (const w of Array.from(workers.values())) {
    if (w.lastRisk > 50) atRisk++;
  }

  for (const z of Array.from(zones.values())) {
    if (z.lastSeverity === "CRITICAL" || z.lastSeverity === "HIGH") zonesAlert++;
  }

  // For alert counts, let's just count what's in the buffer
  for (const a of alerts) {
      const sev = getSeverity(a.risk_score);
      if (sev === "CRITICAL") critical++;
      if (sev === "HIGH") high++;
  }

  summaryStats = {
    criticalAlerts: critical,
    highAlerts: high,
    workersAtRisk: atRisk,
    zonesInAlert: zonesAlert
  };

  broadcastAlert(alert);
}

// --- Mock Data Definitions ---

const MOCK_ZONES = [
  { id: "zone-a", name: "Assembly Line A", description: "Primary assembly operations", activeWorkers: 12, alertCount: 3, riskLevel: "MEDIUM", machineState: "RUNNING" },
  { id: "zone-b", name: "Assembly Line B", description: "Secondary assembly operations", activeWorkers: 8, alertCount: 1, riskLevel: "LOW", machineState: "RUNNING" },
  { id: "zone-c", name: "Warehouse North", description: "Storage and inventory", activeWorkers: 6, alertCount: 2, riskLevel: "HIGH", machineState: "RUNNING" },
  { id: "zone-d", name: "Warehouse South", description: "Shipping and receiving", activeWorkers: 5, alertCount: 0, riskLevel: "LOW", machineState: "IDLE" },
  { id: "zone-e", name: "Loading Dock", description: "Vehicle loading and unloading", activeWorkers: 4, alertCount: 5, riskLevel: "CRITICAL", machineState: "RUNNING" },
  { id: "zone-f", name: "Quality Control", description: "Inspection and testing", activeWorkers: 3, alertCount: 1, riskLevel: "MEDIUM", machineState: "RUNNING" },
  { id: "zone-g", name: "Maintenance Bay", description: "Equipment maintenance", activeWorkers: 2, alertCount: 0, riskLevel: "LOW", machineState: "MAINTENANCE" },
  { id: "zone-h", name: "Storage Area", description: "Raw materials storage", activeWorkers: 3, alertCount: 1, riskLevel: "MEDIUM", machineState: "IDLE" },
];

const FIRST_NAMES = ["James", "Maria", "Robert", "Elena", "David", "Sarah", "Michael", "Lisa", "Chen", "Aisha", "Pavel", "Yuki", "Ahmed", "Priya", "Carlos", "Emma", "Oliver", "Fatima", "Lucas", "Nina"];
const LAST_NAMES = ["Smith", "Garcia", "Johnson", "Patel", "Williams", "Kim", "Rodriguez", "Chen", "Brown", "Martinez", "Anderson", "Taylor", "Thomas", "Hernandez", "Moore", "Wilson", "Lee", "Walker", "Hall", "Young"];
const ROLES = ["Machine Operator", "Forklift Driver", "Quality Inspector", "Maintenance Tech", "Warehouse Associate", "Safety Officer", "Team Lead", "Assembly Worker"];

function generateWorkerName(seed: number): string {
  const firstName = FIRST_NAMES[seed % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(seed * 7) % LAST_NAMES.length];
  return `${firstName} ${lastName}`;
}

const MOCK_WORKERS = Array.from({ length: 40 }, (_, i) => {
  const zoneIndex = i % MOCK_ZONES.length;
  return {
    id: `worker-${i + 1}`,
    name: generateWorkerName(i),
    role: ROLES[i % ROLES.length],
    zoneId: MOCK_ZONES[zoneIndex].id,
  };
});

const BEHAVIOR_WEIGHTS = [
  { behavior: "safe_walkway_violation", weight: 20 },
  { behavior: "unauthorized_intervention", weight: 15 },
  { behavior: "opened_panel_cover", weight: 10 },
  { behavior: "carrying_overload_with_forklift", weight: 10 },
  { behavior: "safe_walkway", weight: 20 },
  { behavior: "authorized_intervention", weight: 10 },
  { behavior: "closed_panel_cover", weight: 10 },
  { behavior: "safe_carrying", weight: 5 },
];

function getRandomBehavior() {
  const totalWeight = BEHAVIOR_WEIGHTS.reduce((sum, b) => sum + b.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const { behavior, weight } of BEHAVIOR_WEIGHTS) {
    random -= weight;
    if (random <= 0) return behavior;
  }
  return "safe_walkway_violation";
}

function startMockDataGenerator() {
  if (mockInterval) clearInterval(mockInterval);
  console.log("Starting Mock Data Generator...");

  // Pre-populate zones and workers if empty
  if (zones.size === 0) {
    MOCK_ZONES.forEach(z => {
      zones.set(z.id, {
        id: z.id,
        name: z.name,
        workersCount: z.activeWorkers,
        alertsCount: z.alertCount,
        lastSeverity: z.riskLevel as any
      });
    });
  }
  
  if (workers.size === 0) {
    MOCK_WORKERS.forEach(w => {
      workers.set(w.id, {
        id: w.id,
        name: w.name,
        zoneId: w.zoneId,
        lastRisk: 0,
        lastSeen: new Date().toISOString(),
        alertsCount: 0
      });
    });
  }

  // Generate historical data (last 24 hours)
  const now = Date.now();
  const ONE_HOUR = 3600 * 1000;
  
  // Generate ~2000 historical alerts spread over last 24h to ensure dense data for graphs
  for (let i = 0; i < 2000; i++) {
    const timeOffset = Math.random() * 24 * ONE_HOUR;
    const timestamp = new Date(now - timeOffset).toISOString();
    
    const worker = MOCK_WORKERS[Math.floor(Math.random() * MOCK_WORKERS.length)];
    // 80% chance worker is in their assigned zone, 20% random zone
    const zoneId = Math.random() > 0.2 ? worker.zoneId : MOCK_ZONES[Math.floor(Math.random() * MOCK_ZONES.length)].id;
    const behavior = getRandomBehavior();
    
    let baseRisk = Math.random() * 30;
    // High risk behaviors
    if (behavior === "safe_walkway_violation" || behavior === "unauthorized_intervention" || behavior === "carrying_overload_with_forklift") {
      baseRisk = 70 + Math.random() * 30;
    }
    // Medium-High risk behaviors
    else if (behavior === "opened_panel_cover") {
      baseRisk = 50 + Math.random() * 40;
    }
    // Safe behaviors (Low risk)
    else {
      baseRisk = Math.random() * 20;
    }

    const alert: RiskAlert = {
      id: uuidv4(),
      worker_id: worker.id,
      zone_id: zoneId,
      timestamp: timestamp,
      risk_score: Math.round(baseRisk),
      behavior_class: behavior,
      machine_state: Math.random() > 0.8 ? "RUNNING" : "IDLE"
    };

    // Push directly to alerts array, bypassing processAlert to avoid triggering real-time listeners/updates
    alerts.push(alert);
  }
  
  // Sort alerts by timestamp (oldest to newest) so the ring buffer logic makes sense if we were using it,
  // but actually getAlerts reverses it. Let's just sort by timestamp.
  alerts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Keep only last 2500 (increased buffer size to hold history + live)
  if (alerts.length > 2500) {
    alerts.splice(0, alerts.length - 2500);
  }

  // Update stats based on historical data
  // (Simplified: just re-run stats calculation on current state, which is mostly empty for workers/zones until live updates start)
  // Actually, we should probably update worker/zone stats based on the *latest* alert for each worker.
  alerts.forEach(alert => {
     const worker = workers.get(alert.worker_id);
     if (worker && new Date(alert.timestamp) > new Date(worker.lastSeen || 0)) {
         worker.lastRisk = alert.risk_score;
         worker.lastSeen = alert.timestamp;
         worker.alertsCount++;
         worker.zoneId = alert.zone_id;
     }
     
     const zone = zones.get(alert.zone_id);
     if (zone) {
         zone.alertsCount++;
         // Update severity if this is a recent alert (e.g. last 10 mins)
         if (Date.now() - new Date(alert.timestamp).getTime() < 10 * 60 * 1000) {
             zone.lastSeverity = getSeverity(alert.risk_score);
         }
     }
  });


  mockInterval = setInterval(() => {
    const worker = MOCK_WORKERS[Math.floor(Math.random() * MOCK_WORKERS.length)];
    // 80% chance worker is in their assigned zone, 20% random zone
    const zoneId = Math.random() > 0.2 ? worker.zoneId : MOCK_ZONES[Math.floor(Math.random() * MOCK_ZONES.length)].id;
    const behavior = getRandomBehavior();
    
    // Bias risk score based on behavior
    let baseRisk = Math.random() * 30; // Low base risk
    
    // High risk behaviors
    if (behavior === "safe_walkway_violation" || behavior === "unauthorized_intervention" || behavior === "carrying_overload_with_forklift") {
      baseRisk = 70 + Math.random() * 30;
    }
    // Medium-High risk behaviors
    else if (behavior === "opened_panel_cover") {
      baseRisk = 50 + Math.random() * 40;
    }
    // Safe behaviors (Low risk)
    else {
      baseRisk = Math.random() * 20;
    }

    const alert: RiskAlert = {
      id: uuidv4(),
      worker_id: worker.id,
      zone_id: zoneId,
      timestamp: new Date().toISOString(),
      risk_score: Math.round(baseRisk),
      behavior_class: behavior,
      machine_state: Math.random() > 0.8 ? "RUNNING" : "IDLE"
    };

    processAlert(alert);

  }, 2000); // Generate alert every 2 seconds
}

export async function initKafkaConsumer() {
  const config = await getConfig();

  // Stop existing consumer/mock
  if (consumer) {
    try {
      await consumer.disconnect();
    } catch (e) {
      console.error("Error disconnecting consumer", e);
    }
    consumer = null;
  }
  if (mockInterval) {
    clearInterval(mockInterval);
    mockInterval = null;
  }

  // Clear in-memory state to ensure clean switch between Mock and Real data
  alerts.length = 0;
  zones.clear();
  workers.clear();
  summaryStats = {
    criticalAlerts: 0,
    highAlerts: 0,
    workersAtRisk: 0,
    zonesInAlert: 0,
  };

  if (config.useMockData) {
    startMockDataGenerator();
    return;
  }

  const kafka = new Kafka({
    clientId: config.clientId,
    brokers: [config.broker],
    ssl: !config.broker.includes("localhost") && !config.broker.includes("127.0.0.1"),
    sasl: config.saslUsername && config.saslPassword ? {
      mechanism: config.saslMechanism,
      username: config.saslUsername,
      password: config.saslPassword,
    } as any : undefined,
  });

  consumer = kafka.consumer({ groupId: config.consumerGroupId });

  try {
    await consumer.connect();
    console.log("Kafka consumer connected");
    
    await consumer.subscribe({ topic: config.riskAlertsTopic, fromBeginning: false });
    console.log(`Subscribed to topic: ${config.riskAlertsTopic}`);

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        try {
          const parsed = JSON.parse(message.value.toString());
          
          const alert: RiskAlert = {
            id: uuidv4(),
            worker_id: parsed.worker_id,
            zone_id: parsed.zone_id,
            timestamp: parsed.timestamp,
            risk_score: parsed.risk_score,
            behavior_class: parsed.behavior_class,
            machine_state: parsed.machine_state,
          };

          processAlert(alert);

        } catch (err) {
          console.error("Error processing Kafka message:", err);
        }
      },
    });
  } catch (error) {
    console.error("Failed to start Kafka consumer:", error);
  }
}

export function getAlerts() {
  return [...alerts].reverse(); // Newest first
}

export function getSummaryStats() {
  return summaryStats;
}

export function getZonesState() {
  return Array.from(zones.values());
}

export function getWorkersState() {
  return Array.from(workers.values());
}
