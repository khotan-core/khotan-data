interface ProcessLike {
  env: Record<string, string | undefined>;
}

// Resolve the real runtime `process` global. In edge/non-Node runtimes it may
// be absent, so fall back to an empty env to keep env lookups returning
// `undefined` (matching the previous optional-chaining behavior).
const process: ProcessLike = (globalThis as { process?: ProcessLike })
  .process ?? { env: {} };

const _khotanDebug = process.env["KHOTAN_DEBUG"];

export function kd(scope: string, ...args: unknown[]) {
  if (_khotanDebug) console.log(`[khotan:${scope}]`, ...args);
}

export { process };
