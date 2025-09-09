import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import React, { useEffect } from "react";

export default function NotFound() {
  // Auto-refresh on tab focus/visibility and custom events
  // No full reload on not-found; rely on navigation or state/query refresh
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
  {/* Refresh button removed: no full reload, rely on navigation or state/query refresh */}
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Did you forget to add the page to the router?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
