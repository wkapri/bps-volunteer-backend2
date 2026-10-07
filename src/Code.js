/**
 * Entry point.
 *
 * Durability: PropertiesService is only ever written on the last line below,
 * after every fetch has already succeeded. Errors are NOT caught here — they
 * propagate and abort the run before that line, so a failure simply leaves
 * the previously-stored good data untouched (doGet() keeps serving it,
 * unaware anything went wrong). Letting the exception reach Apps Script also
 * marks the execution as failed in the Executions log and (once the trigger's
 * failure-notification setting is turned on, in Triggers → ⋮ → this trigger)
 * emails you automatically — no hand-rolled alerting needed for this path.
 *
 * Config (Project Settings -> Script Properties):
 *   SUG_API_KEY          required
 *   CANTEEN_TITLE_PREFIX optional, default "Canteen Volunteer"
 *   CANTEEN_DAYS_AHEAD   optional, default 14 — calendar days of canteen shown on the dashboard
 */

var DATA_PROPERTY_KEY = "VOLUNTEER_DATA_JSON";
var SCHEMA_VERSION = 1;

function run() {
  var props = PropertiesService.getScriptProperties();
  var userKey = props.getProperty("SUG_API_KEY");
  if (!userKey) throw new Error("SUG_API_KEY is not set.");

  var titlePrefix = props.getProperty("CANTEEN_TITLE_PREFIX");
  var daysAhead = Number(props.getProperty("CANTEEN_DAYS_AHEAD")) || 14;

  var signups = sugCreatedActive(userKey);
  var canteenResult = buildCanteen(userKey, signups, titlePrefix, daysAhead);
  var eventsResult = buildEvents(userKey, signups, titlePrefix);
  var warnings = canteenResult.warnings.concat(eventsResult.warnings);

  var data = {
    generatedAt: sydneyNowIso(),
    timezone: TIMEZONE,
    schemaVersion: SCHEMA_VERSION,
    canteen: canteenResult.canteen,
    events: eventsResult.events,
    diagnostics: {
      canteenSource: canteenResult.source,
      eventsFetched: eventsResult.fetchedCount,
      warnings: warnings,
    },
  };

  var json = JSON.stringify(data);
  // ponytail: single ScriptProperties value, 9KB cap. Fine at current data
  // volume (canteen term + a handful of events); if it ever grows past that,
  // split across a few numbered properties and reassemble in doGet().
  props.setProperty(DATA_PROPERTY_KEY, json);
  Logger.log("Wrote data — canteen days: " + data.canteen.days.length + ", events: " + data.events.length + ", warnings: " + warnings.length);
}

function doGet(e) {
  var json = PropertiesService.getScriptProperties().getProperty(DATA_PROPERTY_KEY);
  var body = json || '{"error":"no data yet"}';
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/** Run once manually from the editor to (re)install the hourly trigger. */
function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "run"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger("run").timeBased().everyHours(1).create();
  Logger.log("Hourly trigger installed.");
}

/** Manual self-check — run from the editor. No test framework; asserts + throws. */
function selfTest_() {
  function assertEq(actual, expected, label) {
    if (actual !== expected) throw new Error("selfTest_ failed [" + label + "]: got " + actual + ", want " + expected);
  }

  assertEq(toCount(""), 0, "toCount empty string");
  assertEq(toCount("3"), 3, "toCount numeric string");
  assertEq(fillPct(1, 4), 25, "fillPct");
  assertEq(fillPct(0, 0), null, "fillPct zero capacity");
  assertEq(statusFromPct(10), "red", "statusFromPct red");
  assertEq(statusFromPct(50), "amber", "statusFromPct amber");
  assertEq(statusFromPct(90), "green", "statusFromPct green");
  assertEq(urlKeyFromSignupUrl("https://www.signupgenius.com/go/abc123-canteen"), "abc123-canteen", "urlKeyFromSignupUrl");
  assertEq(parseSugPublicDate("September, 17 2026 00:00:00"), "2026-09-17", "parseSugPublicDate");

  // 2026-09-19 is a Saturday, 2026-09-21 is a Monday.
  assertEq(isWeekendUtc(isoDateToNoonUtc("2026-09-19")), true, "2026-09-19 is Saturday");
  assertEq(isWeekendUtc(isoDateToNoonUtc("2026-09-21")), false, "2026-09-21 is Monday");
  assertEq(weekdayName(isoDateToNoonUtc("2026-09-21")), "Monday", "weekdayName Monday");

  Logger.log("selfTest_ passed.");
}
