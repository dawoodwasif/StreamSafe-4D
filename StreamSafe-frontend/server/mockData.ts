import type { Alert, Zone, Worker, DashboardMetrics, RiskBand, BehaviorClass, MachineState } from "@shared/schema";

// Zone definitions
const ZONES: Zone[] = [
  { id: "zone-a", name: "Assembly Line A", description: "Primary assembly operations", activeWorkers: 12, alertCount: 3, riskLevel: "MEDIUM", machineState: "RUNNING" },
  { id: "zone-b", name: "Assembly Line B", description: "Secondary assembly operations", activeWorkers: 8, alertCount: 1, riskLevel: "LOW", machineState: "RUNNING" },
  { id: "zone-c", name: "Warehouse North", description: "Storage and inventory", activeWorkers: 6, alertCount: 2, riskLevel: "HIGH", machineState: "RUNNING" },
  { id: "zone-d", name: "Warehouse South", description: "Shipping and receiving", activeWorkers: 5, alertCount: 0, riskLevel: "LOW", machineState: "IDLE" },
  { id: "zone-e", name: "Loading Dock", description: "Vehicle loading and unloading", activeWorkers: 4, alertCount: 5, riskLevel: "CRITICAL", machineState: "RUNNING" },
  { id: "zone-f", name: "Quality Control", description: "Inspection and testing", activeWorkers: 3, alertCount: 1, riskLevel: "MEDIUM", machineState: "RUNNING" },
  { id: "zone-g", name: "Maintenance Bay", description: "Equipment maintenance", activeWorkers: 2, alertCount: 0, riskLevel: "LOW", machineState: "MAINTENANCE" },
  { id: "zone-h", name: "Storage Area", description: "Raw materials storage", activeWorkers: 3, alertCount: 1, riskLevel: "MEDIUM", machineState: "IDLE" },
];

// Worker definitions
const FIRST_NAMES = ["James", "Maria", "Robert", "Elena", "David", "Sarah", "Michael", "Lisa", "Chen", "Aisha", "Pavel", "Yuki", "Ahmed", "Priya", "Carlos", "Emma", "Oliver", "Fatima", "Lucas", "Nina"];
const LAST_NAMES = ["Smith", "Garcia", "Johnson", "Patel", "Williams", "Kim", "Rodriguez", "Chen", "Brown", "Martinez", "Anderson", "Taylor", "Thomas", "Hernandez", "Moore", "Wilson", "Lee", "Walker", "Hall", "Young"];
const ROLES = ["Machine Operator", "Forklift Driver", "Quality Inspector", "Maintenance Tech", "Warehouse Associate", "Safety Officer", "Team Lead", "Assembly Worker"];

function generateWorkerName(seed: number): string {
  const firstName = FIRST_NAMES[seed % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(seed * 7) % LAST_NAMES.length];
  return `${firstName} ${lastName}`;
}

function generateWorkers(): Worker[] {
  const workers: Worker[] = [];
  const statuses: ("ACTIVE" | "BREAK" | "OFFLINE")[] = ["ACTIVE", "ACTIVE", "ACTIVE", "BREAK", "OFFLINE"];
  
  for (let i = 0; i < 40; i++) {
    const zoneIndex = i % ZONES.length;
    workers.push({
      id: `worker-${i + 1}`,
      name: generateWorkerName(i),
      role: ROLES[i % ROLES.length],
      zone: ZONES[zoneIndex].id,
      riskScore: Math.floor(Math.random() * 100),
      alertCount: Math.floor(Math.random() * 15),
      lastSeen: new Date(Date.now() - Math.random() * 3600000).toISOString(),
      status: statuses[Math.floor(Math.random() * statuses.length)],
    });
  }
  
  return workers;
}

const WORKERS = generateWorkers();

// Behavior classes with weights for realistic distribution
const BEHAVIOR_WEIGHTS: { behavior: BehaviorClass; weight: number }[] = [
  { behavior: "safe_walkway_violation", weight: 20 },
  { behavior: "unauthorized_intervention", weight: 15 },
  { behavior: "opened_panel_cover", weight: 10 },
  { behavior: "carrying_overload_with_forklift", weight: 10 },
  { behavior: "safe_walkway", weight: 20 },
  { behavior: "authorized_intervention", weight: 10 },
  { behavior: "closed_panel_cover", weight: 10 },
  { behavior: "safe_carrying", weight: 5 },
];

function getRandomBehavior(): BehaviorClass {
  const totalWeight = BEHAVIOR_WEIGHTS.reduce((sum, b) => sum + b.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const { behavior, weight } of BEHAVIOR_WEIGHTS) {
    random -= weight;
    if (random <= 0) return behavior;
  }
  
  return "safe_walkway_violation";
}

