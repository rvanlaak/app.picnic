// Drives the widget's own script against a stub of the little bit of browser
// it uses, so the states it can end up in are seen rendered rather than read.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');
const test = require('node:test');

const { deriveDeliveryState } = require('../lib/deliverystate.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'widgets', 'delivery', 'public', 'index.html'), 'utf8');
const script = html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1];

// the English labels the app hands over, straight from the locale file
const LABELS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'en.json'), 'utf8')).widget.delivery;

const NODES = ['tile', 'badge', 'status', 'meta', 'headline', 'pre', 'value', 'unit', 'detail', 'when', 'what', 'track', 'fill', 'note'];

function harness(settings) {
  const nodes = {};

  NODES.forEach(id => {
    nodes[id] = {
      textContent: '',
      hidden: false,
      dataset: {},
      style: {},
      addEventListener() { }
    };
  });

  const context = {
    document: { getElementById: id => nodes[id] },
    console: { error() { } },
    Intl,
    Date,
    Promise,
    Object,
    setTimeout() { },
    setInterval() { },
    isNaN,
    isFinite,
    String,
    Math,
    JSON
  };

  vm.createContext(context);
  vm.runInContext(script, context);

  context.onHomeyReady({
    ready() { },
    on() { },
    getSettings: () => settings || {},
    api: () => Promise.resolve(null)
  });

  return {
    nodes,
    adopt: context.adopt,
    headline: () => [nodes.pre, nodes.value, nodes.unit].filter(node => !node.hidden && node.textContent).map(node => node.textContent).join(' '),
    detail: () => [nodes.when.textContent, nodes.what.textContent].filter(Boolean).join(' · ')
  };
}

// What the app hands the widget, with its formatting stood in for: the times
// and days are Homey's business and tested where they are made.
function payload(stored, extra) {
  const derived = deriveDeliveryState(Object.assign({ checkedAt: stored.now }, stored));
  const cart = derived.cart;

  return Object.assign({
    state: derived.state,
    now: stored.now,
    countdownTo: derived.countdownTo,
    progress: derived.progress,
    day: derived.etaStart || derived.deliveredAt ? 'today' : '',
    window: derived.etaStart ? '16:11–16:31' : '',
    deliveredTime: derived.deliveredAt ? '16:18' : '',
    cutOffAt: derived.cutOffAt,
    cutOffLabel: derived.cutOffAt ? 'today 23:00' : '',
    price: ['ordered', 'announced', 'arriving', 'overdue', 'delivered'].indexOf(derived.state) != -1 ? 52.5 : null,
    deposit: derived.delivery ? {
      returned: derived.delivery.depositReturned,
      containers: derived.delivery.returned.map(container => ({ name: container.name, quantity: container.quantity }))
    } : null,
    cart: cart ? {
      totalPrice: cart.totalPrice,
      productCount: cart.productCount,
      minimumShort: cart.minimumShort,
      slotChosen: cart.slotChosen,
      slotClosed: cart.slotClosed,
      slot: cart.slot ? {
        day: 'Sat 20 Sep',
        window: '18:15–19:15',
        cutOffAt: cart.slot.cutOffAt,
        cutOffTime: cart.slot.cutOffAt ? '23:00' : '',
        cutOffDay: cart.slot.cutOffAt ? 'Fri 19 Sep' : '',
        cutOffLabel: cart.slot.cutOffAt ? 'Fri 19 Sep 23:00' : ''
      } : null
    } : null,
    cartKnown: derived.cartKnown,
    checkedLabel: derived.checkedAt ? 'Sun 5 Apr 08:00' : '',
    locale: 'en-US',
    labels: LABELS
  }, extra);
}

const WINDOW = { etaStart: '2026-07-28T16:11:00.000+02:00', etaEnd: '2026-07-28T16:31:00.000+02:00' };
const ANNOUNCED = Object.assign({ orderStatus: 'delivery_announced', announcedAt: '2026-07-28T15:41:00.000+02:00' }, WINDOW);

