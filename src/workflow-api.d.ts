declare module "workflow/api" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function start(workflowFn: (...args: any[]) => any, args: unknown[]): Promise<unknown>;
}
