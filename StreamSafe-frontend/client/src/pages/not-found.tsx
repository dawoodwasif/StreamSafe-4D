import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
      </div>
      <h1 className="text-4xl font-bold mb-2" data-testid="text-404">404</h1>
      <h2 className="text-xl font-medium mb-2">Page Not Found</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button className="gap-2" data-testid="button-go-home">
            <Home className="h-4 w-4" />
            Go to Dashboard
          </Button>
        </Link>
        <Button variant="outline" onClick={() => window.history.back()} className="gap-2" data-testid="button-go-back">
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    </div>
  );
}
