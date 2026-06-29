import { describe, expect, it } from "vitest";
import { verifyHmacSha256 } from "./crypto.js";

describe("verifyHmacSha256", () => {
  it("verifies hex digests with an optional prefix", async () => {
    await expect(
      verifyHmacSha256(
        "hello",
        "sha256=88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b",
        "secret",
        { digest: "hex", prefix: "sha256=" },
      ),
    ).resolves.toBe(true);
  });

  it("verifies base64 digests and comma-separated fallback headers", async () => {
    await expect(
      verifyHmacSha256(
        "hello",
        "bad-signature, iKqz7ejTrflNJquQ07r9SiCDBww7zOnAFO4EpEOEfAs=",
        "secret",
        { digest: "base64" },
      ),
    ).resolves.toBe(true);
  });

  it("rejects missing or mismatched signatures", async () => {
    await expect(
      verifyHmacSha256("hello", "sha256=bad", "secret", {
        digest: "hex",
        prefix: "sha256=",
      }),
    ).resolves.toBe(false);
    await expect(verifyHmacSha256("hello", null, "secret")).resolves.toBe(
      false,
    );
  });
});
