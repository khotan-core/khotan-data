declare module "workflow/api" {
  export function start(
    workflowFn: (...args: never[]) => unknown,
    args: unknown[],
  ): Promise<unknown>;
  export function getRun(runId: string): {
    status: Promise<string>;
    returnValue: Promise<unknown>;
    cancel(): Promise<void>;
    getReadable(options?: {
      startIndex?: number;
      namespace?: string;
    }): ReadableStream;
  };
}

declare module "workflow" {
  export function getWritable<T = unknown>(options?: {
    namespace?: string;
  }): WritableStream<T>;
}
