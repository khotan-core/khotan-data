import { describe, expect, it, vi } from "vitest";
import { createDedupKey, retry, stableStringify } from "./retry.js";

describe("retry", () => {
  it("retries until the operation succeeds", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValue("ok");
    const onRetry = vi.fn();

    await expect(
      retry(operation, { attempts: 3, baseDelayMs: 0, onRetry }),
    ).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, nextDelayMs: 0 }),
    );
  });

  it("stops when shouldRetry rejects an error", async () => {
    const error = new Error("do not retry");
    const operation = vi.fn(async () => {
      throw error;
    });

    await expect(
      retry(operation, {
        attempts: 3,
        baseDelayMs: 0,
        shouldRetry: () => false,
      }),
    ).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe("dedup keys", () => {
  it("stable-stringifies object keys before hashing", async () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');

    await expect(
      createDedupKey({ b: 2, a: 1 }, { prefix: "evt" }),
    ).resolves.toBe(
      "evt:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
  });
});
