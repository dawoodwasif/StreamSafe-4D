import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Save, RefreshCw, Database, Shield, Bell, Gauge, Video } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface DashboardConfig {
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

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: config, isLoading } = useQuery<DashboardConfig>({
    queryKey: ["/api/config"],
  });

  const [thresholds, setThresholds] = useState({
    low: 25,
    medium: 50,
    high: 75,
    critical: 90,
  });

  const [kafkaConfig, setKafkaConfig] = useState({
    broker: "",
    topic: "",
    groupId: "",
    username: "",
    password: "",
  });
  
  const [useMockData, setUseMockData] = useState(false);
  const [streamUrl, setStreamUrl] = useState("http://localhost:8823/stream");
  
  const [settings, setSettings] = useState({
    autoRefreshInterval: 5,
    enableNotifications: true,
    enableSoundAlerts: false,
  });

  useEffect(() => {
    if (config) {
      setThresholds({
        low: config.lowRiskMax,
        medium: config.mediumRiskMax,
        high: config.highRiskMax,
        critical: config.criticalRiskMax,
      });
      setKafkaConfig({
        broker: config.broker,
        topic: config.riskAlertsTopic,
        groupId: config.consumerGroupId,
        username: config.saslUsername || "",
        password: config.saslPassword || "",
      });
      setUseMockData(config.useMockData);
      setStreamUrl(config.streamUrl || "http://localhost:8823/stream");
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (newConfig: DashboardConfig) => {
      const res = await apiRequest("PUT", "/api/config", newConfig);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      toast({
        title: "Settings saved",
        description: "Your configuration has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!config) return;
    
    const newConfig: DashboardConfig = {
      ...config,
      broker: kafkaConfig.broker,
      riskAlertsTopic: kafkaConfig.topic,
      consumerGroupId: kafkaConfig.groupId,
      saslUsername: kafkaConfig.username,
      saslPassword: kafkaConfig.password,
      lowRiskMax: thresholds.low,
      mediumRiskMax: thresholds.medium,
      highRiskMax: thresholds.high,
      criticalRiskMax: thresholds.critical,
      useMockData: useMockData,
      streamUrl: streamUrl,
    };

    saveMutation.mutate(newConfig);
  };

  const handleReset = () => {
    // Reset to defaults (could also fetch defaults from API if endpoint existed)
    setThresholds({ low: 25, medium: 50, high: 75, critical: 90 });
    // For Kafka, we might want to keep what was loaded or reset to empty
    // For now, let's just reset thresholds as that's safer
    toast({
      title: "Thresholds reset",
      description: "Risk thresholds have been restored to defaults. Click Save to apply.",
    });
  };

  if (isLoading) {
    return <div className="p-6">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure dashboard preferences and risk thresholds</p>
      </div>

      <Card className="border rounded-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-medium">Data Source</CardTitle>
          </div>
          <CardDescription>
            Choose between real-time Kafka stream or simulated mock data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Use Mock Data</Label>
              <p className="text-sm text-muted-foreground">
                Generate simulated alerts instead of connecting to Kafka
              </p>
            </div>
            <Switch
              checked={useMockData}
              onCheckedChange={setUseMockData}
              data-testid="switch-mock-data"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border rounded-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-medium">Video Stream Configuration</CardTitle>
          </div>
          <CardDescription>
            Set the URL for the live video stream
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="streamUrl">Stream URL</Label>
            <Input 
              id="streamUrl" 
              value={streamUrl} 
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="http://localhost:8823/stream" 
            />
            <p className="text-xs text-muted-foreground">
              Enter the full URL of the MJPEG stream or video source.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border rounded-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-medium">Risk Thresholds</CardTitle>
          </div>
          <CardDescription>
            Define the risk score boundaries for each severity level
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Low Risk (0 - {thresholds.low})</Label>
                <span className="text-sm font-mono text-risk-low">{thresholds.low}</span>
              </div>
              <Slider
                value={[thresholds.low]}
                onValueChange={([value]) => setThresholds(t => ({ ...t, low: value }))}
                max={thresholds.medium - 1}
                step={1}
                className="w-full"
                data-testid="slider-low-threshold"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Medium Risk ({thresholds.low + 1} - {thresholds.medium})</Label>
                <span className="text-sm font-mono text-risk-medium">{thresholds.medium}</span>
              </div>
              <Slider
                value={[thresholds.medium]}
                onValueChange={([value]) => setThresholds(t => ({ ...t, medium: value }))}
                min={thresholds.low + 1}
                max={thresholds.high - 1}
                step={1}
                className="w-full"
                data-testid="slider-medium-threshold"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">High Risk ({thresholds.medium + 1} - {thresholds.high})</Label>
                <span className="text-sm font-mono text-risk-high">{thresholds.high}</span>
              </div>
              <Slider
                value={[thresholds.high]}
                onValueChange={([value]) => setThresholds(t => ({ ...t, high: value }))}
                min={thresholds.medium + 1}
                max={thresholds.critical - 1}
                step={1}
                className="w-full"
                data-testid="slider-high-threshold"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Critical Risk ({thresholds.high + 1} - 100)</Label>
                <span className="text-sm font-mono text-risk-critical">{thresholds.critical}</span>
              </div>
              <Slider
                value={[thresholds.critical]}
                onValueChange={([value]) => setThresholds(t => ({ ...t, critical: value }))}
                min={thresholds.high + 1}
                max={100}
                step={1}
                className="w-full"
                data-testid="slider-critical-threshold"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border rounded-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-medium">Kafka Configuration</CardTitle>
          </div>
          <CardDescription>
            Configure connection details for the Kafka cluster
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="broker">Bootstrap Server</Label>
            <Input 
              id="broker" 
              value={kafkaConfig.broker} 
              onChange={(e) => setKafkaConfig(c => ({ ...c, broker: e.target.value }))}
              placeholder="pkc-xxxxx.region.gcp.confluent.cloud:9092" 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="topic">Topic Name</Label>
              <Input 
                id="topic" 
                value={kafkaConfig.topic} 
                onChange={(e) => setKafkaConfig(c => ({ ...c, topic: e.target.value }))}
                placeholder="risk_alerts" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="group">Consumer Group</Label>
              <Input 
                id="group" 
                value={kafkaConfig.groupId} 
                onChange={(e) => setKafkaConfig(c => ({ ...c, groupId: e.target.value }))}
                placeholder="dashboard-group" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">SASL Username</Label>
              <Input 
                id="username" 
                value={kafkaConfig.username} 
                onChange={(e) => setKafkaConfig(c => ({ ...c, username: e.target.value }))}
                type="password"
                placeholder="API Key" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">SASL Password</Label>
              <Input 
                id="password" 
                value={kafkaConfig.password} 
                onChange={(e) => setKafkaConfig(c => ({ ...c, password: e.target.value }))}
                type="password"
                placeholder="API Secret" 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border rounded-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-medium">Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure alert notifications and sounds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Browser Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Show desktop notifications for critical alerts
              </p>
            </div>
            <Switch
              checked={settings.enableNotifications}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, enableNotifications: checked }))}
              data-testid="switch-notifications"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Sound Alerts</Label>
              <p className="text-xs text-muted-foreground">
                Play audio alerts for high and critical events
              </p>
            </div>
            <Switch
              checked={settings.enableSoundAlerts}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, enableSoundAlerts: checked }))}
              data-testid="switch-sound-alerts"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 pt-4">
        <Button onClick={handleSave} className="gap-2" data-testid="button-save-settings" disabled={saveMutation.isPending}>
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
        <Button variant="outline" onClick={handleReset} className="gap-2" data-testid="button-reset-settings">
          <RefreshCw className="h-4 w-4" />
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
