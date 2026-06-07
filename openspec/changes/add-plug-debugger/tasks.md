## 1. Backend Debug Route

- [x] 1.1 Add `POST /api/khotan/debug/:plugName` route to factory handler, gated behind `KHOTAN_DEBUG`
- [x] 1.2 Implement request proxy: parse incoming `{ method, path, body, params, headers }`, fire through `plug.request()`, measure timing
- [x] 1.3 Return structured response: `{ status, statusText, headers, body, timing, endpoint? }`
- [x] 1.4 On plug error, return the error details (status, body) with HTTP 200 wrapper so the UI always gets data
- [x] 1.5 Match request path+method against registered typed endpoints and include metadata if found

## 2. UI Component

- [x] 2.1 Create `plug-debugger.tsx` template with plug selector, method dropdown, path input, body/params editors
- [x] 2.2 Display response panel: status badge, timing, collapsible headers, formatted JSON body
- [x] 2.3 Show typed endpoint dropdown (if available) that auto-fills method + path on selection
- [x] 2.4 Gate rendering behind a debug check (hide component entirely if debug route returns 404)

## 3. CLI Scaffolding

- [ ] 3.1 Add `plug-debugger` entry to CLI registry with template path and output config
- [ ] 3.2 Update `tsup.config.ts` to copy `plug-debugger.tsx` to `dist/templates`

## 4. Testing

- [ ] 4.1 Add factory test: debug route returns 404 when `KHOTAN_DEBUG` is unset
- [ ] 4.2 Add factory test: debug route proxies a GET request and returns timing + response
- [ ] 4.3 Add factory test: debug route handles plug errors gracefully
- [ ] 4.4 Build, pack, verify no regressions
