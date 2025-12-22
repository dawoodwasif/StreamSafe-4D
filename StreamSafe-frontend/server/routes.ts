import type { Express } from "express";
import { createServer, type Server, get } from "http";
import {
  getAlerts,
  getSummaryStats,
  getZonesState,
  getWorkersState,
  RiskAlert,
} from "./kafkaConsumer";
import { getConfig } from "./config";
import { subMinutes, subHours, parseISO, startOfHour, format } from "date-fns";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // GET /api/video/zone/:zoneId
  app.get("/api/video/zone/:zoneId", async (req, res) => {
    const zoneId = req.params.zoneId;
    const config = await getConfig();

    if (config.useMockData) {
      // Serve a placeholder image or mock stream
      // For simplicity, let's serve a generated SVG placeholder
      res.setHeader("Content-Type", "image/svg+xml");
      const svg = `
        <svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#1a1a1a"/>
          <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#444" text-anchor="middle" dy=".3em">
            Live Feed: ${zoneId} (Mock)
          </text>
          <circle cx="30" cy="30" r="10" fill="red">
            <animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite"/>
          </circle>
          <text x="50" y="35" font-family="Arial" font-size="14" fill="white">REC</text>
        </svg>
      `;
      res.send(svg);
      return;
    }

    // Construct upstream URL - assuming Python server is on localhost:8001
    // In a real app, this host/port should be configurable
    const upstreamUrl = `http://localhost:8001/video/zone/${zoneId}`;

    get(upstreamUrl, (upstreamRes) => {
      // Copy content-type header (essential for MJPEG)
      if (upstreamRes.headers["content-type"]) {
        res.setHeader("Content-Type", upstreamRes.headers["content-type"]);
      }
      
      // Pipe the stream
      upstreamRes.pipe(res);
    }).on("error", (err) => {
      console.error(`Error proxying video for zone ${zoneId}:`, err);
      res.status(502).send("Error connecting to video stream");
    });
  });

  // GET /api/summary
  app.get("/api/summary", (req, res) => {
    const stats = getSummaryStats();
    const alerts = getAlerts();
    const now = new Date();
    const tenMinutesAgo = subMinutes(now, 10);

    const recentAlertsCount = alerts.filter(a => {
      try {
        return new Date(a.timestamp) > tenMinutesAgo;
      } catch (e) { return false; }
    }).length;

    res.json({
      ...stats,
      recentAlertsCount, // total alerts in last 10 minutes
      lastAlertTimestamp: alerts.length > 0 ? alerts[0].timestamp : null,
      connected: true // Assuming connected if server is running and consumer initialized
    });
  });

  // GET /api/dashboard/metrics
  app.get("/api/dashboard/metrics", (req, res) => {
    const stats = getSummaryStats();
    const workers = getWorkersState();
    
    res.json({
      criticalAlerts: stats.criticalAlerts,
      highAlerts: stats.highAlerts,
      zonesInAlert: stats.zonesInAlert,
      workersInAlert: stats.workersAtRisk,
      totalWorkers: workers.length
    });
  });

  // GET /api/alerts
  const handleGetAlerts = (req: any, res: any) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const minRisk = parseInt(req.query.minRisk as string) || 0;
    const zoneId = req.query.zoneId as string | undefined;

    let filtered = getAlerts();

    if (minRisk > 0) {
      filtered = filtered.filter(a => a.risk_score >= minRisk);
    }

    if (zoneId) {
      filtered = filtered.filter(a => a.zone_id === zoneId);
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = filtered.slice(start, end);

    const workers = getWorkersState();
    const zones = getZonesState();

    const mappedAlerts = paginated.map(a => {
      const worker = workers.find(w => w.id === a.worker_id);
      const zone = zones.find(z => z.id === a.zone_id);
      
      return {
        id: a.id,
        workerId: a.worker_id,
        workerName: worker ? worker.name : "N/A",
        zoneId: a.zone_id,
        zoneName: zone ? zone.name : `Zone ${a.zone_id}`,
        timestamp: a.timestamp,
        riskScore: a.risk_score,
        riskBand: a.risk_score >= 90 ? "CRITICAL" : a.risk_score >= 75 ? "HIGH" : a.risk_score >= 50 ? "MEDIUM" : "LOW",
        behaviorClass: a.behavior_class || "safe_walkway",
        machineState: a.machine_state || "RUNNING",
        acknowledged: false,
        description: `Risk score ${a.risk_score} detected`
      };
    });

    res.json({
      alerts: mappedAlerts,
      total,
      page,
      pageSize
    });
  };

  app.get("/api/alerts", handleGetAlerts);
  app.get("/api/alerts/latest", handleGetAlerts);

  // GET /api/zones
  app.get("/api/zones", (req, res) => {
    const zones = getZonesState();
    const mappedZones = zones.map(z => ({
      id: z.id,
      name: z.name,
      description: "Industrial Zone",
      activeWorkers: z.workersCount,
      alertCount: z.alertsCount,
      riskLevel: z.lastSeverity,
      machineState: "RUNNING"
    }));
    res.json(mappedZones);
  });

  // GET /api/workers
  app.get("/api/workers", (req, res) => {
    const workers = getWorkersState();
    const mappedWorkers = workers.map(w => ({
      id: w.id,
      name: w.name,
      role: "Operator",
      zone: w.zoneId,
      riskScore: w.lastRisk,
      alertCount: w.alertsCount,
      lastSeen: w.lastSeen || new Date().toISOString(),
      status: "ACTIVE"
    }));
    res.json(mappedWorkers);
  });

  // GET /api/workers/top
  app.get("/api/workers/top", (req, res) => {
    const n = parseInt(req.query.n as string) || 5;
    const workers = getWorkersState();
    
    // Sort by lastRisk descending
    workers.sort((a, b) => b.lastRisk - a.lastRisk);
    
    const topWorkers = workers.slice(0, n).map(w => ({
      ...w,
      severity: w.lastRisk >= 90 ? "CRITICAL" : 
                w.lastRisk >= 75 ? "HIGH" : 
                w.lastRisk >= 50 ? "MEDIUM" : "LOW"
    }));

    res.json(topWorkers);
  });

  // GET /api/analytics/risk-trend
  app.get("/api/analytics/risk-trend", (req, res) => {
    const alerts = getAlerts();
    const now = new Date();
    const hours = parseInt(req.query.hours as string) || 24;
    const startTime = subHours(now, hours);

    // Initialize buckets with full ISO timestamps
    const trendMap: Record<string, any> = {};
    
    for (let i = 0; i < hours; i++) {
        const d = subHours(now, i);
        const bucketTime = startOfHour(d).toISOString();
        trendMap[bucketTime] = {
            timestamp: bucketTime,
            // Initialize all zones with 0 or null
            "zone-a": 0, "zone-b": 0, "zone-c": 0, "zone-d": 0,
            "zone-e": 0, "zone-f": 0, "zone-g": 0, "zone-h": 0
        };
    }

    // Helper to track counts for averaging
    const counts: Record<string, Record<string, number>> = {};

    alerts.forEach(a => {
        try {
            const d = new Date(a.timestamp);
            if (d < startTime) return;

            const bucketTime = startOfHour(d).toISOString();
            
            if (trendMap[bucketTime]) {
                const zoneId = a.zone_id;
                
                // Initialize count tracker if needed
                if (!counts[bucketTime]) counts[bucketTime] = {};
                if (!counts[bucketTime][zoneId]) counts[bucketTime][zoneId] = 0;

                // Accumulate risk score
                trendMap[bucketTime][zoneId] += a.risk_score;
                counts[bucketTime][zoneId]++;
            }
        } catch (e) {}
    });

    // Calculate averages
    Object.keys(trendMap).forEach(time => {
        const bucketCounts = counts[time];
        let totalRisk = 0;
        let totalCount = 0;

        if (bucketCounts) {
            Object.keys(bucketCounts).forEach(zoneId => {
                if (bucketCounts[zoneId] > 0) {
                    const avgZoneRisk = Math.round(trendMap[time][zoneId] / bucketCounts[zoneId]);
                    trendMap[time][zoneId] = avgZoneRisk;
                    
                    // Accumulate for overall average
                    totalRisk += avgZoneRisk;
                    totalCount++;
                }
            });
        }
        
        // Calculate overall average for the "value" field (used by Weekly Trend)
        trendMap[time].value = totalCount > 0 ? Math.round(totalRisk / totalCount) : 0;
    });

    const result = Object.values(trendMap).sort((a: any, b: any) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    res.json(result);
  });

  // GET /api/analytics/overview
  app.get("/api/analytics/overview", (req, res) => {
    const alerts = getAlerts();
    const now = new Date();
    const twentyFourHoursAgo = subHours(now, 24);

    // Filter for last 24 hours for the trend
    const recentAlerts = alerts.filter(a => {
        try {
            return new Date(a.timestamp) > twentyFourHoursAgo;
        } catch { return false; }
    });

    // Alert Distribution by Zone
    const alertDistributionByZone: Record<string, number> = {};
    alerts.forEach(a => {
      alertDistributionByZone[a.zone_id] = (alertDistributionByZone[a.zone_id] || 0) + 1;
    });

    // Behavior Distribution
    const behaviorDistribution: Record<string, number> = {};
    alerts.forEach(a => {
      const behavior = a.behavior_class || "Unknown";
      behaviorDistribution[behavior] = (behaviorDistribution[behavior] || 0) + 1;
    });

    // Weekly Risk Trend (using last 24h hourly buckets for now as proxy/demo)
    // The prompt asks for "weeklyRiskTrend" but also "histograms across the last 24 hours".
    // We'll provide an hourly trend for the last 24 hours.
    const trendMap: Record<string, number> = {};
    
    // Initialize last 24 hours with 0
    for (let i = 0; i < 24; i++) {
        const d = subHours(now, i);
        const key = format(startOfHour(d), "HH:mm");
        trendMap[key] = 0;
    }

    recentAlerts.forEach(a => {
        try {
            const d = new Date(a.timestamp);
            const key = format(startOfHour(d), "HH:mm");
            if (trendMap[key] !== undefined) {
                trendMap[key]++;
            }
        } catch (e) {}
    });

    const weeklyRiskTrend = Object.entries(trendMap).map(([time, count]) => ({ time, count })).reverse();

    res.json({
      alertDistributionByZone: Object.entries(alertDistributionByZone).map(([name, value]) => ({ name, value })),
      behaviorDistribution: Object.entries(behaviorDistribution).map(([name, value]) => ({ name, value })),
      weeklyRiskTrend
    });
  });

  // GET /api/analytics/alert-distribution
  app.get("/api/analytics/alert-distribution", (req, res) => {
    const alerts = getAlerts();
    const distribution: Record<string, { low: number; medium: number; high: number; critical: number }> = {};

    // Initialize all zones
    const zones = getZonesState();
    zones.forEach(z => {
      distribution[z.name] = { low: 0, medium: 0, high: 0, critical: 0 };
    });

    alerts.forEach(a => {
      // Find zone name
      const zone = zones.find(z => z.id === a.zone_id);
      const zoneName = zone ? zone.name : a.zone_id;
      
      if (!distribution[zoneName]) {
        distribution[zoneName] = { low: 0, medium: 0, high: 0, critical: 0 };
      }

      if (a.risk_score >= 90) distribution[zoneName].critical++;
      else if (a.risk_score >= 75) distribution[zoneName].high++;
      else if (a.risk_score >= 50) distribution[zoneName].medium++;
      else distribution[zoneName].low++;
    });

    const result = Object.entries(distribution).map(([name, counts]) => ({
      name,
      ...counts
    }));

    res.json(result);
  });

  // GET /api/analytics/behavior-breakdown
  app.get("/api/analytics/behavior-breakdown", (req, res) => {
    const alerts = getAlerts();
    const zoneId = req.query.zone as string | undefined;
    const workerId = req.query.worker as string | undefined;

    let filtered = alerts;
    if (zoneId) filtered = filtered.filter(a => a.zone_id === zoneId);
    if (workerId) filtered = filtered.filter(a => a.worker_id === workerId);

    const counts: Record<string, number> = {};
    filtered.forEach(a => {
      const behavior = a.behavior_class || "Unknown";
      counts[behavior] = (counts[behavior] || 0) + 1;
    });

    const total = filtered.length;
    const result = Object.entries(counts).map(([behavior, count]) => ({
      behavior,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    })).sort((a, b) => b.count - a.count);

    res.json(result);
  });

  // GET /api/analytics/heatmap
  app.get("/api/analytics/heatmap", (req, res) => {
    const alerts = getAlerts();
    // Group by Day of Week (Sun-Sat) and Hour (0-23)
    const heatmap: Record<string, number> = {};
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    alerts.forEach(a => {
      try {
        const d = new Date(a.timestamp);
        const day = days[d.getDay()];
        const hour = d.getHours();
        const key = `${day}-${hour}`;
        heatmap[key] = (heatmap[key] || 0) + 1;
      } catch (e) {}
    });

    const result = Object.entries(heatmap).map(([key, value]) => {
      const [day, hourStr] = key.split("-");
      return {
        day,
        hour: parseInt(hourStr),
        value
      };
    });

    res.json(result);
  });

  return httpServer;
}
