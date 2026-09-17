'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { deriveDeliveryState } = require('../lib/deliverystate.js');

const WINDOW_START = "2026-07-28T16:00:00.000+02:00";
const WINDOW_END = "2026-07-28T17:00:00.000+02:00";

function stored(extra) {
  return Object.assign({
    orderStatus: "delivery_announced",
    etaStart: WINDOW_START,
    etaEnd: WINDOW_END,
    announcedAt: "2026-07-28T15:00:00.000+02:00",
    now: "2026-07-28T15:30:00.000+02:00"
  }, extra);
}

test('nothing ordered leaves the widget with nothing to show', () => {
  const state = deriveDeliveryState({ orderStatus: "", now: WINDOW_START });

  assert.strictEqual(state.state, "idle");
  assert.strictEqual(state.countdownTo, null);
  assert.strictEqual(state.progress, null);
});

test('an app that cannot reach Picnic says so rather than that nothing is planned', () => {
  const state = deriveDeliveryState(stored({ signInNeeded: true }));

  assert.strictEqual(state.state, "signed_out");
});

test('an ordered delivery counts down to the start of its slot', () => {
  const state = deriveDeliveryState(stored({ orderStatus: "groceries_ordered", announcedAt: null }));

  assert.strictEqual(state.state, "ordered");
  assert.strictEqual(state.countdownTo, WINDOW_START);
  assert.strictEqual(state.etaEnd, WINDOW_END);
});

test('an ordered delivery leaves the bar empty, it is the announcement that draws near', () => {
  const state = deriveDeliveryState(stored({ orderStatus: "groceries_ordered" }));

  assert.strictEqual(state.progress, null);
});

test('an announced delivery fills the bar between the announcement and the window', () => {
  const state = deriveDeliveryState(stored());

  assert.strictEqual(state.state, "announced");
  assert.strictEqual(state.countdownTo, WINDOW_START);
  assert.strictEqual(state.progress, 0.5);
});

test('an announcement from a version that did not store its moment falls back to the last hour', () => {
  const state = deriveDeliveryState(stored({ announcedAt: null, now: "2026-07-28T15:45:00.000+02:00" }));

  assert.strictEqual(state.progress, 0.75);
});

test('an announcement that arrives within the fallback hour does not start the bar half full', () => {
  const state = deriveDeliveryState(stored({
    announcedAt: "2026-07-28T15:50:00.000+02:00",
    now: "2026-07-28T15:50:00.000+02:00"
  }));

  assert.strictEqual(state.progress, 0);
});

test('an order without a window says it was ordered and counts down to nothing', () => {
  const state = deriveDeliveryState(stored({ etaStart: null, etaEnd: null }));

  assert.strictEqual(state.state, "ordered");
  assert.strictEqual(state.countdownTo, null);
});

test('the window itself has the groceries arriving', () => {
  const state = deriveDeliveryState(stored({ now: "2026-07-28T16:15:00.000+02:00" }));

  assert.strictEqual(state.state, "arriving");
  assert.strictEqual(state.countdownTo, null);
  assert.strictEqual(state.progress, 0.25);
});

test('the start of the window is already arriving rather than a countdown of zero', () => {
  const state = deriveDeliveryState(stored({ now: WINDOW_START }));

  assert.strictEqual(state.state, "arriving");
  assert.strictEqual(state.progress, 0);
});

test('an order still open past its window is overdue', () => {
  const state = deriveDeliveryState(stored({ now: "2026-07-28T17:20:00.000+02:00" }));

  assert.strictEqual(state.state, "overdue");
  assert.strictEqual(state.progress, 1);
});

test('a window without an end is overdue once its start has passed', () => {
  const state = deriveDeliveryState(stored({ etaEnd: null, now: "2026-07-28T16:15:00.000+02:00" }));

  assert.strictEqual(state.state, "overdue");
});

test('groceries that just arrived are shown as delivered', () => {
  const state = deriveDeliveryState(stored({
    orderStatus: "groceries_delivered",
    deliveredAt: "2026-07-28T16:18:00.000+02:00",
    now: "2026-07-28T16:30:00.000+02:00"
  }));

  assert.strictEqual(state.state, "delivered");
  assert.strictEqual(state.deliveredAt, "2026-07-28T16:18:00.000+02:00");
});

test('a delivery from this morning is gone by the evening', () => {
  const state = deriveDeliveryState(stored({
    orderStatus: "groceries_delivered",
    deliveredAt: "2026-07-28T09:00:00.000+02:00",
    now: "2026-07-28T20:00:00.000+02:00"
  }));

  assert.strictEqual(state.state, "idle");
});

test('a delivery moment that cannot be read leaves the widget empty rather than delivered', () => {
  const state = deriveDeliveryState(stored({
    orderStatus: "groceries_delivered",
    deliveredAt: "not a timestamp",
    now: "2026-07-28T20:00:00.000+02:00"
  }));

  assert.strictEqual(state.state, "idle");
});

test('an unreadable window is treated as no window at all', () => {
  const state = deriveDeliveryState(stored({ etaStart: "whenever", etaEnd: "whenever" }));

  assert.strictEqual(state.state, "ordered");
  assert.strictEqual(state.countdownTo, null);
});

test('an order that can still be changed carries the moment it closes', () => {
  const state = deriveDeliveryState(stored({
    orderStatus: "groceries_ordered",
    cutOffAt: "2026-07-28T14:00:00.000+02:00",
    now: "2026-07-28T10:00:00.000+02:00"
  }));

  assert.strictEqual(state.cutOffAt, "2026-07-28T14:00:00.000+02:00");
});

test('a cut off that has passed is not carried any further', () => {
  const state = deriveDeliveryState(stored({
    orderStatus: "groceries_ordered",
    cutOffAt: "2026-07-28T14:00:00.000+02:00",
    now: "2026-07-28T14:00:01.000+02:00"
  }));

  assert.strictEqual(state.cutOffAt, null);
});

test('a delivery on its way is past changing, whatever the stored cut off says', () => {
  const state = deriveDeliveryState(stored({
    cutOffAt: "2026-07-28T23:00:00.000+02:00",
    now: "2026-07-28T16:15:00.000+02:00"
  }));

  assert.strictEqual(state.state, "arriving");
  assert.strictEqual(state.cutOffAt, null);
});

test('a delivered order left no cut off behind', () => {
  const state = deriveDeliveryState(stored({
    orderStatus: "groceries_delivered",
    deliveredAt: "2026-07-28T16:18:00.000+02:00",
    cutOffAt: "2026-07-28T23:00:00.000+02:00",
    now: "2026-07-28T16:30:00.000+02:00"
  }));

  assert.strictEqual(state.cutOffAt, null);
});

test('an unreadable cut off is left out rather than shown as a moment in 1970', () => {
  const state = deriveDeliveryState(stored({
    orderStatus: "groceries_ordered",
    cutOffAt: "any time now",
    now: "2026-07-28T10:00:00.000+02:00"
  }));

  assert.strictEqual(state.cutOffAt, null);
});
