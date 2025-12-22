import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import type { Alert, AlertsResponse, DashboardMetrics, Zone, Worker } from "@shared/schema";

export function useAlerts(options: {
  page?: number;
  pageSize?: number;
  zone?: string;
  worker?: string;
  riskBand?: string;
  search?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
} = {}) {
  const {
    page = 1,
    pageSize = 20,
    zone,
    worker,
    riskBand,
    search,
    autoRefresh = false,
    refreshInterval = 5000,
  } = options;

  const queryParams = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(zone && { zone }),
    ...(worker && { worker }),
    ...(riskBand && { riskBand }),
    ...(search && { search }),
  });

  const query = useQuery<AlertsResponse>({
    queryKey: [`/api/alerts/latest?${queryParams.toString()}`],
    refetchInterval: autoRefresh ? refreshInterval : false,
  });

  return query;
}

export function useAlertsByZone(zoneId: string) {
  return useQuery<Alert[]>({
    queryKey: [`/api/alerts/by-zone/${zoneId}`],
    enabled: !!zoneId,
  });
}

export function useAlertsByWorker(workerId: string) {
  return useQuery<Alert[]>({
    queryKey: [`/api/alerts/by-worker/${workerId}`],
    enabled: !!workerId,
  });
}

export function useDashboardMetrics() {
  return useQuery<DashboardMetrics>({
    queryKey: ["/api/dashboard/metrics"],
    refetchInterval: 10000,
  });
}

export function useZones() {
  return useQuery<Zone[]>({
    queryKey: ["/api/zones"],
    refetchInterval: 30000,
  });
}

export function useZone(zoneId: string) {
  return useQuery<Zone>({
    queryKey: [`/api/zones/${zoneId}`],
    enabled: !!zoneId,
  });
}

export function useWorkers() {
  return useQuery<Worker[]>({
    queryKey: ["/api/workers"],
    refetchInterval: 30000,
  });
}

export function useWorker(workerId: string) {
  return useQuery<Worker>({
    queryKey: [`/api/workers/${workerId}`],
    enabled: !!workerId,
  });
}

export function useRiskTrend(options: { zone?: string; worker?: string; hours?: number } = {}) {
  const { zone, worker, hours = 24 } = options;
  const params = new URLSearchParams();
  params.set("hours", hours.toString());
  if (zone) params.set("zone", zone);
  if (worker) params.set("worker", worker);

  return useQuery<{ timestamp: string; value: number; [key: string]: string | number }[]>({
    queryKey: [`/api/analytics/risk-trend?${params.toString()}`],
    refetchInterval: 30000,
  });
}

export function useAlertDistribution() {
  return useQuery<{ name: string; low: number; medium: number; high: number; critical: number }[]>({
    queryKey: ["/api/analytics/alert-distribution"],
    refetchInterval: 60000,
  });
}

export function useBehaviorBreakdown(options: { zone?: string; worker?: string } = {}) {
  const { zone, worker } = options;
  const params = new URLSearchParams();
  if (zone) params.set("zone", zone);
  if (worker) params.set("worker", worker);
  const queryString = params.toString();

  return useQuery<{ behavior: string; count: number; percentage: number }[]>({
    queryKey: [`/api/analytics/behavior-breakdown${queryString ? `?${queryString}` : ""}`],
    refetchInterval: 60000,
  });
}

export function useHeatmapData() {
  return useQuery<{ hour: number; day: string; value: number }[]>({
    queryKey: ["/api/analytics/heatmap"],
    refetchInterval: 120000,
  });
}

export function useAutoRefresh(enabled: boolean, interval: number = 5000) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    setLastRefresh(new Date());
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      refresh();
    }, interval);

    return () => clearInterval(timer);
  }, [enabled, interval, refresh]);

  return { isRefreshing, lastRefresh, refresh };
}
