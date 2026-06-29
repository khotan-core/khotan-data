import { Command } from "commander";
import { loadEnvFileIntoProcess, output, fail } from "../cli-api.js";

interface WhoamiOptions {
  assertOrg?: string;
  envFile?: string;
  orgId?: string;
}

function readGlobalOptions(command: Command): {
  envFile?: string;
  orgId?: string;
} {
  const opts = command.optsWithGlobals<{
    envFile?: string;
    orgId?: string;
  }>();
  return {
    ...(opts.envFile ? { envFile: opts.envFile } : {}),
    ...(opts.orgId ? { orgId: opts.orgId } : {}),
  };
}

export const whoamiCommand = new Command("whoami")
  .description("Show the local Khotan CLI identity and assert org pins")
  .option("--assert-org <id>", "Fail unless the resolved org id matches")
  .option("--env-file <path>", "Load environment values before resolving org")
  .option("--org-id <id>", "Override KHOTAN_ORG_ID for this invocation")
  .action((opts: WhoamiOptions, command: Command) => {
    const globals = readGlobalOptions(command);
    const envFile = opts.envFile ?? globals.envFile;
    if (envFile) {
      loadEnvFileIntoProcess(envFile);
    }

    const orgId = opts.orgId ?? globals.orgId ?? process.env["KHOTAN_ORG_ID"];
    if (opts.assertOrg && orgId !== opts.assertOrg) {
      fail(
        "org_mismatch",
        orgId
          ? `Resolved org "${orgId}" does not match expected org "${opts.assertOrg}".`
          : `No org id resolved. Set KHOTAN_ORG_ID, pass --org-id, or use --env-file before asserting "${opts.assertOrg}".`,
      );
    }

    output({
      ok: true,
      organizationId: orgId ?? null,
      assertedOrganizationId: opts.assertOrg ?? null,
      source:
        (opts.orgId ?? globals.orgId) ? "flag" : orgId ? "environment" : null,
    });
  });