function getRiskBandFromScore(score: number): RiskBand {
  if (score >= 90) return "CRITICAL";
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

function getRandomMachineState(): MachineState {
  const states: MachineState[] = ["RUNNING", "RUNNING", "RUNNING", "IDLE", "MAINTENANCE", "ERROR", "STOPPED"];
  return states[Math.floor(Math.random() * states.length)];
}

function generateAlert(id: number, timestamp: Date): Alert {
  const worker = WORKERS[Math.floor(Math.random() * WORKERS.length)];
  const zone = ZONES.find(z => z.id === worker.zone) || ZONES[0];
  const riskScore = Math.floor(Math.random() * 100);
  const behavior = getRandomBehavior();
  
  return {
    id: `alert-${id}`,
    workerId: worker.id,
    workerName: worker.name,
    zoneId: zone.id,
    zoneName: zone.name,
    timestamp: timestamp.toISOString(),
    riskScore,
    riskBand: getRiskBandFromScore(riskScore),
    behaviorClass: behavior,
    machineState: getRandomMachineState(),
    acknowledged: Math.random() > 0.7,
    description: `${worker.name} detected with ${behavior.toLowerCase().replace(/_/g, " ")} in ${zone.name}`,
  };
}

// Generate alerts for the last 24 hours
function generateAlerts(count: number = 500): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();
  
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now - Math.random() * 24 * 60 * 60 * 1000);
    alerts.push(generateAlert(i + 1, timestamp));
  }
  
  return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

let ALERTS = generateAlerts();

// Regenerate alerts periodically to simulate real-time updates
setInterval(() => {
  // Add a few new alerts
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    ALERTS.unshift(generateAlert(Date.now() + i, now));
  }
  // Keep only the last 1000 alerts
  ALERTS = ALERTS.slice(0, 1000);
}, 10000);

export function getZones(): Zone[] {
  // Update alert counts dynamically
  return ZONES.map(zone => ({
    ...zone,
    alertCount: ALERTS.filter(a => a.zoneId === zone.id && !a.acknowledged).length,
    activeWorkers: WORKERS.filter(w => w.zone === zone.id && w.status === "ACTIVE").length,
  }));
}

export function getZone(id: string): Zone | undefined {
  const zone = ZONES.find(z => z.id === id);
  if (!zone) return undefined;
  
  return {
    ...zone,
    alertCount: ALERTS.filter(a => a.zoneId === id && !a.acknowledged).length,
    activeWorkers: WORKERS.filter(w => w.zone === id && w.status === "ACTIVE").length,
  };
}

export function getWorkers(): Worker[] {
  return WORKERS.map(worker => ({
    ...worker,
    alertCount: ALERTS.filter(a => a.workerId === worker.id).length,
    riskScore: Math.min(100, Math.max(0, worker.riskScore + Math.floor(Math.random() * 10) - 5)),
    lastSeen: new Date(Date.now() - Math.random() * 3600000).toISOString(),
  }));
}

export function getWorker(id: string): Worker | undefined {
  const worker = WORKERS.find(w => w.id === id);
  if (!worker) return undefined;
  
  return {
    ...worker,
    alertCount: ALERTS.filter(a => a.workerId === id).length,
    lastSeen: new Date(Date.now() - Math.random() * 600000).toISOString(),
  };
}

export function getAlerts(options: {
  page?: number;
  pageSize?: number;
  zone?: string;
  worker?: string;
  riskBand?: string;
  search?: string;
} = {}): { alerts: Alert[]; total: number; page: number; pageSize: number } {
  const { page = 1, pageSize = 20, zone, worker, riskBand, search } = options;
  
  let filtered = [...ALERTS];
  
  if (zone) {
    filtered = filtered.filter(a => a.zoneId === zone);
  }
  
  if (worker) {
    filtered = filtered.filter(a => a.workerId === worker);
  }
  
  if (riskBand) {
    filtered = filtered.filter(a => a.riskBand === riskBand);
  }
  
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(a => 
      a.workerName.toLowerCase().includes(searchLower) ||
      a.zoneName.toLowerCase().includes(searchLower) ||
      a.description.toLowerCase().includes(searchLower)
    );
  }
  
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const alerts = filtered.slice(start, start + pageSize);
  
  return { alerts, total, page, pageSize };
}

export function getAlertsByZone(zoneId: string): Alert[] {
  return ALERTS.filter(a => a.zoneId === zoneId).slice(0, 50);
}

export function getAlertsByWorker(workerId: string): Alert[] {
  return ALERTS.filter(a => a.workerId === workerId).slice(0, 50);
}

