// ---------------------------------------------------------------------------
// Inbound ingest builder — typed destination endpoints for app-owned routes.
// ---------------------------------------------------------------------------

export type IngestHeaders = Record<string, string>;

export interface IngestSchema<TBody> {
  parse(input: unknown): TBody;
}

export type InferIngestBody<TSchema> =
  TSchema extends IngestSchema<infer TBody> ? TBody : unknown;

export interface IngestRequestContext {
  request: Request;
  headers: IngestHeaders;
  rawBody: unknown;
}

export interface IngestResolvedContext<TBody, TOrg> {
  request: Request;
  headers: IngestHeaders;
  body: TBody;
  org: TOrg;
  idempotencyKey?: string;
  mapping(resourceId: string): IngestMappingHelper;
}

export interface IngestUnresolvedContext<TBody> {
  request: Request;
  headers: IngestHeaders;
  body: TBody;
  idempotencyKey?: string;
  reason: "org_not_found";
}

export interface IngestMappingStore {
  lookup(params: {
    resourceId: string;
    plugName: string;
    ref: string;
  }): Promise<Record<string, unknown> | null>;
  upsert(mapping: {
    resourceId: string;
    connectValue: string | string[];
    refs: Record<string, string>;
    metadata?: Record<string, unknown> | null;
  }): Promise<Record<string, unknown>>;
}

export interface IngestMappingHelper {
  lookupProviderRef(
    provider: string,
    ref: string,
  ): Promise<Record<string, unknown> | null>;
  upsertProviderRef(
    provider: string,
    ref: string,
    connectValue: string | string[],
    metadata?: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>>;
}

export interface IngestIdempotencyClaim<TResult> {
  status: "claimed" | "duplicate";
  result?: TResult;
  parked?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IngestIdempotencyStore<TBody, TOrg, TResult> {
  /**
   * Atomically reserve an idempotency key. Implement this with a unique
   * constraint in durable storage. Return `duplicate` when the key already
   * exists and the handler must not run again.
   */
  claim(
    key: string,
    ctx: {
      request: Request;
      headers: IngestHeaders;
      body: TBody;
    },
  ): Promise<IngestIdempotencyClaim<TResult>>;
  /** Persist the completed handler or unresolved-parking result for replays. */
  complete(
    key: string,
    result: TResult | undefined,
    ctx: {
      request: Request;
      headers: IngestHeaders;
      body: TBody;
      org?: TOrg;
      parked: boolean;
    },
  ): Promise<void>;
  /** Optional failure hook for marking a claimed key retryable or failed. */
  fail?(
    key: string,
    error: unknown,
    ctx: {
      request: Request;
      headers: IngestHeaders;
      body: TBody;
      org?: TOrg;
    },
  ): Promise<void>;
}

export interface IngestResponse<TResult> {
  ok: boolean;
  name: string;
  deduped: boolean;
  parked: boolean;
  result?: TResult;
  error?: string;
  code?: string;
  details?: unknown;
}

export interface IngestConfig<TBody, TOrg, TResult> {
  name: string;
  schema: IngestSchema<TBody>;
  resolveOrg(
    ctx: IngestRequestContext & { body: TBody },
  ): TOrg | null | undefined | Promise<TOrg | null | undefined>;
  idempotencyKey?(
    body: TBody,
    ctx: IngestRequestContext,
  ): string | null | undefined | Promise<string | null | undefined>;
  idempotencyStore?: IngestIdempotencyStore<TBody, TOrg, TResult>;
  mappings?: IngestMappingStore;
  onUnresolved?(
    ctx: IngestUnresolvedContext<TBody>,
  ): TResult | undefined | Promise<TResult | undefined>;
  handler(
    ctx: IngestResolvedContext<TBody, TOrg>,
    body: TBody,
  ): TResult | Promise<TResult>;
}

export interface IngestRegistration<TBody, TOrg, TResult> {
  name: string;
  handle(request: Request): Promise<Response>;
  POST(request: Request): Promise<Response>;
  config: IngestConfig<TBody, TOrg, TResult>;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

function headersToRecord(headers: Headers): IngestHeaders {
  const out: IngestHeaders = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function parseRequestBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return request.json();
  }
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createMappingHelper(
  resourceId: string,
  store: IngestMappingStore | undefined,
): IngestMappingHelper {
  if (!store) {
    throw new Error(
      "Ingest mapping helpers require `mappings` on the ingest config",
    );
  }

  return {
    lookupProviderRef(provider: string, ref: string) {
      return store.lookup({ resourceId, plugName: provider, ref });
    },
    upsertProviderRef(
      provider: string,
      ref: string,
      connectValue: string | string[],
      metadata?: Record<string, unknown> | null,
    ) {
      return store.upsert({
        resourceId,
        connectValue,
        refs: { [provider]: ref },
        ...(metadata !== undefined ? { metadata } : {}),
      });
    },
  };
}

export function ingest<TSchema extends IngestSchema<unknown>, TOrg, TResult>(
  config: IngestConfig<InferIngestBody<TSchema>, TOrg, TResult> & {
    schema: TSchema;
  },
): IngestRegistration<InferIngestBody<TSchema>, TOrg, TResult> {
  type TBody = InferIngestBody<TSchema>;

  async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return jsonResponse(
        {
          ok: false,
          name: config.name,
          deduped: false,
          parked: false,
          code: "method_not_allowed",
          error: "Ingest endpoints only accept POST requests",
        } satisfies IngestResponse<TResult>,
        { status: 405, headers: { Allow: "POST" } },
      );
    }

