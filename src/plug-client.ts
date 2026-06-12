// ---------------------------------------------------------------------------
// Schema interface — works with zod v3, v4, or any validator with .parse()
// ---------------------------------------------------------------------------

export interface Schema<TOutput = unknown, TInput = unknown> {
  parse(data: unknown): TOutput;
  _input?: TInput;
  _output?: TOutput;
}

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Schema;
  body?: Schema;
  pathParams?: Schema;
  responses: Record<number, Schema>;
}

export interface ContractRouter {
  [key: string]: RouteDefinition | ContractRouter;
}

// ---------------------------------------------------------------------------
// Type-level utilities
// ---------------------------------------------------------------------------

type SchemaInput<T> = T extends Schema<unknown, infer I> ? I : never;
type SchemaOutput<T> = T extends Schema<infer O> ? O : never;

type PathParams<T extends string> =
  T extends `${string}:${infer Param}/${infer Rest}`
    ? Record<Param | keyof PathParams<Rest>, string>
    : T extends `${string}:${infer Param}`
      ? Record<Param, string>
      : never;

type HasKeys<T> = keyof T extends never ? false : true;

type EndpointInput<TRoute extends RouteDefinition> = (HasKeys<
  PathParams<TRoute["path"]>
> extends true
  ? { params: PathParams<TRoute["path"]> }
  : { params?: never }) &
  (TRoute extends { query: Schema }
    ? { query: SchemaInput<TRoute["query"]> }
    : { query?: never }) &
  (TRoute extends { body: Schema }
    ? { body: SchemaInput<TRoute["body"]> }
    : { body?: never }) & {
    headers?: Record<string, string>;
    validateResponse?: boolean;
  };

type ResponseSchemas<TRoute extends RouteDefinition> = {
  [K in keyof TRoute["responses"]]: K extends number
    ? { status: K; body: SchemaOutput<TRoute["responses"][K]> }
    : never;
}[keyof TRoute["responses"]];

type PlugClient<T extends ContractRouter> = {
  [K in keyof T]: T[K] extends RouteDefinition
    ? HasKeys<PathParams<T[K]["path"]>> extends true
      ? (input: EndpointInput<T[K]>) => Promise<ResponseSchemas<T[K]>>
      : T[K] extends { query: Schema }
        ? (input: EndpointInput<T[K]>) => Promise<ResponseSchemas<T[K]>>
        : T[K] extends { body: Schema }
          ? (input: EndpointInput<T[K]>) => Promise<ResponseSchemas<T[K]>>
          : (input?: EndpointInput<T[K]>) => Promise<ResponseSchemas<T[K]>>
    : T[K] extends ContractRouter
      ? PlugClient<T[K]>
      : never;
};

// ---------------------------------------------------------------------------
// defineContract — type-narrowing identity function
// ---------------------------------------------------------------------------

export function defineContract<const T extends ContractRouter>(contract: T): T {
  return contract;
}

// ---------------------------------------------------------------------------
// PlugLike interface
// ---------------------------------------------------------------------------

/**
 * Minimal interface expected from a Plug instance.
 * Matches the scaffolded Plug class's public API.
 */
export interface PlugLike {
  request<T>(
    method: string,
    path: string,
    options?: {
      params?: Record<string, unknown>;
      body?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<T>;
}

export interface PlugClientOptions {
  validateResponse?: boolean;
}

// ---------------------------------------------------------------------------
// PlugError detection — works without importing the user's PlugError class
// ---------------------------------------------------------------------------

interface PlugErrorLike {
  name: string;
  status: number;
  body: unknown;
}

function isPlugError(err: unknown): err is PlugErrorLike {
  return (
    err instanceof Error &&
    "status" in err &&
    typeof (err as unknown as PlugErrorLike).status === "number" &&
    "body" in err
  );
}

function parseBody(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

// ---------------------------------------------------------------------------
// Path interpolation
// ---------------------------------------------------------------------------

function interpolatePath(path: string, params: Record<string, string>): string {
  return path.replace(/:([^/]+)/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter: "${key}"`);
    }
    return encodeURIComponent(value);
  });
}

// ---------------------------------------------------------------------------
// createPlugClient
// ---------------------------------------------------------------------------

export function createPlugClient<T extends ContractRouter>(
  contract: T,
  plug: PlugLike,
  options?: PlugClientOptions,
): PlugClient<T> {
  const globalValidateResponse = options?.validateResponse ?? true;

  function buildClient(router: ContractRouter): Record<string, unknown> {
    const client: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(router)) {
      const route = value;

      if ("method" in route && "path" in route) {
        client[key] = async (input?: Record<string, unknown>) => {
          const def = route as RouteDefinition;
          const params = (input?.["params"] ?? {}) as Record<string, string>;
          const query = input?.["query"] as Record<string, unknown> | undefined;
          const body = input?.["body"];
          const headers = input?.["headers"] as
            | Record<string, string>
            | undefined;
          const shouldValidateResponse =
            (input?.["validateResponse"] as boolean | undefined) ??
            globalValidateResponse;

          if (def.pathParams) {
            def.pathParams.parse(params);
          }
          if (def.query && query !== undefined) {
            def.query.parse(query);
          }
          if (def.body && body !== undefined) {
            def.body.parse(body);
          }

          const interpolatedPath = interpolatePath(def.path, params);
          const responses = def.responses;

          try {
            const responseBody = await plug.request<unknown>(
              def.method,
              interpolatedPath,
              {
                ...(query !== undefined ? { params: query } : {}),
                ...(body !== undefined ? { body } : {}),
                ...(headers !== undefined ? { headers } : {}),
              },
            );

            const status = 200;
            if (!responses[status]) {
              return { status, body: responseBody };
            }

            if (shouldValidateResponse) {
              const validated = responses[status].parse(responseBody);
              return { status, body: validated };
            }

            return { status, body: responseBody };
          } catch (err) {
            if (!isPlugError(err)) throw err;

            const status = err.status;
            if (responses[status]) {
              const parsed = parseBody(err.body);
              if (shouldValidateResponse) {
                const validated = responses[status].parse(parsed);
                return { status, body: validated };
              }
              return { status, body: parsed };
            }

            throw err;
          }
        };
      } else {
        client[key] = buildClient(route);
      }
    }

    return client;
  }

  return buildClient(contract) as PlugClient<T>;
}
