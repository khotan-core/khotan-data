"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RunLogItem {
  id: string;
  runType: string;
  status: "pending" | "running" | "ok" | "failed";
  workflowRunId: string | null;
  sourceType: "flow" | "webhook" | "unknown";
  sourceName: string | null;
  sourceKind: "catch" | "pass" | null;
  plugName: string | null;
  startedAt: string;
  completedAt: string | null;
  extracted: number;
  transformed: number;
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  error: string | null;
}

interface PageResponse<T> {
  items: T[];
  page: {
    limit: number;
    offset: number;
    hasMore: boolean;
    prevOffset: number;
    nextOffset: number;
  };
}

const statusVariant = {
  pending: "outline",
  running: "secondary",
  ok: "default",
  failed: "destructive",
} as const;

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatSource(item: RunLogItem): string {
  if (!item.sourceName) return "Unknown";
  if (item.sourceType !== "webhook" || !item.sourceKind) return item.sourceName;
  return `${item.sourceKind}:${item.sourceName}`;
}

function formatCounts(item: RunLogItem): string {
  const parts = [
    item.extracted > 0 ? `extracted ${String(item.extracted)}` : null,
    item.transformed > 0 ? `transformed ${String(item.transformed)}` : null,
    item.created > 0 ? `created ${String(item.created)}` : null,
    item.updated > 0 ? `updated ${String(item.updated)}` : null,
    item.deleted > 0 ? `deleted ${String(item.deleted)}` : null,
    item.failed > 0 ? `failed ${String(item.failed)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : "-";
}

export function KhotanRunsTable({ pageSize = 10 }: { pageSize?: number } = {}) {
  const [data, setData] = useState<PageResponse<RunLogItem> | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/khotan/runs?limit=${String(pageSize)}&offset=${String(offset)}`);
        if (!res.ok) {
          throw new Error("Failed to load runs");
        }
        const json = (await res.json()) as PageResponse<RunLogItem>;
        if (!cancelled) {
          setData(json);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [offset, pageSize, refreshKey]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Runs</CardTitle>
          <p className="text-sm text-muted-foreground">
            Recent flow and webhook execution history.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey((v) => v + 1)}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Plug</TableHead>
              <TableHead>Run Type</TableHead>
              <TableHead>Counts</TableHead>
              <TableHead>Workflow</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  Loading runs...
                </TableCell>
              </TableRow>
            ) : data?.items.length ? (
              data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    <div>{formatDateTime(item.startedAt)}</div>
                    <div className="text-xs">
                      {item.completedAt ? `completed ${formatDateTime(item.completedAt)}` : "in progress"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[item.status]}>
                      {item.status}
                    </Badge>
                    {item.error ? (
                      <div className="mt-1 max-w-56 truncate text-xs text-destructive" title={item.error}>
                        {item.error}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-medium">{formatSource(item)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.plugName ?? "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.runType}
                  </TableCell>
                  <TableCell className="max-w-64 text-xs text-muted-foreground">
                    {formatCounts(item)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.workflowRunId ?? "-"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No runs recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {Math.floor(offset / pageSize) + 1}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(offset - pageSize, 0))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data?.page.hasMore || loading}
              onClick={() => setOffset(offset + pageSize)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
