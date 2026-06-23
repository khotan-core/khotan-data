// ---------------------------------------------------------------------------
// Batteries-included lifecycle hook helpers for flow variants.
// ---------------------------------------------------------------------------

import type { FlowHook } from "./types.js";

/**
 * Build a flow lifecycle hook that POSTs a compact JSON message to a Slack
 * incoming webhook. Wire it onto a variant's `onError` / `onComplete`:
 *
 * ```ts
 * variants: {
 *   healthcheck: {
 *     schedule: "0 6 * * *",
 *     onError: slackNotifier(process.env.SLACK_WEBHOOK_URL!),
 *   },
 * }
 * ```
 *
 * The hook never throws: a failed POST is swallowed (and logged) so it can
 * never change the recorded run status.
 */
export function slackNotifier(webhookUrl: string): FlowHook {
  return async (ctx, run) => {
    const emoji =
      run.status === "completed"
        ? ":white_check_mark:"
        : run.status === "partial"
          ? ":warning:"
          : ":x:";

    const counts = [
      run.extracted ? `extracted ${String(run.extracted)}` : null,
      run.transformed ? `transformed ${String(run.transformed)}` : null,
      run.created ? `created ${String(run.created)}` : null,
      run.updated ? `updated ${String(run.updated)}` : null,
      run.deleted ? `deleted ${String(run.deleted)}` : null,
      run.failed ? `failed ${String(run.failed)}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const lines = [
      `${emoji} *${ctx.flow.name}* (${ctx.variant}) — ${run.status}`,
      counts ? `Counts: ${counts}` : null,
      run.error ? `Error: ${run.error}` : null,
    ].filter(Boolean);

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: lines.join("\n"),
        flow: ctx.flow.name,
        plug: ctx.flow.plugName,
        variant: run.variant,
        status: run.status,
        durationMs: run.durationMs,
        extracted: run.extracted,
        transformed: run.transformed,
        created: run.created,
        updated: run.updated,
        deleted: run.deleted,
        skipped: run.skipped,
        failed: run.failed,
        error: run.error,
      }),
    });
  };
}
