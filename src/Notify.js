/**
 * Canteen nightly summary — DESIGN.md section 7. MailApp is free under the
 * Workspace, no SMTP/app-password setup. Names + contact info (this job
 * only — never in data.json/doGet()).
 *
 * Resolves the canteen sign-up the same automatic way as run() (title
 * prefix match against the active sign-ups list) — no manual signup ID.
 * Costs 2 API calls per invocation (createdActive + reportAll); not worth
 * sharing state with the hourly run() to save them — that job fetches
 * canteen via the public keyless endpoint (no names), so there's nothing
 * to reuse, and 2 calls/day is well inside quota.
 *
 * Config (Script Properties):
 *   NOTIFY_EMAILS      comma-separated recipient list.
 *   NOTIFY_DAYS_AHEAD  optional, default 7. Set to 20 while testing so you
 *                      can see your own test slots without waiting.
 */

function sendCanteenSummary() {
  var props = PropertiesService.getScriptProperties();
  var userKey = props.getProperty("SUG_API_KEY");
  var titlePrefix = props.getProperty("CANTEEN_TITLE_PREFIX");
  var recipients = (props.getProperty("NOTIFY_EMAILS") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  var daysAhead = Number(props.getProperty("NOTIFY_DAYS_AHEAD")) || 7;

  // Config errors — genuine misconfiguration, not a normal "nothing to send"
  // state, so let these throw (marks the execution failed, feeds the native
  // trigger failure-notification setting — see Code.js).
  if (!userKey) throw new Error("SUG_API_KEY is not set.");
  if (recipients.length === 0) throw new Error("NOTIFY_EMAILS is not set.");

  var signups = sugCreatedActive(userKey);
  var canteenSignup = resolveCanteenSignup(signups, titlePrefix);
  if (!canteenSignup) {
    // Legitimately normal between terms — not a failure, just nothing to send.
    Logger.log("sendCanteenSummary: no active sign-up matches the canteen title prefix — skipping.");
    return;
  }

  var rows = sugReportAll(userKey, canteenSignup.signupid);
  var todayIso = sydneyTodayIso();
  var cutoffIso = noonUtcToIso(addDaysUtc(isoDateToNoonUtc(todayIso), daysAhead));

  // date -> item -> [{name, phone, email, qty, comment}]
  var byDate = {};
  rows.forEach(function (row) {
    if (!row.firstname) return; // unfilled slot instance, not a real signup
    var dateKey = epochSecondsToSydneyIso(row.startdate);
    if (dateKey < todayIso || dateKey > cutoffIso) return;

    var items = byDate[dateKey] || (byDate[dateKey] = {});
    var list = items[row.item] || (items[row.item] = []);
    list.push({
      name: row.firstname + " " + row.lastname,
      phone: row.phone,
      email: row.email,
      qty: toCount(row.myqty),
      comment: row.comment,
    });
  });

  var dateKeys = Object.keys(byDate).sort();
  if (dateKeys.length === 0) {
    Logger.log("sendCanteenSummary: no signups in the next " + daysAhead + " days — not sending.");
    return;
  }

  var lines = ["Canteen volunteers, next " + daysAhead + " days:", ""];
  dateKeys.forEach(function (dateKey) {
    var d = isoDateToNoonUtc(dateKey);
    lines.push(weekdayName(d) + " " + dateKey);
    var items = byDate[dateKey];
    Object.keys(items).sort().forEach(function (item) {
      lines.push("  " + item + ":");
      items[item].forEach(function (p) {
        var contact = [p.phone, p.email].filter(Boolean).join(", ");
        var qtyNote = p.qty > 1 ? " (x" + p.qty + ")" : "";
        var commentNote = p.comment ? " — " + p.comment : "";
        lines.push("    - " + p.name + qtyNote + (contact ? " — " + contact : "") + commentNote);
      });
    });
    lines.push("");
  });

  MailApp.sendEmail({
    to: recipients.join(","),
    subject: "Canteen volunteers — next " + daysAhead + " days",
    body: lines.join("\n"),
  });

  Logger.log("sendCanteenSummary: sent to " + recipients.join(", ") + " (" + dateKeys.length + " days).");
}

/** Run once manually to install the nightly send (9pm Sydney). Not auto-installed. */
function setupNotifyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "sendCanteenSummary"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger("sendCanteenSummary").timeBased().everyDays(1).atHour(21).inTimezone(TIMEZONE).create();
  Logger.log("Nightly canteen summary trigger installed (~9pm Sydney).");
}
