'use strict';

// What Picnic's answer to adding a product to the cart says about that
// product. Picnic returns the whole cart when it worked and, when the product
// is already in the cart, that same cart alongside an error code, so the cart
// is what gets looked at first and the code only decides what went wrong.
//
// Nothing here assumes the shape of the answer. This runs inside a response
// handler, where a thrown exception is caught by nobody and takes the app down
// with it, so an answer that makes no sense has to come back as a plain "this
// did not work" rather than as a TypeError.
function parseAddProductResponse(body, productId) {
  var parsed;

  try {
    parsed = JSON.parse(body);
  } catch (exception) {
    return { error: 'Unexpected response from server', reason: 'the response is not json' };
  }

  if (parsed === null || typeof parsed !== 'object') {
    return { error: 'Unexpected response from server', reason: 'the response is not an object' };
  }

  const name = findProductName(parsed['items'], productId);

  if (name !== undefined) {
    return { name: name };
  }

  const code = parsed['error'] && parsed['error']['code'];

  if (code === 'UNPROCESSABLE_ENTITY') {
    return { error: 'Cart was locked', code: code };
  }

  return {
    error: 'Unexpected response from server',
    code: code || undefined,
    reason: 'the cart Picnic sent back does not mention the product'
  };
}

// The cart comes back as groups of lines, and only the line for this product
// carries the name to report.
function findProductName(groups, productId) {
  if (!Array.isArray(groups)) return undefined;

  for (const group of groups) {
    const lines = group && group['items'];

    if (!Array.isArray(lines)) continue;

    const line = lines.find(line => line && line['id'] == productId);

    if (line && typeof line['name'] === 'string') return line['name'];
  }

  return undefined;
}

// Picnic counts in cents. A value that is not a number is a field that is not
// there, or is no longer what it was, and either way there is no amount to show.
function euros(cents) {
  if (typeof cents != 'number' || !isFinite(cents)) return null;
  return cents / 100;
}

// How many products are in the cart. Picnic totals it up itself, but the cart
// is also there line by line, so it can be counted if it ever stops doing that.
function countProducts(cart) {
  if (typeof cart['total_count'] == 'number' && isFinite(cart['total_count'])) return cart['total_count'];

  const groups = cart['items'];
  if (!Array.isArray(groups)) return null;

  var total = 0;

  for (const group of groups) {
    const lines = group && group['items'];
    if (!Array.isArray(lines)) continue;

    for (const line of lines) {
      total = total + (typeof line['count'] == 'number' && isFinite(line['count']) ? line['count'] : 1);
    }
  }

  return total;
}

// What this order has to be worth before Picnic will deliver it. Which of these
// carries it is the one thing here that has not been seen in a real response,
// so all three are looked at and none of them being there is a normal outcome.
function minimumOrderValue(cart) {
  if (typeof cart['minimum_order_value'] == 'number') return cart['minimum_order_value'];

  const selected = cart['selected_slot'];

  if (selected !== null && typeof selected == 'object') {
    if (typeof selected['minimum_order_value'] == 'number') return selected['minimum_order_value'];

    const slots = cart['delivery_slots'];

    if (Array.isArray(slots)) {
      const slot = slots.find(slot => slot && slot['slot_id'] == selected['slot_id']);
      if (slot && typeof slot['minimum_order_value'] == 'number') return slot['minimum_order_value'];
    }
  }

  return null;
}

/**
 * What the cart says about itself: the numbers at the top of it rather than the
 * products in it. Picnic hands back the whole cart on every call that touches
 * it and this is asked for it behind someone's back, so a field that is not
 * there leaves that part of the widget empty rather than throwing.
 *
 * @param {string|Object} body the response body
 * @returns {Object|null} the cart, as { totalPrice, productCount, minimumOrderValue }
 */
function parseCart(body) {
  var parsed = body;

  if (typeof body == 'string') {
    try {
      parsed = JSON.parse(body);
    } catch (exception) {
      return null;
    }
  }

  // an array parses as an object, and Picnic answering with a list is Picnic
  // answering with something that is not a cart
  if (parsed === null || typeof parsed != 'object' || Array.isArray(parsed)) return null;

  return {
    "totalPrice": euros(parsed['total_price']),
    "productCount": countProducts(parsed),
    "minimumOrderValue": euros(minimumOrderValue(parsed))
  };
}

module.exports = { parseAddProductResponse, parseCart };
