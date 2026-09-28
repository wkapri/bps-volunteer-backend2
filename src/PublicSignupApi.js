/** Port of publicSignupApi.ts — keyless public sign-up sheet endpoint. */

var PUBLIC_ENDPOINT = "https://www.signupgenius.com/SUGboxAPI.cfm?go=s.getSignupInfo";

function urlKeyFromSignupUrl(signupUrl) {
  var m = /\/go\/([^/?#]+)/.exec(signupUrl);
  return m ? m[1] : null;
}

/** Throws on network/HTTP failure; callers decide the fallback. */
function fetchRawSlots(urlKey) {
  var res = UrlFetchApp.fetch(PUBLIC_ENDPOINT, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ forSignUpView: true, urlid: urlKey, portalid: "" }),
    muteHttpExceptions: true,
  });

  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error("getSignupInfo failed: HTTP " + code);
  }

  var body = JSON.parse(res.getContentText());
  return (body.DATA && body.DATA.slots) || {};
}

/**
 * Map of ISO date -> { slotid, shifts } built straight from qty/qtyTaken.
 * Preferred canteen source (DESIGN.md section 5): capacity/filled from
 * SignUpGenius itself, plus the real per-date slotid for the deep link.
 */
function fetchCanteenSlots(urlKey) {
  var rawSlots = fetchRawSlots(urlKey);
  var map = {};
  for (var key in rawSlots) {
    var slot = rawSlots[key];
    var dateKey = parseSugPublicDate(slot.starttime);
    if (!dateKey) continue;

    var shifts = slot.items.map(function (item) {
      return { label: item.item, capacity: toCount(item.qty), filled: toCount(item.qtyTaken) };
    });
    map[dateKey] = { slotid: slot.slotid, shifts: shifts };
  }
  return map;
}

/**
 * Summed capacity/filled across every slot/item — one-off events only need
 * one event-level total (v1: one event = one date). Returns null (not an
 * error) when legitimately empty; throws on network/HTTP failure.
 */
function fetchSignupTotals(urlKey) {
  var rawSlots = fetchRawSlots(urlKey);
  var allItems = [];
  for (var key in rawSlots) {
    allItems = allItems.concat(rawSlots[key].items);
  }
  if (allItems.length === 0) return null;

  var capacity = 0;
  var filled = 0;
  allItems.forEach(function (item) {
    capacity += toCount(item.qty);
    filled += toCount(item.qtyTaken);
  });
  return { capacity: capacity, filled: filled };
}
