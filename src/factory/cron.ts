import { process } from "./debug.js";

// ---------------------------------------------------------------------------
// Cron parsing
// ---------------------------------------------------------------------------

interface CronFieldSpec {
  min: number;
  max: number;
  aliases?: Record<string, number>;
}

const CRON_MONTH_ALIASES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const CRON_DAY_ALIASES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export function parseCronValue(token: string, spec: CronFieldSpec): number {
  const normalized = token.trim().toLowerCase();
  if (normalized === "") {
    throw new Error("Cron token cannot be empty");
  }

  if (spec.aliases?.[normalized] !== undefined) {
    return spec.aliases[normalized];
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid cron token: "${token}"`);
  }

  if (spec.aliases === CRON_DAY_ALIASES && parsed === 7) {
    return 0;
  }

  if (parsed < spec.min || parsed > spec.max) {
    throw new Error(
      `Cron value "${token}" is out of range ${String(spec.min)}-${String(spec.max)}`,
    );
  }

  return parsed;
}

function cronFieldIsWildcard(field: string): boolean {
  return field.trim() === "*";
}

export function matchesCronField(
  field: string,
  value: number,
  spec: CronFieldSpec,
): boolean {
  return field
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      if (part === "*") return true;

      const [baseRaw, stepRaw] = part.split("/");
      const base = baseRaw?.trim() ?? "";
      const step = stepRaw ? Number.parseInt(stepRaw.trim(), 10) : 1;

      if (!Number.isFinite(step) || step <= 0) {
        throw new Error(`Invalid cron step: "${part}"`);
      }

      let start: number;
      let end: number;

      if (base === "*" || base === "") {
        start = spec.min;
        end = spec.max;
      } else if (base.includes("-")) {
        const [startRaw, endRaw] = base.split("-");
        start = parseCronValue(startRaw ?? "", spec);
        end = parseCronValue(endRaw ?? "", spec);
        if (end < start) {
          throw new Error(`Invalid cron range: "${part}"`);
        }
      } else {
        start = parseCronValue(base, spec);
        end = stepRaw ? spec.max : start;
      }

      if (value < start || value > end) return false;
      return (value - start) % step === 0;
    });
}

export function matchesCronSchedule(schedule: string, now: Date): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron schedule must have 5 fields: "${schedule}"`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const minuteMatch = matchesCronField(minute!, now.getUTCMinutes(), {
    min: 0,
    max: 59,
  });
  const hourMatch = matchesCronField(hour!, now.getUTCHours(), {
    min: 0,
    max: 23,
  });
  const monthMatch = matchesCronField(month!, now.getUTCMonth() + 1, {
    min: 1,
    max: 12,
    aliases: CRON_MONTH_ALIASES,
  });
  const dayOfMonthMatch = matchesCronField(dayOfMonth!, now.getUTCDate(), {
    min: 1,
    max: 31,
  });
  const dayOfWeekMatch = matchesCronField(dayOfWeek!, now.getUTCDay(), {
    min: 0,
    max: 6,
    aliases: CRON_DAY_ALIASES,
  });

  const dayOfMonthWildcard = cronFieldIsWildcard(dayOfMonth!);
  const dayOfWeekWildcard = cronFieldIsWildcard(dayOfWeek!);
  const dayMatches =
    dayOfMonthWildcard && dayOfWeekWildcard
      ? true
      : dayOfMonthWildcard
        ? dayOfWeekMatch
        : dayOfWeekWildcard
          ? dayOfMonthMatch
          : dayOfMonthMatch || dayOfWeekMatch;

  return minuteMatch && hourMatch && monthMatch && dayMatches;
}

export function startOfUtcMinute(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      0,
      0,
    ),
  );
}

export function isCronRequestAuthorized(request: Request): boolean {
  const secret = process.env["CRON_SECRET"]?.trim();
  if (!secret) {
    return process.env["NODE_ENV"] !== "production";
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Debug routes (and the `plug`/`probe` CLI) are only available when
 * `KHOTAN_DEBUG` is set AND the app is not running in production.
 */
export function isDebugEnabled(): boolean {
  return (
    Boolean(process.env["KHOTAN_DEBUG"]) &&
    process.env["NODE_ENV"] !== "production"
  );
}
