import { describe, expect, it, afterEach } from "vitest";
import os from "node:os";
import { cliAuthHeader, resolveKhotanSecret } from "./cli-auth.js";
import { deriveCliToken } from "../factory.js";

describe("cli-auth", () => {
  const originalSecret = process.env["KHOTAN_SECRET"];

  afterEach(() => {
    if (originalSecret === undefined) delete process.env["KHOTAN_SECRET"];
    else process.env["KHOTAN_SECRET"] = originalSecret;
  });

  it("derives a signature the factory accepts (Node crypto === Web Crypto)", async () => {
    process.env["KHOTAN_SECRET"] = "shared-secret-value";
    const header = cliAuthHeader();
    expect(header).not.toBeNull();

    const [scheme, token] = header!.split(" ");
    expect(scheme).toBe("KhotanCLI");
    const dot = token!.indexOf(".");
    const timestamp = token!.slice(0, dot);
    const providedSig = token!.slice(dot + 1);

    const expectedSig = await deriveCliToken("shared-secret-value", timestamp);
    expect(providedSig).toBe(expectedSig);
  });

  it("formats the header as `KhotanCLI <ts>.<hex>`", () => {
    process.env["KHOTAN_SECRET"] = "abc123";
    expect(cliAuthHeader()).toMatch(/^KhotanCLI \d+\.[0-9a-f]{64}$/);
  });

  it("returns null when no secret is available", () => {
    delete process.env["KHOTAN_SECRET"];
    // Point at a directory with no .env files so file fallback finds nothing.
    expect(resolveKhotanSecret(os.tmpdir())).toBeNull();
    expect(cliAuthHeader()).toBeNull();
  });
});
