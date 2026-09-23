"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHealth } from "./health-api";

export function HealthPanel({ apiBaseUrl }: Readonly<{ apiBaseUrl: string }>) {
  const query = useQuery({
    queryKey: ["health", apiBaseUrl],
    queryFn: ({ signal }) => fetchHealth(apiBaseUrl, signal),
    retry: 1,
    staleTime: 10_000,
  });

  return (
    <Card className="border-border/90 bg-card/75 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b">
        <div>
          <CardTitle>API connectivity</CardTitle>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
            GET {apiBaseUrl.replace(/\/$/, "")}/health
          </p>
        </div>
        {query.isSuccess ? (
          <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
            <CheckCircle2 aria-hidden="true" /> Healthy
          </Badge>
        ) : query.isError ? (
          <Badge variant="destructive">
            <AlertTriangle aria-hidden="true" /> Disconnected
          </Badge>
        ) : (
          <Badge variant="secondary">Checking</Badge>
        )}
      </CardHeader>
      <CardContent className="p-6">
        {query.isPending ? (
          <div
            role="status"
            aria-label="Checking API health"
            className="grid gap-4 md:grid-cols-3"
          >
            {["status", "application", "environment"].map((item) => (
              <div key={item} className="space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-32" />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="font-semibold">API unreachable</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {query.error.message}
            </p>
            <Button
              className="mt-5"
              variant="outline"
              onClick={() => query.refetch()}
            >
              <RefreshCw aria-hidden="true" /> Retry health check
            </Button>
          </div>
        ) : (
          <dl className="grid gap-6 md:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </dt>
              <dd className="mt-2 text-lg font-semibold">
                {query.data.status}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Application
              </dt>
              <dd className="mt-2 break-all font-mono text-base">
                {query.data.app}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Environment
              </dt>
              <dd className="mt-2 break-all font-mono text-base">
                {query.data.environment}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
