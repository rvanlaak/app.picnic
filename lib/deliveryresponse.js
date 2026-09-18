'use strict';

// What Picnic's GET /api/15/deliveries/{id} says about a delivery once it has
// been made: when it actually arrived, what it cost and what came back in
// deposit. Kept free of Homey APIs so it can be unit tested on its own.
//
// Like the cart, this is read behind someone's back, so a field that is not
// there leaves that part of the widget empty rather than throwing.

function isNumber(value) {
  return typeof value == 'number' && isFinite(value);
}

// Picnic counts in cents.
function euros(cents) {
  return isNumber(cents) ? cents / 100 : null;
}

// The sum of a field over a list, or null when not one entry carries it.
function total(list, read) {
  var sum = null;

  (Array.isArray(list) ? list : []).forEach(entry => {
    const value = entry && read(entry);
    if (isNumber(value)) sum = (sum === null ? 0 : sum) + value;
  });

  return sum;
}

// What the customer pays for an order. checkout_total_price is what the
// checkout shows, total_price what the summary carries; the first is taken
// when there is one.
function orderPrice(order) {
  return isNumber(order['checkout_total_price']) ? order['checkout_total_price'] : order['total_price'];
}

/**
 * The facts about a delivery that has been made.
 *
 * @param {string|Object} body the response body
 * @returns {Object|null} as { deliveryId, deliveredAt, totalPrice, depositPaid, depositReturned, returned }
 */
function parseDelivery(body) {
  var parsed = body;

  if (typeof body == 'string') {
    try {
      parsed = JSON.parse(body);
    } catch (exception) {
      return null;
    }
  }

  if (parsed === null || typeof parsed != 'object' || Array.isArray(parsed)) return null;

  const deliveryTime = parsed['delivery_time'];
  const deliveredAt = deliveryTime && typeof deliveryTime == 'object' && typeof deliveryTime['start'] == 'string' && deliveryTime['start'] != ""
    ? deliveryTime['start']
    : null;

  // Bottles, crates and bags handed back to the driver. Picnic only fills
  // this in once the hub has counted them, which is some time after the
  // delivery itself, so an empty list means "not counted yet" as much as
  // "nothing returned". Each entry's price is taken to be per unit.
  const containers = (Array.isArray(parsed['returned_containers']) ? parsed['returned_containers'] : [])
    .filter(container => container && isNumber(container['quantity']) && container['quantity'] > 0);

  const returned = containers.map(container => ({
    "name": typeof container['localized_name'] == 'string' ? container['localized_name'] : "",
    "quantity": container['quantity'],
    "amount": isNumber(container['price']) ? container['price'] * container['quantity'] / 100 : null
  }));

  return {
    "deliveryId": typeof parsed['delivery_id'] == 'string' ? parsed['delivery_id'] : null,
    "deliveredAt": deliveredAt,
    "totalPrice": euros(total(parsed['orders'], orderPrice)),
    "depositPaid": euros(total(parsed['orders'], order => order['total_deposit'])),
    "depositReturned": returned.length == 0 ? null : euros(total(containers, container =>
      isNumber(container['price']) ? container['price'] * container['quantity'] : null)),
    "returned": returned
  };
}

module.exports = { parseDelivery };
