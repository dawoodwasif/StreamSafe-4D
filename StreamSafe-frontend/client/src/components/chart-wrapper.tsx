import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ChartWrapperProps {
  title: string;
  children: React.ReactNode;
  isLoading?: boolean;
  className?: string;
  heightClass?: string;
  action?: React.ReactNode;
}

export function ChartWrapper({ 
  title, 
  children, 
  isLoading = false, 
  className, 
  heightClass = "h-64",
  action 
}: ChartWrapperProps) {
  return (
    <Card className={cn("border rounded-lg overflow-hidden", className)} data-testid={`chart-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className={cn("p-4", heightClass)}>
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Skeleton className="w-full h-full" />
          </div>
        ) : (
          <div className="w-full h-full">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
