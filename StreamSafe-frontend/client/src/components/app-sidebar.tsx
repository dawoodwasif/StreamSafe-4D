import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  MapPin,
  Users,
  Bell,
  BarChart3,
  Settings,
  Shield,
  Activity,
} from "lucide-react";

const navigationItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Zones", href: "/zones", icon: MapPin },
  { title: "Workers", href: "/workers", icon: Users },
  { title: "Alerts", href: "/alerts", icon: Bell },
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link href="/">
          <div className="flex items-center gap-3 hover-elevate rounded-md p-2 -m-2">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold">StreamSafe 4D</h1>
              <p className="text-xs text-muted-foreground">Industrial Safety</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System Status</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-2 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">API Status</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-risk-low animate-pulse" />
                  <span className="text-xs font-medium text-risk-low">Online</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Data Feed</span>
                <div className="flex items-center gap-1.5">
                  <Activity className="h-3 w-3 text-primary" />
                  <span className="text-xs font-medium">Mock</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Sync</span>
                <span className="text-xs font-mono">Just now</span>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>v1.0.0</span>
          <span>Demo Mode</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
