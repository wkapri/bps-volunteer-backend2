/** Port of canteen.ts. */

var DEFAULT_TITLE_PREFIX = "Canteen Volunteer";

function isCanteenSignup(s, titlePrefix) {
  return s.title.indexOf(titlePrefix || DEFAULT_TITLE_PREFIX) === 0;
}

/**
 * With several matching sign-ups (next term created early), pick the current
 * one: earliest start among those not yet finished. SignUpGenius returns them
 * in no particular order, so don't rely on list position. Once the current
 * term's last slot passes, the next one takes over on the following run.
 */
function resolveCanteenSignup(signups, titlePrefix) {
  var matches = signups.filter(function (s) { return isCanteenSignup(s, titlePrefix); });
  if (matches.length === 0) return null;

  var nowSec = Date.now() / 1000;
  var unfinished = matches.filter(function (s) { return !s.enddate || s.enddate >= nowSec; });
  var pool = unfinished.length > 0 ? unfinished : matches;
  pool.sort(function (a, b) { return a.startdate - b.startdate; });
  return pool[0];
}

/** Returns { canteen, warnings, source }. daysAhead caps how far past today days are emitted. */
function buildCanteen(userKey, signups, titlePrefix, daysAhead) {
  var canteenSignup = resolveCanteenSignup(signups, titlePrefix);
  if (!canteenSignup) {
    return {
      canteen: { signupId: null, title: null, signupUrl: null, days: [] },
      warnings: [],
      source: "public-sheet",
    };
  }

  var warnings = [];
  var urlKey = urlKeyFromSignupUrl(canteenSignup.signupurl);

  if (urlKey) {
    try {
      var publicSlots = fetchCanteenSlots(urlKey);
      if (Object.keys(publicSlots).length > 0) {
        return { canteen: buildFromPublicSlots(canteenSignup, publicSlots, daysAhead), warnings: warnings, source: "public-sheet" };
      }
      warnings.push("canteen: public sheet endpoint returned no date-slots; falling back to key API (no deep links)");
    } catch (err) {
      warnings.push("canteen: public sheet endpoint failed (" + err.message + "); falling back to key API (no deep links)");
    }
  } else {
    warnings.push('canteen: could not parse urlid from signupUrl "' + canteenSignup.signupurl + '"; falling back to key API (no deep links)');
  }

  return { canteen: buildFromReportAll(userKey, canteenSignup, daysAhead), warnings: warnings, source: "key-api" };
}

function buildFromPublicSlots(canteenSignup, publicSlots, daysAhead) {
  var dateKeys = Object.keys(publicSlots);
  var lastDate = dateKeys.reduce(function (max, k) { return k > max ? k : max; });

  var days = buildDayRange(lastDate, function (dateKey, weekday) {
    var slot = publicSlots[dateKey];
    if (!slot) return { date: dateKey, weekday: weekday, status: "closed" };
    var deepLink = canteenSignup.signupurl + "#/#" + slot.slotid + "-date-wrap";
    return summarizeDay(dateKey, weekday, slot.shifts, deepLink);
  }, daysAhead);

  return { signupId: canteenSignup.signupid, title: canteenSignup.title, signupUrl: canteenSignup.signupurl, days: days };
}

function buildFromReportAll(userKey, canteenSignup, daysAhead) {
  var rows = sugReportAll(userKey, canteenSignup.signupid);

  var byDate = {}; // dateKey -> { label -> {capacity, filled} }
  var lastDate = null;

  rows.forEach(function (row) {
    var dateKey = epochSecondsToSydneyIso(row.startdate);
    var weekdayNum = isoDateToNoonUtc(dateKey).getUTCDay();
    if (weekdayNum === 0 || weekdayNum === 6) return; // Sat/Sun rows shouldn't occur; guard anyway

    if (!lastDate || dateKey > lastDate) lastDate = dateKey;

    var shifts = byDate[dateKey] || (byDate[dateKey] = {});
    var qty = toCount(row.myqty);
    var shift = shifts[row.item] || (shifts[row.item] = { capacity: 0, filled: 0 });
    shift.capacity += qty;
    if (row.firstname) shift.filled += qty;
  });

  if (!lastDate) return { signupId: canteenSignup.signupid, title: canteenSignup.title, signupUrl: canteenSignup.signupurl, days: [] };

  var days = buildDayRange(lastDate, function (dateKey, weekday) {
    var shifts = byDate[dateKey];
    if (!shifts) return { date: dateKey, weekday: weekday, status: "closed" };
    var shiftList = Object.keys(shifts).map(function (label) {
      return { label: label, capacity: shifts[label].capacity, filled: shifts[label].filled };
    });
    return summarizeDay(dateKey, weekday, shiftList, canteenSignup.signupurl);
  }, daysAhead);

  return { signupId: canteenSignup.signupid, title: canteenSignup.title, signupUrl: canteenSignup.signupurl, days: days };
}

/** Weekdays only, from "today" (3pm Sydney rollover) through the earlier of lastDate and today + daysAhead calendar days. */
function buildDayRange(lastDateIso, dayBuilder, daysAhead) {
  var lastDate = isoDateToNoonUtc(lastDateIso);
  var limit = addDaysUtc(isoDateToNoonUtc(sydneyTodayIso()), daysAhead);
  if (limit.getTime() < lastDate.getTime()) lastDate = limit;
  var cursor = sydneyDayCursor();

  var days = [];
  while (cursor.getTime() <= lastDate.getTime()) {
    if (!isWeekendUtc(cursor)) {
      var dateKey = noonUtcToIso(cursor);
      days.push(dayBuilder(dateKey, weekdayName(cursor)));
    }
    cursor = addDaysUtc(cursor, 1);
  }
  return days;
}

/** capacity/filled/fillPct/status from a day's shifts. */
function summarizeDay(date, weekday, shifts, deepLink) {
  var capacity = shifts.reduce(function (sum, s) { return sum + s.capacity; }, 0);
  var filled = shifts.reduce(function (sum, s) { return sum + s.filled; }, 0);

  var pct = fillPct(filled, capacity);
  if (pct === null) return { date: date, weekday: weekday, status: "closed" };

  var status = statusFromPct(pct);
  return { date: date, weekday: weekday, status: status, capacity: capacity, filled: filled, fillPct: pct, deepLink: deepLink, shifts: shifts };
}