function cart(extra) {
  return Object.assign({
    totalPrice: 22.03,
    productCount: 9,
    minimumOrderValue: 15,
    slot: { chosen: true, windowStart: '2026-07-30T18:15:00.000+02:00', windowEnd: '2026-07-30T19:15:00.000+02:00', cutOffAt: '2026-07-29T23:00:00.000+02:00' }
  }, extra);
}

test('an announced delivery counts the minutes down and fills the bar', () => {
  const { nodes, adopt, headline, detail } = harness();

  adopt(payload(Object.assign({ now: '2026-07-28T15:56:00.000+02:00' }, ANNOUNCED)));

  assert.strictEqual(nodes.tile.dataset.tone, 'brand');
  assert.strictEqual(nodes.badge.dataset.icon, 'truck');
  assert.strictEqual(nodes.status.textContent, 'On its way');
  assert.strictEqual(headline(), 'in 15 min');
  assert.strictEqual(detail(), 'today · 16:11–16:31');
  assert.strictEqual(nodes.track.hidden, false);
  assert.strictEqual(nodes.fill.style.width, '50%');
  assert.strictEqual(nodes.meta.textContent, '€52.50');
});

test('an order days out counts in days and shows no bar', () => {
  const { nodes, adopt, headline } = harness();

  adopt(payload({
    orderStatus: 'groceries_ordered',
    etaStart: '2026-07-30T16:00:00.000+02:00',
    etaEnd: '2026-07-30T17:00:00.000+02:00',
    now: '2026-07-28T16:00:00.000+02:00'
  }));

  assert.strictEqual(nodes.status.textContent, 'Ordered');
  assert.strictEqual(nodes.badge.dataset.icon, 'scheduled');
  assert.strictEqual(headline(), 'in 2 days');
  assert.strictEqual(nodes.track.hidden, true);
});

test('a single minute left is not pluralised', () => {
  const { adopt, headline } = harness();

  adopt(payload(Object.assign({ now: '2026-07-28T16:10:30.000+02:00' }, ANNOUNCED)));

  assert.strictEqual(headline(), 'in 1 min');
});

test('the window itself says the groceries are arriving', () => {
  const { nodes, adopt, headline } = harness();

  adopt(payload(Object.assign({ now: '2026-07-28T16:16:00.000+02:00' }, ANNOUNCED)));

  assert.strictEqual(nodes.status.textContent, 'Arriving');
  assert.strictEqual(headline(), 'Any minute now');
  assert.strictEqual(nodes.fill.style.width, '25%');
});

test('a delivery that is late says so in its own colour', () => {
  const { nodes, adopt, headline } = harness();

  adopt(payload(Object.assign({ now: '2026-07-28T17:00:00.000+02:00' }, ANNOUNCED)));

  assert.strictEqual(nodes.status.textContent, 'Running late');
  assert.strictEqual(nodes.tile.dataset.tone, 'warn');
  assert.strictEqual(headline(), 'Any minute now');
  assert.strictEqual(nodes.fill.style.width, '100%');
});

test('delivered groceries show the moment they arrived and what they cost', () => {
  const { nodes, adopt, headline, detail } = harness();

  adopt(payload(Object.assign({ orderStatus: 'groceries_delivered', deliveredAt: '2026-07-28T16:18:00.000+02:00', now: '2026-07-28T16:40:00.000+02:00' }, WINDOW)));

  assert.strictEqual(nodes.status.textContent, 'Delivered');
  assert.strictEqual(nodes.tile.dataset.tone, 'good');
  assert.strictEqual(headline(), 'at 16:18');
  assert.strictEqual(detail(), 'today');
  assert.strictEqual(nodes.meta.textContent, '€52.50');
  assert.strictEqual(nodes.note.hidden, true);
});

test('deposit that came back is shown with the delivery', () => {
  const { nodes, adopt, detail } = harness();

  adopt(payload(Object.assign({
    orderStatus: 'groceries_delivered',
    deliveredAt: '2026-07-28T16:18:00.000+02:00',
    delivery: { deliveredAt: '2026-07-28T16:18:00.000+02:00', totalPrice: 22.03, depositReturned: 4.8, returned: [{ name: 'Bottles', quantity: 6, amount: 0.9 }, { name: 'Crates', quantity: 1, amount: 3.9 }] },
    now: '2026-07-28T16:40:00.000+02:00'
  }, WINDOW)));

  assert.strictEqual(detail(), 'today · 6× Bottles, 1× Crates');
  assert.strictEqual(nodes.note.textContent, '+€4.80 deposit back');
  assert.strictEqual(nodes.note.dataset.tone, 'good');
});

