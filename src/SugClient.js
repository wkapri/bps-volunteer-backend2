/** Port of sugClient.ts — key-based SignUpGenius API, via UrlFetchApp. */

var SUG_BASE = "https://api.signupgenius.com/v2/k";

function sugGet(userKey, path) {
  var url = SUG_BASE + path + "?user_key=" + encodeURIComponent(userKey);
  var res;
  try {
    res = UrlFetchApp.fetch(url, {
      headers: { Accept: "application/json" },
      muteHttpExceptions: true,
    });
  } catch (e) {
    // Network-level errors quote the full URL, which contains the key — scrub it before it reaches logs/emails.
    throw new Error("SignUpGenius " + path + " request failed: " + String(e.message).split(userKey).join("***").split(encodeURIComponent(userKey)).join("***"));
  }

  var body;
  try {
    body = JSON.parse(res.getContentText());
  } catch (e) {
    body = undefined;
  }

  var code = res.getResponseCode();
  if (code < 200 || code >= 300 || !body || body.success === false) {
    var detail = (body && body.message && body.message.join("; ")) || ("HTTP " + code);
    throw new Error("SignUpGenius " + path + " failed: " + detail);
  }

  return body.data;
}

function sugCreatedActive(userKey) {
  return sugGet(userKey, "/signups/created/active/");
}

function sugReportAll(userKey, signupId) {
  return sugGet(userKey, "/signups/report/all/" + signupId + "/").signup;
}
