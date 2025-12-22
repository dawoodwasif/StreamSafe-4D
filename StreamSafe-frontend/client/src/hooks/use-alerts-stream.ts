import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export interface RiskAlert {
  id: string;
  worker_id: string;
  zone_id: string;
  timestamp: string;
  risk_score: number;
  behavior_class: string | null;
  machine_state: string | null;
}

export function useAlertsStream(onAlert?: (alert: RiskAlert) => void) {
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/alerts`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Connected to alerts stream");
    };

    ws.onmessage = (event) => {
      try {
        const alert = JSON.parse(event.data) as RiskAlert;
        if (onAlert) {
          onAlert(alert);
        }
      } catch (error) {
        console.error("Failed to parse alert:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("Disconnected from alerts stream");
    };

    return () => {
      ws.close();
    };
  }, [onAlert]);

  return wsRef.current;
}
