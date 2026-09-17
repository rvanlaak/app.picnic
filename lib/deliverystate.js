'use strict';

// What the dashboard widget has to show, derived from what the poll stored.
// Kept free of Homey APIs so it can be reasoned about and unit tested on its
// own, like the rest of the decision logic in this folder.

// How long a delivered order stays on the dashboard. Long enough to still be
// there when someone walks past the tablet after unpacking, short enough that
// it is not still saying "delivered" the next morning.
const DELIVERED_VISIBLE_FOR = 1000 * 60 * 60 * 6;

// The bar fills between the announcement and the start of the window. A
// delivery announced by a version that did not store that moment yet leaves
// nothing to fill from, so the last hour before the window stands in for it.
const FALLBACK_ANNOUNCEMENT_HEAD_START = 1000 * 60 * 60;

// new Date(null) is the epoch rather than an invalid date, so an unset setting
// would read as a moment in 1970 instead of as "not known".
function moment(iso) {
  if (typeof iso != 'string' || iso == "") return null;

  const parsed = new Date(iso).getTime();
  return isNaN(parsed) ? null : parsed;
}

function clamp(fraction) {
  if (fraction < 0) return 0;
  if (fraction > 1) return 1;
  return fraction;
}

// How far along we are between two moments, or null when the two do not
// describe a stretch of time that something can be along.
function progressBetween(from, until, now) {
  if (from === null || until === null || until <= from) return null;
  return clamp((now - from) / (until - from));
}

/**
 * Translates what the app knows about the order into what the widget draws.
 *
 * @param {Object} stored what the poll wrote down, as ISO timestamps
 * @param {string} stored.orderStatus the order_status setting
 * @param {string} stored.etaStart the start of the delivery window
 * @param {string} stored.etaEnd the end of the delivery window
 * @param {string} stored.announcedAt when Picnic announced that window
 * @param {string} stored.deliveredAt when the groceries arrived
 * @param {boolean} stored.signInNeeded whether the app can reach Picnic at all
 * @param {string} stored.now the moment to derive the state for
 * @returns {Object} the state, the moment to count down to and how far the bar is filled
 */
function deriveDeliveryState(stored) {
  const now = moment(stored["now"]) || Date.now();
  const etaStart = moment(stored["etaStart"]);
  const etaEnd = moment(stored["etaEnd"]);
  const deliveredAt = moment(stored["deliveredAt"]);

  const nothing = {
    "state": "idle",
    "countdownTo": null,
    "progress": null,
    "etaStart": null,
    "etaEnd": null,
    "deliveredAt": null
  };

  // Nothing the app knows about the order means anything while it cannot ask
  // Picnic about it, and a widget saying "no delivery planned" would be
  // claiming something it cannot know.
  if (stored["signInNeeded"] === true) return Object.assign({}, nothing, { "state": "signed_out" });

  const orderStatus = stored["orderStatus"];

  if (orderStatus == "groceries_ordered" || orderStatus == "delivery_announced") {
    const announced = orderStatus == "delivery_announced";
    const window = { "etaStart": stored["etaStart"], "etaEnd": stored["etaEnd"], "deliveredAt": null };

    // Both ends unknown leaves only the fact that something was ordered.
    if (etaStart === null) {
      return Object.assign({}, nothing, window, { "state": "ordered", "etaStart": null, "etaEnd": null });
    }

    if (now < etaStart) {
      const announcedAt = moment(stored["announcedAt"]);
      const from = announcedAt !== null && announcedAt < etaStart
        ? announcedAt
        : etaStart - FALLBACK_ANNOUNCEMENT_HEAD_START;

      return Object.assign({}, window, {
        "state": announced ? "announced" : "ordered",
        "countdownTo": stored["etaStart"],
        // an order days away spends most of that time at zero, which says as
        // much as it should: the bar is about the delivery drawing near
        "progress": announced ? progressBetween(from, etaStart, now) : null
      });
    }

    if (etaEnd !== null && now <= etaEnd) {
      return Object.assign({}, window, {
        "state": "arriving",
        "countdownTo": null,
        "progress": progressBetween(etaStart, etaEnd, now)
      });
    }

    // Past the window with the order still open. Picnic is late, or it
    // delivered and the next poll has not seen it yet.
    return Object.assign({}, window, { "state": "overdue", "countdownTo": null, "progress": 1 });
  }

  if (deliveredAt !== null && now - deliveredAt < DELIVERED_VISIBLE_FOR && now >= deliveredAt) {
    return Object.assign({}, nothing, { "state": "delivered", "deliveredAt": stored["deliveredAt"] });
  }

  return nothing;
}

module.exports = { deriveDeliveryState, DELIVERED_VISIBLE_FOR };
