'use strict';

// What the dashboard widget has to show, derived from what the poll stored and
// from what Picnic said about the cart and the last delivery. Kept free of
// Homey APIs so it can be reasoned about and unit tested on its own, like the
// rest of the decision logic in this folder.

// How long a delivered order stays on the dashboard: long enough to see that
// it came and what came back in deposit, short enough that the widget has
// moved on to the next order by the time anyone thinks about one.
const DELIVERED_VISIBLE_FOR = 1000 * 60 * 60 * 4;

// How long what the app last heard from Picnic is still worth showing. The
// slowest poll runs every six hours, so this is four of them missed in a row:
// past that the widget would be retelling a state rather than reporting one,
// and an order that was delivered months ago would still be "on its way".
const CONFIRMED_FOR = 1000 * 60 * 60 * 24;

// How long after its window a delivery can still be seen arriving. Picnic is
// never half a day late, so a delivery the app only notices later than that is
// the app catching up on one it lost track of, not groceries on the counter.
const DELIVERED_AFTER_WINDOW_WITHIN = 1000 * 60 * 60 * 12;

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

function amount(value) {
  return typeof value == 'number' && isFinite(value) ? value : null;
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

// Picnic lets you keep adding to an order until the slot's cut off moment, so
// that moment is worth showing right up until it passes and worth nothing
// after. An order whose cut off is unknown simply does not mention one.
function cutOffAhead(cutOffAt, now) {
  const at = moment(cutOffAt);
  if (at === null || at <= now) return null;
  return cutOffAt;
}

// The cart as the widget talks about it, or null when there is nothing in it
// or nothing known about it: either way there is no cart to show.
function cartInView(cart, now) {
  if (cart === null || typeof cart != 'object') return null;

  const total = amount(cart["totalPrice"]);
  const count = amount(cart["productCount"]);

  if (!(total > 0) && !(count > 0)) return null;

  const minimum = amount(cart["minimumOrderValue"]);
  const slot = cart["slot"] && typeof cart["slot"] == 'object' ? cart["slot"] : null;
  const chosen = slot !== null && slot["chosen"] === true;

  return {
    "totalPrice": total,
    "productCount": count,
    "minimumShort": minimum !== null && total !== null && total < minimum
      ? Math.round((minimum - total) * 100) / 100
      : null,
    // only a slot someone picked is worth naming: the one Picnic suggests by
    // itself is not held for anyone and changes as the day goes on
    "slot": chosen ? {
      "windowStart": moment(slot["windowStart"]) === null ? null : slot["windowStart"],
      "windowEnd": moment(slot["windowEnd"]) === null ? null : slot["windowEnd"],
      "cutOffAt": cutOffAhead(slot["cutOffAt"], now)
    } : null,
    "slotChosen": chosen
  };
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
 * @param {string} stored.cutOffAt the last moment the order can still be changed
 * @param {boolean} stored.signInNeeded whether the app can reach Picnic at all
 * @param {string} stored.checkedAt the last moment Picnic answered a poll
 * @param {Object} stored.cart the cart as lib/cartresponse.js reads it, or null
 * @param {Object} stored.delivery the delivered order as lib/deliveryresponse.js reads it, or null
 * @param {string} stored.now the moment to derive the state for
 * @returns {Object} the state, the moments it is about and how far the bar is filled
 */
function deriveDeliveryState(stored) {
  const now = moment(stored["now"]) || Date.now();
  const etaStart = moment(stored["etaStart"]);
  const etaEnd = moment(stored["etaEnd"]);
  const deliveredAt = moment(stored["deliveredAt"]);
  const cart = cartInView(stored["cart"], now);

  const nothing = {
    "state": "empty",
    "countdownTo": null,
    "progress": null,
    "etaStart": null,
    "etaEnd": null,
    "deliveredAt": null,
    "cutOffAt": null,
    "checkedAt": null,
    "cart": null,
    "delivery": null,
    // whether the cart was asked about at all, so an empty widget can tell
    // "the cart is empty" apart from "nothing is known about the cart"
    "cartKnown": stored["cart"] !== null && typeof stored["cart"] == 'object'
  };

  // Nothing the app knows about the order means anything while it cannot ask
  // Picnic about it, and a widget saying "no delivery planned" would be
  // claiming something it cannot know.
  if (stored["signInNeeded"] === true) return Object.assign({}, nothing, { "state": "signed_out" });

  // The same goes for a state Picnic has not confirmed in a long time: it is
  // what the app was last told, not what is going on. Never confirmed at all
  // counts too, which is where an app that has been failing to poll since
  // before it started keeping track of this ends up.
  const checkedAt = moment(stored["checkedAt"]);
  if (checkedAt === null || now - checkedAt > CONFIRMED_FOR) {
    return Object.assign({}, nothing, { "state": "stale", "checkedAt": checkedAt === null ? null : stored["checkedAt"] });
  }

  const orderStatus = stored["orderStatus"];

  if (orderStatus == "groceries_ordered" || orderStatus == "delivery_announced") {
    const announced = orderStatus == "delivery_announced";
    const cutOffAt = cutOffAhead(stored["cutOffAt"], now);
    const window = {
      "etaStart": stored["etaStart"],
      "etaEnd": stored["etaEnd"],
      // the van being on its way is the cut off having passed whatever the
      // stored moment says, so only a delivery that is still ahead mentions one
      "cutOffAt": null,
      // what is in the cart while the order is open is what has yet to be
      // added to it, which only means something until the order closes
      "cart": null
    };

    // Both ends unknown leaves only the fact that something was ordered.
    if (etaStart === null) {
      return Object.assign({}, nothing, window, {
        "state": "ordered",
        "etaStart": null,
        "etaEnd": null,
        "cutOffAt": cutOffAt,
        "cart": cutOffAt === null ? null : cart
      });
    }

    if (now < etaStart) {
      const announcedAt = moment(stored["announcedAt"]);
      const from = announcedAt !== null && announcedAt < etaStart
        ? announcedAt
        : etaStart - FALLBACK_ANNOUNCEMENT_HEAD_START;

      return Object.assign({}, nothing, window, {
        "state": announced ? "announced" : "ordered",
        "countdownTo": stored["etaStart"],
        "cutOffAt": cutOffAt,
        "cart": cutOffAt === null ? null : cart,
        // an order days away spends most of that time at zero, which says as
        // much as it should: the bar is about the delivery drawing near
        "progress": announced ? progressBetween(from, etaStart, now) : null
      });
    }

    if (etaEnd !== null && now <= etaEnd) {
      return Object.assign({}, nothing, window, {
        "state": "arriving",
        "progress": progressBetween(etaStart, etaEnd, now)
      });
    }

    // Past the window with the order still open. Picnic is late, or it
    // delivered and the next poll has not seen it yet.
    return Object.assign({}, nothing, window, { "state": "overdue", "progress": 1 });
  }

  // an app that lost track of an order sees it as delivered the moment it
  // catches up, which says when the app noticed rather than when it arrived
  const caughtUp = deliveredAt !== null && etaEnd !== null && deliveredAt - etaEnd > DELIVERED_AFTER_WINDOW_WITHIN;

  if (deliveredAt !== null && !caughtUp && now - deliveredAt < DELIVERED_VISIBLE_FOR && now >= deliveredAt) {
    const delivery = stored["delivery"] && typeof stored["delivery"] == 'object' ? stored["delivery"] : null;

    return Object.assign({}, nothing, {
      "state": "delivered",
      "etaStart": stored["etaStart"] || null,
      "etaEnd": stored["etaEnd"] || null,
      "deliveredAt": stored["deliveredAt"],
      "delivery": delivery === null ? null : {
        "totalPrice": amount(delivery["totalPrice"]),
        "depositReturned": amount(delivery["depositReturned"]),
        "returned": Array.isArray(delivery["returned"]) ? delivery["returned"] : []
      }
    });
  }

  // Nothing ordered, or nothing ordered any more: what is left to say is what
  // is in the cart, and when it would be delivered if it were ordered now.
  if (cart !== null) return Object.assign({}, nothing, { "state": "cart", "cart": cart });

  return nothing;
}

module.exports = { deriveDeliveryState, DELIVERED_VISIBLE_FOR, CONFIRMED_FOR };
