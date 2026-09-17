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

const LABELS = {
  'signed-out': 'Sign in on the Picnic app settings page',
  'idle': 'No delivery planned',
  'ordered': 'Ordered',
  'announced': 'On its way',
  'arriving': 'Arriving',
  'delivered': 'Delivered',
  'overdue': 'Later than planned',
  'now': 'Any minute now',
  'cart': 'In your cart',
  'item': '__n__ product',
  'items': '__n__ products',
  'minimum': '__t__ to the minimum',
  'cut-off-at': 'Add until __t__',
  'cut-off-in': '__n__ min left to add',
  'day': 'in __n__ day',
  'days': 'in __n__ days',
  'hour': 'in __n__ hour',
  'hours': 'in __n__ hours',
  'minute': 'in __n__ min',
  'minutes': 'in __n__ min'
};

function harness(settings) {
  const nodes = {};
  const listeners = {};

  ['delivery', 'top', 'state', 'price', 'headline', 'detail', 'track', 'fill', 'footnote'].forEach(id => {
    nodes[id] = {
      textContent: '',
      hidden: false,
      dataset: {},
      style: { setProperty(name, value) { this[name] = value; } },
      addEventListener(event, listener) { listeners[id + ':' + event] = listener; }
    };
  });

  const opened = [];
  const haptics = [];

  const context = {
    document: { getElementById: id => nodes[id] },
    console: { error() { } },
    Intl,
    Date,
    Promise,
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

  const api = {
    ready() { },
    on() { },
    getSettings: () => settings || {},
    api: () => Promise.resolve(null),
    popup(url) { opened.push(url); return Promise.resolve(); },
    hapticFeedback() { haptics.push(true); }
  };
  context.onHomeyReady(api);

  return {
    nodes,
    opened,
    haptics,
    adopt: context.adopt,
    tap: () => listeners['delivery:click']()
  };
}

function state(stored, extra) {
  const derived = deriveDeliveryState(stored);

  return Object.assign(derived, {
    now: stored.now,
    windowStart: derived.etaStart ? '16:11' : '',
    windowEnd: derived.etaEnd ? '16:31' : '',
    deliveredTime: derived.deliveredAt ? '16:18' : '',
    day: derived.etaStart || derived.deliveredAt ? 'today' : '',
    cutOffTime: derived.cutOffAt ? '14:00' : '',
    price: 52.5,
    cart: null,
    popupUrl: 'https://picnic.app',
    labels: LABELS
  }, extra);
}

const WINDOW = { etaStart: '2026-07-28T16:11:00.000+02:00', etaEnd: '2026-07-28T16:31:00.000+02:00' };

test('an announced delivery counts the minutes down and fills the bar', () => {
  const { nodes, adopt } = harness();

  adopt(state(Object.assign({
    orderStatus: 'delivery_announced',
    announcedAt: '2026-07-28T15:41:00.000+02:00',
    now: '2026-07-28T15:56:00.000+02:00'
  }, WINDOW)));

  assert.strictEqual(nodes.state.textContent, 'On its way');
  assert.strictEqual(nodes.headline.textContent, 'in 15 min');
  assert.strictEqual(nodes.detail.textContent, 'today · 16:11 – 16:31');
  assert.strictEqual(nodes.track.hidden, false);
  assert.strictEqual(nodes.fill.style.width, '50%');
  assert.strictEqual(nodes.price.textContent, '€52.50');
});

test('an order days out counts in days and shows no bar', () => {
  const { nodes, adopt } = harness();

  adopt(state({
    orderStatus: 'groceries_ordered',
    etaStart: '2026-07-30T16:00:00.000+02:00',
    etaEnd: '2026-07-30T17:00:00.000+02:00',
    now: '2026-07-28T16:00:00.000+02:00'
  }));

  assert.strictEqual(nodes.state.textContent, 'Ordered');
  assert.strictEqual(nodes.headline.textContent, 'in 2 days');
  assert.strictEqual(nodes.track.hidden, true);
});

test('a single minute left is not pluralised', () => {
  const { nodes, adopt } = harness();

  adopt(state(Object.assign({
    orderStatus: 'delivery_announced',
    announcedAt: '2026-07-28T15:41:00.000+02:00',
    now: '2026-07-28T16:10:30.000+02:00'
  }, WINDOW)));

  assert.strictEqual(nodes.headline.textContent, 'in 1 min');
});

test('the window itself says the groceries are arriving', () => {
  const { nodes, adopt } = harness();

  adopt(state(Object.assign({
    orderStatus: 'delivery_announced',
    announcedAt: '2026-07-28T15:41:00.000+02:00',
    now: '2026-07-28T16:16:00.000+02:00'
  }, WINDOW)));

  assert.strictEqual(nodes.state.textContent, 'Arriving');
  assert.strictEqual(nodes.headline.textContent, 'Any minute now');
  assert.strictEqual(nodes.fill.style.width, '25%');
});

test('a delivery that is late says so instead of counting on', () => {
  const { nodes, adopt } = harness();

  adopt(state(Object.assign({
    orderStatus: 'delivery_announced',
    announcedAt: '2026-07-28T15:41:00.000+02:00',
    now: '2026-07-28T17:00:00.000+02:00'
  }, WINDOW)));

  assert.strictEqual(nodes.headline.textContent, 'Later than planned');
  assert.strictEqual(nodes.fill.style.width, '100%');
});

test('delivered groceries show the moment they arrived', () => {
  const { nodes, adopt } = harness();

  adopt(state({
    orderStatus: 'groceries_delivered',
    deliveredAt: '2026-07-28T16:18:00.000+02:00',
    now: '2026-07-28T16:40:00.000+02:00'
  }));

  assert.strictEqual(nodes.state.textContent, 'Delivered');
  assert.strictEqual(nodes.headline.textContent, '16:18');
  assert.strictEqual(nodes.detail.textContent, 'today');
  // the price belongs to the order that was just delivered, so it stays until
  // the order itself drops off the widget
  assert.strictEqual(nodes.price.textContent, '€52.50');
});

test('nothing planned hides the order line entirely', () => {
  const { nodes, adopt } = harness();

  adopt(state({ orderStatus: '', now: '2026-07-28T16:40:00.000+02:00' }));

  assert.strictEqual(nodes.top.hidden, true);
  assert.strictEqual(nodes.headline.textContent, 'No delivery planned');
  assert.strictEqual(nodes.headline.dataset.kind, 'message');
  assert.strictEqual(nodes.track.hidden, true);
});

test('an app that cannot reach Picnic asks for a sign in', () => {
  const { nodes, adopt } = harness();

  adopt(state({ orderStatus: 'delivery_announced', signInNeeded: true, now: '2026-07-28T16:40:00.000+02:00' }));

  assert.strictEqual(nodes.headline.textContent, 'Sign in on the Picnic app settings page');
});

test('the price can be turned off', () => {
  const { nodes, adopt } = harness({ show_price: false });

  adopt(state(Object.assign({
    orderStatus: 'delivery_announced',
    announcedAt: '2026-07-28T15:41:00.000+02:00',
    now: '2026-07-28T15:56:00.000+02:00'
  }, WINDOW)));

  assert.strictEqual(nodes.price.hidden, true);
});

test('a clock that runs ahead of Homey does not count down to the wrong minute', () => {
  const { nodes, adopt } = harness();
  const realNow = Date.now;
  // the dashboard is showing on something four minutes fast
  Date.now = () => realNow() + 4 * 60 * 1000;

  try {
    adopt(state(Object.assign({
      orderStatus: 'delivery_announced',
      announcedAt: '2026-07-28T15:41:00.000+02:00',
      now: '2026-07-28T15:56:00.000+02:00'
    }, WINDOW)));

    assert.strictEqual(nodes.headline.textContent, 'in 15 min');
  } finally {
    Date.now = realNow;
  }
});

test('an order that can still be added to says until when', () => {
  const { nodes, adopt } = harness();

  adopt(state({
    orderStatus: 'groceries_ordered',
    etaStart: '2026-07-28T16:00:00.000+02:00',
    etaEnd: '2026-07-28T17:00:00.000+02:00',
    cutOffAt: '2026-07-28T14:00:00.000+02:00',
    now: '2026-07-28T10:00:00.000+02:00'
  }));

  assert.strictEqual(nodes.footnote.hidden, false);
  assert.strictEqual(nodes.footnote.textContent, 'Add until 14:00');
  assert.strictEqual(nodes.footnote.dataset.urgent, 'false');
});

test('the last hour before an order closes is counted down and called out', () => {
  const { nodes, adopt } = harness();

  adopt(state({
    orderStatus: 'groceries_ordered',
    etaStart: '2026-07-28T16:00:00.000+02:00',
    etaEnd: '2026-07-28T17:00:00.000+02:00',
    cutOffAt: '2026-07-28T14:00:00.000+02:00',
    now: '2026-07-28T13:35:00.000+02:00'
  }));

  assert.strictEqual(nodes.footnote.textContent, '25 min left to add');
  assert.strictEqual(nodes.footnote.dataset.urgent, 'true');
});

test('a cut off that has passed has nothing left to say', () => {
  const { nodes, adopt } = harness();

  adopt(state({
    orderStatus: 'groceries_ordered',
    etaStart: '2026-07-28T16:00:00.000+02:00',
    etaEnd: '2026-07-28T17:00:00.000+02:00',
    cutOffAt: '2026-07-28T14:00:00.000+02:00',
    now: '2026-07-28T14:30:00.000+02:00'
  }));

  assert.strictEqual(nodes.footnote.hidden, true);
  assert.strictEqual(nodes.footnote.textContent, '');
});

test('with nothing planned the cart is what the widget has to say', () => {
  const { nodes, adopt } = harness();

  adopt(state({ orderStatus: '', now: '2026-07-28T10:00:00.000+02:00' }, {
    cart: { totalPrice: 43.2, productCount: 12, minimumOrderValue: 35 }
  }));

  assert.strictEqual(nodes.top.hidden, false);
  assert.strictEqual(nodes.state.textContent, 'In your cart');
  assert.strictEqual(nodes.headline.textContent, '€43.20');
  assert.strictEqual(nodes.detail.textContent, '12 products');
  assert.strictEqual(nodes.footnote.hidden, true);
  // the price of the last order would read as the price of this cart
  assert.strictEqual(nodes.price.hidden, true);
});

test('a cart below the minimum says how much is missing', () => {
  const { nodes, adopt } = harness();

  adopt(state({ orderStatus: '', now: '2026-07-28T10:00:00.000+02:00' }, {
    cart: { totalPrice: 28.2, productCount: 1, minimumOrderValue: 35 }
  }));

  assert.strictEqual(nodes.detail.textContent, '1 product');
  assert.strictEqual(nodes.footnote.textContent, '€6.80 to the minimum');
  assert.strictEqual(nodes.footnote.dataset.urgent, 'true');
});

test('an empty cart is not worth a tile', () => {
  const { nodes, adopt } = harness();

  adopt(state({ orderStatus: '', now: '2026-07-28T10:00:00.000+02:00' }, {
    cart: { totalPrice: 0, productCount: 0, minimumOrderValue: 35 }
  }));

  assert.strictEqual(nodes.headline.textContent, 'No delivery planned');
  assert.strictEqual(nodes.top.hidden, true);
});

test('a cart Picnic answered with something unreadable changes nothing', () => {
  const { nodes, adopt } = harness();

  adopt(state({ orderStatus: '', now: '2026-07-28T10:00:00.000+02:00' }, {
    cart: { totalPrice: null, productCount: null, minimumOrderValue: null }
  }));

  assert.strictEqual(nodes.headline.textContent, 'No delivery planned');
});

test('the cart stays out of the way of a delivery that is coming', () => {
  const { nodes, adopt } = harness();

  adopt(state({
    orderStatus: 'delivery_announced',
    etaStart: '2026-07-28T16:11:00.000+02:00',
    etaEnd: '2026-07-28T16:31:00.000+02:00',
    announcedAt: '2026-07-28T15:41:00.000+02:00',
    now: '2026-07-28T15:56:00.000+02:00'
  }, { cart: { totalPrice: 43.2, productCount: 12, minimumOrderValue: 35 } }));

  assert.strictEqual(nodes.state.textContent, 'On its way');
  assert.strictEqual(nodes.headline.textContent, 'in 15 min');
});

test('tapping the widget opens Picnic, with a buzz to say it was noticed', () => {
  const { adopt, tap, opened, haptics } = harness();

  adopt(state({ orderStatus: '', now: '2026-07-28T10:00:00.000+02:00' }));
  tap();

  assert.deepStrictEqual(opened, ['https://picnic.app']);
  assert.strictEqual(haptics.length, 1);
});

test('tapping does nothing when that was turned off', () => {
  const { adopt, tap, opened } = harness({ open_on_tap: false });

  adopt(state({ orderStatus: '', now: '2026-07-28T10:00:00.000+02:00' }));
  tap();

  assert.deepStrictEqual(opened, []);
});

test('a tap before the first state has arrived is not a tap into nothing', () => {
  const { tap, opened } = harness();

  tap();

  assert.deepStrictEqual(opened, []);
});

test('no countdown on the widget is ever finer than a minute', () => {
  const seconds = script.match(/\/\s*1000\b/g);

  // the only divisions by a thousand would be seconds; minutes, hours and days
  // are divided by 60000 and up
  assert.strictEqual(seconds, null);
});
