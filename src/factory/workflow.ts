import type { KhotanRunUpdate } from "./types.js";

// ---------------------------------------------------------------------------
// Workflow integration — dynamic import of workflow/api
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkflowStartFn = (
  workflowFn: (...args: any[]) => any,
  args: unknown[],
) => Promise<unknown>;

export interface WorkflowRunHandle {
  runId?: string;
  status?: Promise<string>;
  returnValue?: Promise<unknown>;
  cancel?: () => Promise<void>;
  getReadable?: (options?: {
    startIndex?: number;
    namespace?: string;
  }) => ReadableStream;
}

export type WorkflowGetRunFn = (runId: string) => WorkflowRunHandle;
export type WorkflowGetWritableFn = <T = unknown>(options?: {
  namespace?: string;
}) => WritableStream<T>;

let _workflowStart: WorkflowStartFn | null = null;
let _workflowGetRun: WorkflowGetRunFn | null = null;
let _workflowGetWritable: WorkflowGetWritableFn | null = null;

export function __setWorkflowStartForTests(
  start: WorkflowStartFn | null,
): void {
  _workflowStart = start;
}

export function __setWorkflowGetRunForTests(
  getRun: WorkflowGetRunFn | null,
): void {
  _workflowGetRun = getRun;
}

export function __setWorkflowGetWritableForTests(
  getWritable: WorkflowGetWritableFn | null,
): void {
  _workflowGetWritable = getWritable;
}

export async function importWorkflowStart(): Promise<WorkflowStartFn> {
  if (_workflowStart) return _workflowStart;
  try {
    const mod = (await import(/* webpackIgnore: true */ "workflow/api")) as {
      start: WorkflowStartFn;
    };
    _workflowStart = mod.start;
    return _workflowStart;
  } catch {
    throw new Error(
      "Failed to import workflow/api. Install Vercel Workflow: npm install workflow",
    );
  }
}

export async function importWorkflowGetRun(): Promise<WorkflowGetRunFn> {
  if (_workflowGetRun) return _workflowGetRun;
  try {
    const mod = (await import(/* webpackIgnore: true */ "workflow/api")) as {
      getRun: WorkflowGetRunFn;
    };
    _workflowGetRun = mod.getRun;
    return _workflowGetRun;
  } catch {
    throw new Error(
      "Failed to import workflow/api. Install Vercel Workflow: npm install workflow",
    );
  }
}

async function importWorkflowGetWritable(): Promise<WorkflowGetWritableFn> {
  if (_workflowGetWritable) return _workflowGetWritable;
  try {
    const mod = (await import(/* webpackIgnore: true */ "workflow")) as {
      getWritable: WorkflowGetWritableFn;
    };
    _workflowGetWritable = mod.getWritable;
    return _workflowGetWritable;
  } catch {
    throw new Error(
      "Failed to import workflow. Install Vercel Workflow: npm install workflow",
    );
  }
}

export async function sendUpdate(
  update: KhotanRunUpdate | string,
  options: { namespace?: string } = {},
): Promise<void> {
  const getWritable = await importWorkflowGetWritable();
  const writable = getWritable<string>(options);
  const writer = writable.getWriter();
  const payload =
    typeof update === "string"
      ? { type: "log", message: update }
      : { type: "progress", ...update };

  try {
    await writer.write(
      `${JSON.stringify({ ...payload, timestamp: new Date().toISOString() })}\n`,
    );
  } finally {
    writer.releaseLock();
  }
}

export function getWorkflowRunId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  if ("runId" in result) return String(result.runId);
  if ("id" in result) return String(result.id);
  return null;
}

export function getWorkflowReturnValue(result: unknown): Promise<unknown> | null {
  if (!result || typeof result !== "object" || !("returnValue" in result)) {
    return null;
  }
  const returnValue = result.returnValue;
  return returnValue &&
    typeof (returnValue as Promise<unknown>).then === "function"
    ? (returnValue as Promise<unknown>)
    : null;
}

export function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "cause" in error &&
    (error as { cause?: unknown }).cause instanceof Error
  ) {
    return (error as { cause: Error }).cause.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export function isWorkflowCancelledError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const name = typeof record["name"] === "string" ? record["name"] : "";
  const status = typeof record["status"] === "string" ? record["status"] : "";
  const message =
    typeof record["message"] === "string" ? record["message"] : "";
  return (
    name === "WorkflowRunCancelledError" ||
    status === "cancelled" ||
    message.toLowerCase().includes("cancelled")
  );
}
