"use client";

import { KhotanRunsTable } from "./runs-table";
import { KhotanWebhookEventsTable } from "./webhook-events-table";

export function KhotanLogs({ pageSize = 10 }: { pageSize?: number } = {}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Khotan Logs</h2>
        <p className="text-sm text-muted-foreground">
          Inspect recent flow runs and inbound webhook activity in one place.
        </p>
      </div>

      <KhotanRunsTable pageSize={pageSize} />
      <KhotanWebhookEventsTable pageSize={pageSize} />
    </div>
  );
}