test('four hours after the delivery the widget has moved on', () => {
  const { nodes, adopt, headline, detail } = harness();

  adopt(payload(Object.assign({ orderStatus: 'groceries_delivered', deliveredAt: '2026-07-28T12:00:00.000+02:00', now: '2026-07-28T16:01:00.000+02:00' }, WINDOW), { cartKnown: true }));

  assert.strictEqual(nodes.status.textContent, '');
  assert.strictEqual(headline(), 'Nothing planned');
  assert.strictEqual(detail(), 'Your cart is empty');
  assert.strictEqual(nodes.meta.textContent, '');
});

test('nothing planned and nothing known about the cart says only the first', () => {
  const { adopt, detail, nodes } = harness();

  adopt(payload({ orderStatus: '', now: '2026-07-28T16:40:00.000+02:00' }));

  assert.strictEqual(detail(), '');
  assert.strictEqual(nodes.detail.hidden, true);
  assert.strictEqual(nodes.tile.dataset.tone, 'muted');
});

test('an app that cannot reach Picnic asks for a sign in', () => {
  const { adopt, headline, nodes } = harness();

  adopt(payload(Object.assign({ signInNeeded: true, now: '2026-07-28T16:40:00.000+02:00' }, ANNOUNCED)));

  assert.strictEqual(headline(), 'Sign in again');
  assert.strictEqual(nodes.badge.dataset.icon, 'alert');
});

test('an order Picnic has not confirmed in months is not retold as late', () => {
  const { nodes, adopt, headline, detail } = harness();

  adopt(payload(Object.assign({}, ANNOUNCED, {
    etaStart: '2026-04-05T09:04:00.000+02:00',
    etaEnd: '2026-04-05T09:24:00.000+02:00',
    checkedAt: '2026-04-05T08:00:00.000+02:00',
    now: '2026-09-17T11:42:00.000+02:00'
  })));

  assert.strictEqual(headline(), 'No recent word from Picnic');
  assert.strictEqual(detail(), 'Last updated Sun 5 Apr 08:00');
  assert.strictEqual(nodes.meta.textContent, '');
  assert.strictEqual(nodes.track.hidden, true);
});

test('amounts can be turned off', () => {
  const { nodes, adopt, headline } = harness({ show_price: false });

  adopt(payload(Object.assign({ now: '2026-07-28T15:56:00.000+02:00' }, ANNOUNCED)));
  assert.strictEqual(nodes.meta.textContent, '');

  adopt(payload({ orderStatus: '', cart: cart({ slot: null }), now: '2026-07-28T10:00:00.000+02:00' }));
  assert.strictEqual(headline(), '9 products');

  // and a cart with a slot keeps its deadline, just not the amount under it
  const deadline = harness({ show_price: false });
  deadline.adopt(payload({ orderStatus: '', cart: cart(), now: '2026-07-28T10:00:00.000+02:00' }));
  assert.strictEqual(deadline.headline(), 'before 23:00 Fri 19 Sep');
  assert.strictEqual(deadline.detail(), 'Sat 20 Sep 18:15–19:15');
});

test('a clock that runs ahead of Homey does not count down to the wrong minute', () => {
  const { adopt, headline } = harness();
  const realNow = Date.now;
  // the dashboard is showing on something four minutes fast
  Date.now = () => realNow() + 4 * 60 * 1000;

  try {
    adopt(payload(Object.assign({ now: '2026-07-28T15:56:00.000+02:00' }, ANNOUNCED)));

    assert.strictEqual(headline(), 'in 15 min');
  } finally {
    Date.now = realNow;
  }
});

