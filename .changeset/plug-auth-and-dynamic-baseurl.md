---
"khotan-data": minor
---

feat(plug): form-encoded token bodies, vars-aware auth, and per-environment baseUrl

Three improvements to the generated `plug.ts` client, addressing connector friction:

- **`tokenExchange` honors pre-encoded token bodies.** A `string` or `URLSearchParams` body from `buildTokenRequest` is now sent verbatim with the `Content-Type` you set, so OAuth2 endpoints requiring `application/x-www-form-urlencoded` (`grant_type=client_credentials`) work without hand-rolling an `AuthStrategy`. Plain object bodies are still JSON-encoded as before.
- **Auth strategies receive the plug's bound vars.** `AuthStrategy.apply(headers, vars?)` and `custom((headers, vars) => …)` now get the decrypted plug variables for the run, so a custom strategy can read credentials without lazy-importing the factory.
- **`baseUrl` can be a function of vars.** Pass `baseUrl: (vars) => …` for per-environment / per-tenant hosts resolved at request time. Because the debug/probe route binds the same vars, it targets the same host a flow would — closing the probe/flow divergence. A static `string` baseUrl is unchanged.
