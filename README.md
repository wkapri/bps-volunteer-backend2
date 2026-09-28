# bps-volunteer-backend2

Apps Script port of `bps-volunteer-backend` — replaces the GitHub Actions
hourly cron with a Google Apps Script time trigger + web app, hosted free
under the school's Google Workspace. See `bps-volunteer-ui/DESIGN.md` for the
overall design and `data.json` contract; this repo only changes *where* it's
computed and served, not the shape.

## Files (`src/`, pushed via clasp)

- `Code.js` — entry point: `run()` (trigger), `doGet()` (web app), `setupTrigger()`, `selfTest_()`.
- `SugClient.js` — key-based SignUpGenius API (port of `sugClient.ts`).
- `PublicSignupApi.js` — keyless public sign-up sheet endpoint (port of `publicSignupApi.ts`).
- `Canteen.js` / `Events.js` — same logic as the Node backend's `canteen.ts` / `events.ts`.
- `Utils.js` — `numbers.ts` + `status.ts` + date math (no Luxon; "noon UTC" trick for calendar-day arithmetic, `Utilities.formatDate` for anything timezone-real).

No ajv/schema validation — no npm in Apps Script. Trust the hand-written builders instead (same as the Node backend did for years before ajv was added).

## Durability

`run()` only overwrites `PropertiesService` on full success. If SignUpGenius is down or the key expires, the trigger just fails silently (logged) and `doGet()` keeps serving the last good payload indefinitely — same "never overwrite good data with a failed run" rule as DESIGN.md 4.3.

## Setup

1. `clasp login`, then `clasp clone <scriptId>` (or `clasp create --type webapp`) into this repo so `.clasp.json` points at your Apps Script project.
2. `clasp push`.
3. In the Apps Script editor — Project Settings → Script Properties:
   - `SUG_API_KEY` (required)
   - `CANTEEN_TITLE_PREFIX` (optional, default `"Canteen Volunteer"`)
   - `CANTEEN_SIGNUP_ID` (optional numeric override)
4. Run `setupTrigger` once manually from the editor (installs the hourly trigger).
5. Run `selfTest_` once manually to sanity-check date/parsing logic in the real Apps Script runtime.
6. Deploy → New deployment → Web app → Execute as "Me", who has access "Anyone". Copy the `/exec` URL — that's `VITE_DATA_URL` for `bps-volunteer-ui`.
7. **Code changes later:** Manage deployments → Edit → new version. Not "New deployment" — that changes the URL.

## Open item

Apps Script web-app JSON responses are commonly fetched cross-origin from browsers in practice, but CORS behavior on this exact setup hasn't been verified yet — test with a real cross-origin `fetch()` from the deployed Firebase site before cutting over.