test('an order that can still be added to says until when', () => {
  const { nodes, adopt } = harness();

  adopt(payload({
    orderStatus: 'groceries_ordered',
    etaStart: '2026-07-28T16:00:00.000+02:00',
    etaEnd: '2026-07-28T17:00:00.000+02:00',
    cutOffAt: '2026-07-28T14:00:00.000+02:00',
    now: '2026-07-28T10:00:00.000+02:00'
  }));

  assert.strictEqual(nodes.note.hidden, false);
  assert.strictEqual(nodes.note.textContent, 'Add until today 23:00');
  assert.strictEqual(nodes.note.dataset.tone, '');
});

test('the last hour before an order closes is counted down and called out', () => {
  const { nodes, adopt } = harness();

  adopt(payload({
    orderStatus: 'groceries_ordered',
    etaStart: '2026-07-28T16:00:00.000+02:00',
    etaEnd: '2026-07-28T17:00:00.000+02:00',
    cutOffAt: '2026-07-28T14:00:00.000+02:00',
    now: '2026-07-28T13:35:00.000+02:00'
  }));

  assert.strictEqual(nodes.note.textContent, '25 min left to add');
  assert.strictEqual(nodes.note.dataset.tone, 'warn');
});

test('a cut off that has passed has nothing left to say', () => {
  const { nodes, adopt } = harness();

  adopt(payload({
    orderStatus: 'groceries_ordered',
    etaStart: '2026-07-28T16:00:00.000+02:00',
    etaEnd: '2026-07-28T17:00:00.000+02:00',
    cutOffAt: '2026-07-28T14:00:00.000+02:00',
    now: '2026-07-28T14:30:00.000+02:00'
  }));

  assert.strictEqual(nodes.note.hidden, true);
  assert.strictEqual(nodes.note.textContent, '');
});

test('a cart while an order is open is what still has to go onto that order', () => {
  const { nodes, adopt, headline } = harness();

  adopt(payload({
    orderStatus: 'groceries_ordered',
    etaStart: '2026-07-28T16:00:00.000+02:00',
    etaEnd: '2026-07-28T17:00:00.000+02:00',
    cutOffAt: '2026-07-27T23:00:00.000+02:00',
    cart: cart({ totalPrice: 12.4, productCount: 3 }),
    now: '2026-07-27T19:00:00.000+02:00'
  }));

  // the delivery is still the headline, the things not on it yet the note
  assert.strictEqual(headline(), 'in 21 hours');
  assert.strictEqual(nodes.note.textContent, '€12.40 still to add, until today 23:00');
  assert.strictEqual(nodes.note.dataset.tone, 'warn');
});

test('the last hour to add to an open order counts down next to the amount', () => {
  const { nodes, adopt } = harness();

  adopt(payload({
    orderStatus: 'groceries_ordered',
    etaStart: '2026-07-28T16:00:00.000+02:00',
    etaEnd: '2026-07-28T17:00:00.000+02:00',
    cutOffAt: '2026-07-27T23:00:00.000+02:00',
    cart: cart({ totalPrice: 12.4, productCount: 3 }),
    now: '2026-07-27T22:35:00.000+02:00'
  }));

  assert.strictEqual(nodes.note.textContent, '€12.40 still to add, 25 min left');
});

test('a cart with a slot picked is not an order yet, and says until when it can become one', () => {
  const { nodes, adopt, headline, detail } = harness();

  adopt(payload({ orderStatus: '', cart: cart(), now: '2026-07-28T10:00:00.000+02:00' }));

  assert.strictEqual(nodes.status.textContent, 'Not ordered yet');
  assert.strictEqual(nodes.tile.dataset.tone, 'brand');
  assert.strictEqual(nodes.badge.dataset.icon, 'basket');
  assert.strictEqual(headline(), 'before 23:00 Fri 19 Sep');
  assert.strictEqual(detail(), '€22.03 · Sat 20 Sep 18:15–19:15');
  assert.strictEqual(nodes.meta.textContent, '9 products');
  assert.strictEqual(nodes.note.hidden, true);
});

