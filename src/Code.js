/**
 * Entry point. Port of main.ts, minus ajv validation (no npm in Apps Script —
 * trust the same hand-written builders that produced the shape instead).
 *
 * Durability (the whole reason for this migration): `run()` only overwrites
 * DATA_PROPERTY_KEY on full success. A broken trigger just stops updating it —
 * doGet() keeps serving the last good payload indefinitely, same rule as
 * DESIGN.md 4.3 ("never overwrite good data with a failed run").
 *
 * Config (Project Settings -> Script Properties):
 *   SUG_API_KEY          required
 *   CANTEEN_TITLE_PREFIX optional, default "Canteen Volunteer"
 */

var DATA_PROPERTY_KEY = "VOLUNTEER_DATA_JSON";
var SCHEMA_VERSION = 1;

function run() {
  var props = PropertiesService.getScriptProperties();
  var userKey = props.getProperty("SUG_API_KEY");
  if (!userKey) {
    Logger.log("SUG_API_KEY is not set — aborting run.");
    return;
  }

  var titlePrefix = props.getProperty("CANTEEN_TITLE_PREFIX");

  var signups;
  try {
    signups = sugCreatedActive(userKey);
  } catch (err) {
    Logger.log("Failed to list active sign-ups; aborting run. " + err.message);
    return;
  }

  var canteenResult;
  try {
    canteenResult = buildCanteen(userKey, signups, titlePrefix);
  } catch (err) {
    Logger.log("Failed to build canteen section; aborting run. " + err.message);
    return;
  }

  var eventsResult = buildEvents(userKey, signups, canteenResult.canteen.signupId);
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
  try {
    props.setProperty(DATA_PROPERTY_KEY, json);
    Logger.log("Wrote data — canteen days: " + data.canteen.days.length + ", events: " + data.events.length + ", warnings: " + warnings.length);
  } catch (err) {
    Logger.log("Failed to store data (" + err.message + ") — leaving previous good data in place.");
  }
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
