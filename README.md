# bps-volunteer-backend2

Fetches canteen + event data from SignUpGenius on a Google Apps Script time
trigger and serves it as JSON via a web app, hosted under the P&C's Google
Workspace. See `bps-volunteer-ui/DESIGN.md` for the overall design and
`data.json` contract.

## Files (`src/`, pushed via clasp)

- `Code.js` — entry point: `run()` (trigger), `doGet()` (web app), `setupTrigger()`, `selfTest_()`.
- `SugClient.js` — key-based SignUpGenius API (`/signups/created/active/`, `/signups/report/all/{id}/`).
- `PublicSignupApi.js` — keyless public sign-up sheet endpoint (preferred source for counts — no names).
- `Canteen.js` / `Events.js` — canteen day-range + status logic, event list building.
- `Notify.js` — nightly canteen volunteer summary email (names + contact info, `sendCanteenSummary`, `setupNotifyTrigger`). Not installed by default — run `setupNotifyTrigger` once if you want it automated.
- `Utils.js` — count coercion, status thresholds, date math (no Luxon; "noon UTC" trick for calendar-day arithmetic, `Utilities.formatDate` for anything timezone-real).

Canteen and event sign-ups are both resolved automatically every run — the canteen one by title prefix (`CANTEEN_TITLE_PREFIX`, default `"Canteen Volunteer"`) against the live active sign-ups list, everything else treated as an event. A new term's canteen sign-up or a new event is picked up on the next hourly run with zero config changes. If several sign-ups match the prefix (next term created early), the current one is used — earliest start among those not yet finished — and the others are hidden from the events list until their turn.

## Durability

`run()` only overwrites `PropertiesService` on full success. If SignUpGenius is down or the key expires, the trigger just fails silently (logged) and `doGet()` keeps serving the last good payload indefinitely — never overwrite good data with a failed run.

## Setup

1. `clasp login`, then `clasp clone <scriptId>` (or `clasp create --type webapp`) into this repo so `.clasp.json` points at your Apps Script project.
2. `clasp push`.
3. In the Apps Script editor — Project Settings → Script Properties:
   - `SUG_API_KEY` (required)
   - `CANTEEN_TITLE_PREFIX` (optional, default `"Canteen Volunteer"`)
   - `CANTEEN_DAYS_AHEAD` (optional, default 14) — calendar days of canteen shown on the dashboard (about 10 weekdays)
   - `NOTIFY_EMAILS` (comma-separated, for `sendCanteenSummary`)
   - `NOTIFY_DAYS_AHEAD` (optional, default 7)
4. Run `setupTrigger` once manually from the editor (installs the hourly trigger).
5. Run `selfTest_` once manually to sanity-check date/parsing logic in the real Apps Script runtime.
6. Deploy → New deployment → Web app → Execute as "Me", who has access "Anyone". Copy the `/exec` URL — that's `VITE_DATA_URL` for `bps-volunteer-ui`.
7. **Code changes later:** Manage deployments → Edit → new version. Not "New deployment" — that changes the URL.
8. Optional: run `setupNotifyTrigger` once to automate the nightly canteen summary email (~9pm Sydney). Otherwise run `sendCanteenSummary` manually.

CORS confirmed working: the `/exec` URL returns `Access-Control-Allow-Origin: *`, verified live against the Firebase-hosted UI.
