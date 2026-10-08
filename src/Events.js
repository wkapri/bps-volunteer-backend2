/** Port of events.ts. */

function buildEvents(userKey, signups, titlePrefix) {
  var today = sydneyTodayIso();
  // Every canteen-titled sign-up is excluded, so an early-created next term never shows up as an event.
  var candidates = signups.filter(function (s) { return !isCanteenSignup(s, titlePrefix); });

  var events = [];
  var warnings = [];
  var failureCount = 0;

  candidates.forEach(function (s) {
    var eventDate = epochSecondsToSydneyIso(s.startdate);
    if (eventDate < today) return; // dropped: past Sydney midnight after the event date

    var totals = fetchTotals(userKey, s, warnings);
    if (!totals) {
      failureCount += 1;
      return;
    }

    var pct = fillPct(totals.filled, totals.capacity);
    var status = pct === null ? "red" : statusFromPct(pct);

    events.push({
      id: s.signupid,
      title: s.title,
      date: eventDate,
      description: null,
      imageUrl: s.mainimage || s.thumbnail || null,
      signupUrl: s.signupurl,
      status: status,
      capacity: totals.capacity,
      filled: totals.filled,
      fillPct: pct === null ? 0 : pct,
      capacityNote: "Naive sum of slot quantities — may include non-volunteer slots (see DESIGN.md section 9).",
    });
  });

  if (failureCount > 3) {
    warnings.push(failureCount + " events failed to fetch (>3) — see diagnostics.warnings.");
  }

  events.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

  return { events: events, warnings: warnings, fetchedCount: candidates.length, failureCount: failureCount };
}

/** Public endpoint first; key API fallback; only warns + returns null if both fail. */
function fetchTotals(userKey, s, warnings) {
  var urlKey = urlKeyFromSignupUrl(s.signupurl);
  if (urlKey) {
    try {
      var totals = fetchSignupTotals(urlKey);
      if (totals) return totals;
      // Empty response isn't an error, but there's nothing to compute from —
      // fall through to the key API rather than emitting a fake 0/0 event.
    } catch (e) {
      // Fall through to the key API, but leave a trace — the public endpoint is undocumented and may change.
      console.error("event " + s.signupid + ": public endpoint failed (" + e.message + "), using key API");
    }
  }

  try {
    var rows = sugReportAll(userKey, s.signupid);
    var capacity = 0;
    var filled = 0;
    rows.forEach(function (row) {
      var qty = toCount(row.myqty);
      capacity += qty;
      if (row.firstname) filled += qty;
    });
    return { capacity: capacity, filled: filled };
  } catch (err) {
    var msg = "event " + s.signupid + " (" + s.title + "): " + err.message;
    console.error(msg);
    warnings.push(msg);
    return null;
  }
}
