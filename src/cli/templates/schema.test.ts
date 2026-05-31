import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  khotanPlugs,
  khotanSyncs,
  khotanRuns,
  khotanPlugsRelations,
  khotanSyncsRelations,
  khotanRunsRelations,
} from "./schema.js";
import type {
  KhotanPlug,
  NewKhotanPlug,
  KhotanSync,
  NewKhotanSync,
  KhotanRun,
  NewKhotanRun,
} from "./schema.js";
import fs from "node:fs";
import path from "node:path";

describe("schema template", () => {
  describe("tables", () => {
    it("exports khotanPlugs table", () => {
      expect(khotanPlugs).toBeDefined();
      expect(getTableName(khotanPlugs)).toBe("khotan_plugs");
    });

    it("exports khotanSyncs table", () => {
      expect(khotanSyncs).toBeDefined();
      expect(getTableName(khotanSyncs)).toBe("khotan_syncs");
    });

    it("exports khotanRuns table", () => {
      expect(khotanRuns).toBeDefined();
      expect(getTableName(khotanRuns)).toBe("khotan_runs");
    });
  });

  describe("khotanPlugs columns", () => {
    it("has all required columns", () => {
      const columns = Object.keys(khotanPlugs);
      expect(columns).toContain("id");
      expect(columns).toContain("name");
      expect(columns).toContain("baseUrl");
      expect(columns).toContain("authType");
      expect(columns).toContain("enabled");
      expect(columns).toContain("status");
      expect(columns).toContain("statusMessage");
      expect(columns).toContain("encryptedCredentials");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });
  });

  describe("khotanSyncs columns", () => {
    it("has all required columns", () => {
      const columns = Object.keys(khotanSyncs);
      expect(columns).toContain("id");
      expect(columns).toContain("plugId");
      expect(columns).toContain("name");
      expect(columns).toContain("type");
      expect(columns).toContain("enabled");
      expect(columns).toContain("schedule");
      expect(columns).toContain("lastRunAt");
      expect(columns).toContain("lastRunStatus");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });
  });

  describe("khotanRuns columns", () => {
    it("has all required columns", () => {
      const columns = Object.keys(khotanRuns);
      expect(columns).toContain("id");
      expect(columns).toContain("syncId");
      expect(columns).toContain("runType");
      expect(columns).toContain("status");
      expect(columns).toContain("startedAt");
      expect(columns).toContain("completedAt");
      expect(columns).toContain("durationMs");
      expect(columns).toContain("extracted");
      expect(columns).toContain("transformed");
      expect(columns).toContain("created");
      expect(columns).toContain("updated");
      expect(columns).toContain("deleted");
      expect(columns).toContain("failed");
      expect(columns).toContain("error");
      expect(columns).toContain("metadata");
    });
  });

  describe("relations", () => {
    it("exports plugs relations", () => {
      expect(khotanPlugsRelations).toBeDefined();
    });

    it("exports syncs relations", () => {
      expect(khotanSyncsRelations).toBeDefined();
    });

    it("exports runs relations", () => {
      expect(khotanRunsRelations).toBeDefined();
    });
  });

  describe("type helpers compile", () => {
    it("KhotanPlug and NewKhotanPlug types exist", () => {
      const _plug: KhotanPlug = {} as KhotanPlug;
      const _newPlug: NewKhotanPlug = {} as NewKhotanPlug;
      expect(_plug).toBeDefined();
      expect(_newPlug).toBeDefined();
    });

    it("KhotanSync and NewKhotanSync types exist", () => {
      const _sync: KhotanSync = {} as KhotanSync;
      const _newSync: NewKhotanSync = {} as NewKhotanSync;
      expect(_sync).toBeDefined();
      expect(_newSync).toBeDefined();
    });

    it("KhotanRun and NewKhotanRun types exist", () => {
      const _run: KhotanRun = {} as KhotanRun;
      const _newRun: NewKhotanRun = {} as NewKhotanRun;
      expect(_run).toBeDefined();
      expect(_newRun).toBeDefined();
    });
  });

  describe("self-contained", () => {
    it("has no imports from khotan-data", () => {
      const content = fs.readFileSync(
        path.resolve(__dirname, "schema.ts"),
        "utf-8",
      );
      expect(content).not.toContain('from "khotan-data"');
      expect(content).not.toContain("from 'khotan-data'");
      expect(content).not.toContain('from "khotan-data/');
      expect(content).not.toContain("from 'khotan-data/");
    });

    it("only imports from drizzle-orm", () => {
      const content = fs.readFileSync(
        path.resolve(__dirname, "schema.ts"),
        "utf-8",
      );
      const importStatements = content.match(
        /import\s[\s\S]*?from\s+["'][^"']+["']/g,
      );
      expect(importStatements).not.toBeNull();
      for (const stmt of importStatements!) {
        const source = stmt.match(/from\s+["']([^"']+)["']/)?.[1];
        expect(
          source?.startsWith("drizzle-orm"),
          `Import should be from drizzle-orm: ${stmt.replace(/\n/g, " ")}`,
        ).toBe(true);
      }
    });
  });
});
