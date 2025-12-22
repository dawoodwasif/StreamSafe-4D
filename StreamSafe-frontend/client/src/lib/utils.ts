import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RiskBand, BehaviorClass, MachineState } from "@shared/schema";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Risk band utilities
export function getRiskBandFromScore(score: number, thresholds = { low: 25, medium: 50, high: 75, critical: 90 }): RiskBand {
  if (score >= thresholds.critical) return "CRITICAL";
  if (score >= thresholds.high) return "HIGH";
  if (score >= thresholds.medium) return "MEDIUM";
  return "LOW";
}

export function getRiskBandColor(band: RiskBand): string {
  switch (band) {
    case "CRITICAL": return "bg-risk-critical text-risk-critical-foreground";
    case "HIGH": return "bg-risk-high text-risk-high-foreground";
    case "MEDIUM": return "bg-risk-medium text-risk-medium-foreground";
    case "LOW": return "bg-risk-low text-risk-low-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

export function getRiskBandBorderColor(band: RiskBand): string {
  switch (band) {
    case "CRITICAL": return "border-risk-critical";
    case "HIGH": return "border-risk-high";
    case "MEDIUM": return "border-risk-medium";
    case "LOW": return "border-risk-low";
    default: return "border-muted";
  }
}

export function getRiskTextColor(band: RiskBand): string {
  switch (band) {
    case "CRITICAL": return "text-risk-critical";
    case "HIGH": return "text-risk-high";
    case "MEDIUM": return "text-risk-medium";
    case "LOW": return "text-risk-low";
    default: return "text-muted-foreground";
  }
}

// Behavior class utilities
export function getBehaviorLabel(behavior: BehaviorClass): string {
  const labels: Record<BehaviorClass, string> = {
    safe_walkway_violation: "Safe Walkway Violation",
    unauthorized_intervention: "Unauthorized Intervention",
    opened_panel_cover: "Opened Panel Cover",
    carrying_overload_with_forklift: "Carrying Overload (Forklift)",
    safe_walkway: "Safe Walkway",
    authorized_intervention: "Authorized Intervention",
    closed_panel_cover: "Closed Panel Cover",
    safe_carrying: "Safe Carrying",
  };
  return labels[behavior] || behavior;
}

export function isBehaviorSafe(behavior: BehaviorClass): boolean {
  const safeBehaviors: string[] = [
    "safe_walkway",
    "authorized_intervention",
    "closed_panel_cover",
    "safe_carrying"
  ];
  return safeBehaviors.includes(behavior);
}

// Machine state utilities
export function getMachineStateColor(state: MachineState): string {
  switch (state) {
    case "RUNNING": return "text-risk-low";
    case "IDLE": return "text-muted-foreground";
    case "MAINTENANCE": return "text-risk-medium";
    case "ERROR": return "text-risk-critical";
    case "STOPPED": return "text-risk-high";
    default: return "text-muted-foreground";
  }
}

export function getMachineStateLabel(state: MachineState): string {
  const labels: Record<MachineState, string> = {
    RUNNING: "Running",
    IDLE: "Idle",
    MAINTENANCE: "Maintenance",
    ERROR: "Error",
    STOPPED: "Stopped",
  };
  return labels[state] || state;
}

// Date formatting utilities
export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function getRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Zone utilities
export const ZONE_NAMES: Record<string, string> = {
  "zone-a": "Assembly Line A",
  "zone-b": "Assembly Line B",
  "zone-c": "Warehouse North",
  "zone-d": "Warehouse South",
  "zone-e": "Loading Dock",
  "zone-f": "Quality Control",
  "zone-g": "Maintenance Bay",
  "zone-h": "Storage Area",
};

export function getZoneName(zoneId: string): string {
  return ZONE_NAMES[zoneId] || zoneId;
}

// Worker name generator
const FIRST_NAMES = ["James", "Maria", "Robert", "Elena", "David", "Sarah", "Michael", "Lisa", "Chen", "Aisha", "Pavel", "Yuki", "Ahmed", "Priya", "Carlos"];
const LAST_NAMES = ["Smith", "Garcia", "Johnson", "Patel", "Williams", "Kim", "Rodriguez", "Chen", "Brown", "Martinez", "Anderson", "Taylor", "Thomas", "Hernandez", "Moore"];

export function generateWorkerName(seed: number): string {
  const firstName = FIRST_NAMES[seed % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(seed * 7) % LAST_NAMES.length];
  return `${firstName} ${lastName}`;
}

// Number formatting
export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}
