/**
 * Port of numbers.ts + status.ts + Luxon date math from bps-volunteer-backend.
 * No Luxon here (no npm in Apps Script) — calendar-day math uses the
 * "noon UTC" trick: represent a date-only value as new Date(Date.UTC(y,m,d,12))
 * so +/- day arithmetic never crosses a boundary regardless of the running
 * machine's local timezone. Always format such a Date with zone "UTC" to read
 * it back. "Australia/Sydney" is used only when reading the real current
 * instant (`new Date()`) or converting a real epoch-seconds timestamp.
 */

var TIMEZONE = "Australia/Sydney";

function toCount(value) {
  var n = Number(value);
  return isFinite(n) ? n : 0;
}

/** null when capacity is 0 (closed / no slots) — matches the data.json contract. */
function fillPct(filled, capacity) {
  if (capacity <= 0) return null;
  return Math.round((100 * filled) / capacity);
}

function statusFromPct(pct) {
  if (pct === null) return "closed";
  if (pct < 25) return "red";
  if (pct < 75) return "amber";
  return "green";
}

function isoDateToNoonUtc(iso) {
  var parts = iso.split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
}

function noonUtcToIso(date) {
  return Utilities.formatDate(date, "UTC", "yyyy-MM-dd");
}

function weekdayName(date) {
  return Utilities.formatDate(date, "UTC", "EEEE");
}

function addDaysUtc(date, days) {
  var d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isWeekendUtc(date) {
  var day = date.getUTCDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}

/** "Today" per DESIGN.md's 3pm Sydney rollover — as a noon-UTC anchor date. */
function sydneyDayCursor() {
  var now = new Date();
  var todayIso = Utilities.formatDate(now, TIMEZONE, "yyyy-MM-dd");
  var hour = Number(Utilities.formatDate(now, TIMEZONE, "HH"));
  var today = isoDateToNoonUtc(todayIso);
  return hour < 15 ? today : addDaysUtc(today, 1);
}

/** Sydney calendar date (no rollover) — for the events midnight-drop rule. */
function sydneyTodayIso() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
}

function epochSecondsToSydneyIso(seconds) {
  return Utilities.formatDate(new Date(seconds * 1000), TIMEZONE, "yyyy-MM-dd");
}

function sydneyNowIso() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

var MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Parses SignUpGenius public-endpoint `starttime`, e.g.
 * "September, 17 2026 00:00:00" — always a plain calendar date, no offset.
 * Returns an ISO date string ("yyyy-MM-dd") or null.
 */
function parseSugPublicDate(starttime) {
  var m = /^([A-Za-z]+),\s*(\d{1,2})\s+(\d{4})/.exec(starttime);
  if (!m) return null;
  var monthIdx = MONTH_NAMES.indexOf(m[1]);
  if (monthIdx === -1) return null;
  var day = Number(m[2]);
  var year = Number(m[3]);
  var mm = String(monthIdx + 1).padStart(2, "0");
  var dd = String(day).padStart(2, "0");
  return year + "-" + mm + "-" + dd;
}