export function getDashboardMetrics(): DashboardMetrics {
  const unacknowledgedAlerts = ALERTS.filter(a => !a.acknowledged);
  const criticalAlerts = unacknowledgedAlerts.filter(a => a.riskBand === "CRITICAL").length;
  const highAlerts = unacknowledgedAlerts.filter(a => a.riskBand === "HIGH").length;
  
  const zonesWithAlerts = new Set(unacknowledgedAlerts.map(a => a.zoneId));
  const workersWithAlerts = new Set(unacknowledgedAlerts.map(a => a.workerId));
  
  return {
    criticalAlerts,
    highAlerts,
    zonesInAlert: zonesWithAlerts.size,
    workersInAlert: workersWithAlerts.size,
    totalWorkers: WORKERS.filter(w => w.status === "ACTIVE").length,
    totalZones: ZONES.length,
  };
}

// Simple seeded PRNG for consistent data
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return (state % 1000) / 1000;
  };
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function getRiskTrend(hours: number = 24, zone?: string, worker?: string): { timestamp: string; value: number; [key: string]: string | number }[] {
  const data: { timestamp: string; value: number; [key: string]: string | number }[] = [];
  const now = Date.now();
  const interval = (hours * 60 * 60 * 1000) / 24;
  
  // Create deterministic seed from worker/zone id for consistent but unique trends
  const entityId = worker || zone || "global";
  const hourBucket = Math.floor(now / 3600000);
  const seed = hashCode(entityId) + hourBucket;
  const random = seededRandom(seed);
  
  for (let i = 24; i >= 0; i--) {
    const timestamp = new Date(now - i * interval).toISOString();
    const variation = random() * 30;
    const baseValue = Math.min(100, Math.max(0, 
      35 + variation + Math.sin((i + hashCode(entityId)) / 3) * 20
    ));
    const point: { timestamp: string; value: number; [key: string]: string | number } = {
      timestamp,
      value: Math.round(baseValue),
    };
    
    if (!zone && !worker) {
      // Add per-zone values for global view
      ZONES.slice(0, 5).forEach(z => {
        const zoneRandom = seededRandom(hashCode(z.id) + hourBucket + i);
        const zoneVariation = zoneRandom() * 40;
        point[z.id] = Math.min(100, Math.max(0, 
          Math.round(25 + zoneVariation + Math.sin((i + hashCode(z.id)) / 3) * 20)
        ));
      });
    }
    
    data.push(point);
  }
  
  return data;
}

export function getAlertDistribution(): { name: string; low: number; medium: number; high: number; critical: number }[] {
  return ZONES.slice(0, 6).map(zone => {
    const zoneAlerts = ALERTS.filter(a => a.zoneId === zone.id);
    return {
      name: zone.id,
      low: zoneAlerts.filter(a => a.riskBand === "LOW").length,
      medium: zoneAlerts.filter(a => a.riskBand === "MEDIUM").length,
      high: zoneAlerts.filter(a => a.riskBand === "HIGH").length,
      critical: zoneAlerts.filter(a => a.riskBand === "CRITICAL").length,
    };
  });
}

export function getBehaviorBreakdown(zone?: string, worker?: string): { behavior: string; count: number; percentage: number }[] {
  let filtered = [...ALERTS];
  
  if (zone) {
    filtered = filtered.filter(a => a.zoneId === zone);
  }
  
  if (worker) {
    filtered = filtered.filter(a => a.workerId === worker);
  }
  
  const behaviorCounts: Record<string, number> = {};
  filtered.forEach(alert => {
    behaviorCounts[alert.behaviorClass] = (behaviorCounts[alert.behaviorClass] || 0) + 1;
  });
  
  const total = filtered.length || 1;
  
  return Object.entries(behaviorCounts)
    .map(([behavior, count]) => ({
      behavior,
      count,
      percentage: (count / total) * 100,
    }))
    .sort((a, b) => b.count - a.count);
}

export function getHeatmapData(): { hour: number; day: string; value: number }[] {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const data: { hour: number; day: string; value: number }[] = [];
  
  days.forEach(day => {
    for (let hour = 0; hour < 24; hour++) {
      // Simulate realistic patterns - more alerts during work hours
      let baseValue = 0;
      if (hour >= 8 && hour <= 17) {
        baseValue = 5 + Math.floor(Math.random() * 8);
        // Peak hours
        if (hour >= 10 && hour <= 15) {
          baseValue += 3;
        }
      } else if (hour >= 6 && hour <= 20) {
        baseValue = 2 + Math.floor(Math.random() * 4);
      } else {
        baseValue = Math.floor(Math.random() * 2);
      }
      
      // Weekends have fewer alerts
      if (day === "Sat" || day === "Sun") {
        baseValue = Math.floor(baseValue * 0.3);
      }
      
      data.push({ hour, day, value: baseValue });
    }
  });
  
  return data;
}