test('a deadline today goes without its day', () => {
  const { adopt, headline } = harness();

  adopt(payload({ orderStatus: '', cart: cart(), now: '2026-07-28T10:00:00.000+02:00' }, {
    cart: { totalPrice: 32.86, productCount: 18, minimumShort: 12.14, slotChosen: true, slotClosed: false, slot: { day: 'tomorrow', window: '08:30–09:30', cutOffAt: '2026-07-29T13:00:00.000+02:00', cutOffTime: '13:00', cutOffDay: 'today' } }
  }));

  assert.strictEqual(headline(), 'before 13:00');
});

test('the order deadline and the missing amount are both said', () => {
  const { nodes, adopt, headline } = harness();

  adopt(payload({ orderStatus: '', cart: cart({ totalPrice: 32.86, productCount: 18, minimumOrderValue: 45 }), now: '2026-07-28T10:00:00.000+02:00' }));

  assert.strictEqual(headline(), 'before 23:00 Fri 19 Sep');
  assert.strictEqual(nodes.note.textContent, '€12.14 short of the minimum');
  assert.strictEqual(nodes.note.dataset.tone, 'warn');
});

test('the last hour to order a picked slot is counted down, in the colour to hurry in', () => {
  const { nodes, adopt, headline } = harness();

  adopt(payload({ orderStatus: '', cart: cart(), now: '2026-07-29T22:20:00.000+02:00' }));

  assert.strictEqual(headline(), 'in 40 min');
  assert.strictEqual(nodes.tile.dataset.tone, 'warn');
});

test('a picked slot whose deadline passed is said to be too late, not unpicked', () => {
  const { adopt, headline, detail } = harness();

  adopt(payload({ orderStatus: '', cart: cart(), now: '2026-07-29T23:30:00.000+02:00' }));

  assert.strictEqual(headline(), '€22.03');
  assert.strictEqual(detail(), 'Too late for this slot');
});

test('a cart without a picked slot says none was picked, rather than naming Picnic\'s guess', () => {
  const { adopt, headline, detail } = harness();

  adopt(payload({
    orderStatus: '',
    cart: cart({ slot: { chosen: false, windowStart: '2026-07-28T18:15:00.000+02:00', windowEnd: '2026-07-28T19:15:00.000+02:00' } }),
    now: '2026-07-28T10:00:00.000+02:00'
  }));

  assert.strictEqual(headline(), '€22.03');
  assert.strictEqual(detail(), 'No delivery slot picked');
});

test('a cart below the minimum says how much is missing', () => {
  const { nodes, adopt } = harness();

  adopt(payload({ orderStatus: '', cart: cart({ totalPrice: 28.2, productCount: 1, minimumOrderValue: 35 }), now: '2026-07-28T10:00:00.000+02:00' }));

  assert.strictEqual(nodes.meta.textContent, '1 product');
  assert.strictEqual(nodes.note.textContent, '€6.80 short of the minimum');
  assert.strictEqual(nodes.note.dataset.tone, 'warn');
});

test('a cart that can no longer be added to an order is not held over the reader', () => {
  const { nodes, adopt, headline } = harness();

  adopt(payload(Object.assign({ cutOffAt: '2026-07-27T23:00:00.000+02:00', cart: cart(), now: '2026-07-28T15:56:00.000+02:00' }, ANNOUNCED)));

  assert.strictEqual(headline(), 'in 15 min');
  assert.strictEqual(nodes.note.hidden, true);
});

test('amounts are written in Homey\'s language', () => {
  const { adopt, headline } = harness();

  adopt(payload({ orderStatus: '', cart: cart({ slot: null }), now: '2026-07-28T10:00:00.000+02:00' }, { locale: 'nl' }));

  assert.strictEqual(headline(), '€ 22,03');
});

test('no countdown on the widget is ever finer than a minute', () => {
  const seconds = script.match(/\/\s*1000\b/g);

  // the only divisions by a thousand would be seconds; minutes, hours and days
  // are divided by 60000 and up
  assert.strictEqual(seconds, null);
});

test('the widget no longer does anything when tapped', () => {
  assert.strictEqual(/popup|hapticFeedback|addEventListener\('click'/.test(script), false);
});
