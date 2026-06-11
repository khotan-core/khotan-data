## 1. Catch Template

- [x] 1.1 Create `src/cli/templates/catch.ts` with CatchContext interface, CatchWorkflow type, CatchRegistration type, and `catchEvent()` builder function
- [x] 1.2 Add commented usage example showing a complete catch workflow with `"use workflow"` and `"use step"` directives persisting to a Drizzle table
- [x] 1.3 Add `catch` entry to CLI registry in `src/cli/registry.ts` with `requires: ["wire"]` and output to `webhooks/catch.ts`

## 2. Pass Template

- [x] 2.1 Create `src/cli/templates/pass.ts` with PassContext interface, PassWorkflow type, PassRegistration type, and `pass()` builder function
- [x] 2.2 Add commented usage example showing a complete pass workflow constructing a destination plug from `destVars` and forwarding an event
- [x] 2.3 Add `pass` entry to CLI registry in `src/cli/registry.ts` with `requires: ["wire", "plug"]` and output to `webhooks/pass.ts`

## 3. Factory: Config Types

- [x] 3.1 Add `catches?: CatchRegistration[]` and `passes?: PassRegistration[]` to the plug registration type in `src/factory.ts`
- [x] 3.2 Add config-time validation: passes reference existing plug names; catches/passes require wire with `onVerify`

## 4. Factory: Webhook Route

- [x] 4.1 Add `POST /webhook/:plugName` route handler in the factory's request dispatcher
- [x] 4.2 Implement raw body capture (read as text before JSON parse)
- [x] 4.3 Implement wire lookup and `onVerify` call with headers, raw body, and decrypted wireVars
- [x] 4.4 On verification success: parse JSON, extract eventType from payload
- [x] 4.5 Start catch workflows via `start()` from `workflow/api` with CatchContext
- [x] 4.6 Start pass workflows via `start()` — read destination plug vars, include as `destVars` in PassContext
- [x] 4.7 Return `{ received: true }` with status 200 after starting all workflows

## 5. Wire: onVerify Integration

- [x] 5.1 Update Wire template `WireVerifyContext` type to match spec: `headers` (Record<string, string>), `body` (string — raw text), `wireVars` (Record<string, string>)
- [x] 5.2 Ensure factory passes decrypted wireVars when calling `onVerify`

## 6. Dependencies

- [x] 6.1 Add `workflow` as a peer dependency in `package.json`
- [x] 6.2 Add dynamic import of `workflow/api` in factory (graceful error if not installed and catches/passes are registered)

## 7. Test in brs-khotan-connector

- [ ] 7.1 Install Vercel Workflow DevKit in test app
- [ ] 7.2 Add `onVerify` to the existing `pollinateWire` definition
- [ ] 7.3 Scaffold catch template: `npx khotan add catch`
- [ ] 7.4 Create `pollinate-catch.ts` workflow that persists events to a Drizzle table
- [ ] 7.5 Register `pollinateCatch` in `khotan.ts` on the pollinate plug config
- [ ] 7.6 Test: send a signed POST to `/api/khotan/webhook/pollinate` and verify event is persisted
- [ ] 7.7 (Optional) Create a pass workflow forwarding to another plug and verify delivery