    const headers = headersToRecord(request.headers);
    let rawBody: unknown;
    let body: TBody;

    try {
      rawBody = await parseRequestBody(request);
      body = config.schema.parse(rawBody);
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          name: config.name,
          deduped: false,
          parked: false,
          code: "invalid_body",
          error: "Request body did not match the ingest schema",
          details: getErrorMessage(error),
        } satisfies IngestResponse<TResult>,
        { status: 400 },
      );
    }

    const requestCtx: IngestRequestContext = { request, headers, rawBody };
    const idempotencyKey = await config.idempotencyKey?.(body, requestCtx);
    const key = idempotencyKey?.trim();

    if (key && !config.idempotencyStore) {
      return jsonResponse(
        {
          ok: false,
          name: config.name,
          deduped: false,
          parked: false,
          code: "missing_idempotency_store",
          error:
            "This ingest declares idempotencyKey but no idempotencyStore was configured",
        } satisfies IngestResponse<TResult>,
        { status: 500 },
      );
    }

    if (key && config.idempotencyStore) {
      const claim = await config.idempotencyStore.claim(key, {
        request,
        headers,
        body,
      });
      if (claim.status === "duplicate") {
        return jsonResponse({
          ok: true,
          name: config.name,
          deduped: true,
          parked: claim.parked ?? false,
          ...(claim.result !== undefined ? { result: claim.result } : {}),
        } satisfies IngestResponse<TResult>);
      }
    }

    let org: TOrg | null | undefined;
    try {
      org = await config.resolveOrg({ ...requestCtx, body });
    } catch (error) {
      if (key) {
        await config.idempotencyStore?.fail?.(key, error, {
          request,
          headers,
          body,
        });
      }
      return jsonResponse(
        {
          ok: false,
          name: config.name,
          deduped: false,
          parked: false,
          code: "org_resolution_failed",
          error: getErrorMessage(error),
        } satisfies IngestResponse<TResult>,
        { status: 500 },
      );
    }

    if (org === null || org === undefined) {
      if (!config.onUnresolved) {
        const result = {
          ok: false,
          name: config.name,
          deduped: false,
          parked: false,
          code: "org_not_found",
          error:
            "resolveOrg returned no org and no onUnresolved parking hook is configured",
        } satisfies IngestResponse<TResult>;
        if (key) {
          await config.idempotencyStore?.fail?.(key, result.error, {
            request,
            headers,
            body,
          });
        }
        return jsonResponse(result, { status: 422 });
      }

      try {
        const parkedResult = await config.onUnresolved({
          request,
          headers,
          body,
          ...(key ? { idempotencyKey: key } : {}),
          reason: "org_not_found",
        });
        if (key) {
          await config.idempotencyStore?.complete(key, parkedResult, {
            request,
            headers,
            body,
            parked: true,
          });
        }
        const responseBody = {
          ok: true,
          name: config.name,
          deduped: false,
          parked: true,
          ...(parkedResult !== undefined ? { result: parkedResult } : {}),
        } satisfies IngestResponse<TResult>;
        return jsonResponse(responseBody, { status: 202 });
      } catch (error) {
        if (key) {
          await config.idempotencyStore?.fail?.(key, error, {
            request,
            headers,
            body,
          });
        }
        return jsonResponse(
          {
            ok: false,
            name: config.name,
            deduped: false,
            parked: false,
            code: "unresolved_parking_failed",
            error: getErrorMessage(error),
          } satisfies IngestResponse<TResult>,
          { status: 500 },
        );
      }
    }

    try {
      const ctx: IngestResolvedContext<TBody, TOrg> = {
        request,
        headers,
        body,
        org,
        ...(key ? { idempotencyKey: key } : {}),
        mapping(resourceId: string) {
          return createMappingHelper(resourceId, config.mappings);
        },
      };
      const result = await config.handler(ctx, body);
      if (key) {
        await config.idempotencyStore?.complete(key, result, {
          request,
          headers,
          body,
          org,
          parked: false,
        });
      }
      return jsonResponse({
        ok: true,
        name: config.name,
        deduped: false,
        parked: false,
        result,
      } satisfies IngestResponse<TResult>);
    } catch (error) {
      if (key) {
        await config.idempotencyStore?.fail?.(key, error, {
          request,
          headers,
          body,
          org,
        });
      }
      return jsonResponse(
        {
          ok: false,
          name: config.name,
          deduped: false,
          parked: false,
          code: "handler_failed",
          error: getErrorMessage(error),
        } satisfies IngestResponse<TResult>,
        { status: 500 },
      );
    }
  }

  return {
    name: config.name,
    config,
    handle,
    POST: handle,
  };
}
