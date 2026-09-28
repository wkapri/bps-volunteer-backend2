/** Port of canteen.ts. */

var DEFAULT_TITLE_PREFIX = "Canteen Volunteer";

function resolveCanteenSignup(signups, titlePrefix, signupIdOverride) {
  if (signupIdOverride) {
    var byId = signups.filter(function (s) { return s.signupid === signupIdOverride; })[0];
    return byId || null;
  }
  var prefix = titlePrefix || DEFAULT_TITLE_PREFIX;
  var byTitle = signups.filter(function (s) { return s.title.indexOf(prefix) === 0; })[0];
  return byTitle || null;
}

/** Returns { canteen, warnings, source }. Mirrors bps-volunteer-backend/src/canteen.ts. */
function buildCanteen(userKey, signups, titlePrefix, signupIdOverride) {
  var canteenSignup = resolveCanteenSignup(signups, titlePrefix, signupIdOverride);
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
        return { canteen: buildFromPublicSlots(canteenSignup, publicSlots), warnings: warnings, source: "public-sheet" };
      }
      warnings.push("canteen: public sheet endpoint returned no date-slots; falling back to key API (no deep links)");
    } catch (err) {
      warnings.push("canteen: public sheet endpoint failed (" + err.message + "); falling back to key API (no deep links)");
    }
  } else {
    warnings.push('canteen: could not parse urlid from signupUrl "' + canteenSignup.signupurl + '"; falling back to key API (no deep links)');
  }

  return { canteen: buildFromReportAll(userKey, canteenSignup), warnings: warnings, source: "key-api" };
}

function buildFromPublicSlots(canteenSignup, publicSlots) {
  var dateKeys = Object.keys(publicSlots);
  var lastDate = dateKeys.reduce(function (max, k) { return k > max ? k : max; });

  var days = buildDayRange(lastDate, function (dateKey, weekday) {
    var slot = publicSlots[dateKey];
    if (!slot) return { date: dateKey, weekday: weekday, status: "closed" };
    var deepLink = canteenSignup.signupurl + "#/#" + slot.slotid + "-date-wrap";
    return summarizeDay(dateKey, weekday, slot.shifts, deepLink);
  });

  return { signupId: canteenSignup.signupid, title: canteenSignup.title, signupUrl: canteenSignup.signupurl, days: days };
}

function buildFromReportAll(userKey, canteenSignup) {
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
  });

  return { signupId: canteenSignup.signupid, title: canteenSignup.title, signupUrl: canteenSignup.signupurl, days: days };
}

/** Weekdays only, from "today" (3pm Sydney rollover) through lastDate. */
function buildDayRange(lastDateIso, dayBuilder) {
  var lastDate = isoDateToNoonUtc(lastDateIso);
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
