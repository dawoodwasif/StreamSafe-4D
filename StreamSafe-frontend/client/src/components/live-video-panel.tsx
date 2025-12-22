import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video, Maximize, Minimize } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";

interface LiveVideoPanelProps {
  zoneId: string;
  className?: string;
}

interface DashboardConfig {
  streamUrl: string;
}

export function LiveVideoPanel({ zoneId, className }: LiveVideoPanelProps) {
  const { data: config } = useQuery<DashboardConfig>({
    queryKey: ["/api/config"],
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const streamUrl = config?.streamUrl || "http://localhost:8823/stream";

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <Card className={`border rounded-lg overflow-hidden flex flex-col ${className}`}>
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">Live Safety Feed</CardTitle>
        </div>
      </CardHeader>
      <CardContent 
        ref={containerRef}
        className="p-0 relative bg-black flex-1 flex items-center justify-center min-h-0 group"
      >
        <img 
          src={streamUrl} 
          alt={`Live feed for zone ${zoneId}`}
          className="w-full h-full object-contain"
          onError={(e) => {
            // Fallback if stream fails
            e.currentTarget.style.display = "none";
            e.currentTarget.parentElement?.classList.add("bg-muted");
            const fallback = document.createElement("div");
            fallback.className = "text-muted-foreground text-sm flex flex-col items-center gap-2";
            fallback.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video-off"><path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196a.5.5 0 0 1-.752.435L16 13.5V16a2 2 0 0 1-2 2h-1.5"/><path d="M16 16h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
              <span>Signal Lost</span>
            `;
            e.currentTarget.parentElement?.appendChild(fallback);
          }}
        />
        <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
          <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded animate-pulse">
            LIVE
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20 hover:text-white bg-black/20 backdrop-blur-sm"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
