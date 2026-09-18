# What still has to be verified

The dashboard widget was first built without the Homey Apps SDK documentation
and without a Picnic account. Since then the documentation has been read, the
unofficial Picnic API clients and their captured responses have been compared
against what the app reads, and the app has run against a real account. What
that settled is ticked off below, with where it was settled; what is left open
is what still needs a Homey or a logged in account to look at.

## Homey SDK

- [x] **Widget settings schema.** `{"id", "type": "checkbox", "value", "title"}`
  is the documented shape; `value` is the initial value. Other types are
  `text`, `textarea`, `number`, `dropdown` and `autocomplete`.
  → https://apps.developer.homey.app/the-basics/widgets/settings
- [x] **Style library names.** `homey-widget`, `homey-text-bold`,
  `homey-text-small` and `--homey-su-1` to `--homey-su-8` all exist. Muted text
  now uses `--homey-text-color-light` ("text that's less important") rather
  than an opacity, and the warning colour `--homey-color-warning`.
  → https://apps.developer.homey.app/the-basics/widgets/styling
- [x] **`/homey.js`.** Not included in widget examples nor in the CLI template;
  only app settings pages need the script tag. A widget defines a global
  `onHomeyReady(Homey)`. → https://apps.developer.homey.app/the-basics/widgets
- [ ] **Realtime events.** `this.homey.api.realtime(event, data)` is documented
  for the app and `Homey.on(event, cb)` for the widget, with no prefix or
  registration mentioned, but the docs never say in so many words that the one
  reaches the other. Confirm on a dashboard; the widget still asks again every
  30 seconds if it does not.
- [x] **Compatibility.** The docs require `>=12.3.0` for an app with a widget
  (the CLI's validator only asks for `>=12.1.0`), and the app now asks for it.
  → https://apps.developer.homey.app/the-basics/widgets
- [x] **Preview images.** 1024×1024 with a transparent background, drawn as the
  shape of the widget: the icon badge, its lines as plain bars and the bar that
  fills, with nothing written on them and no logo, which is what the guidelines
  ask for. Worth one look in the widget picker itself, in both themes.
  → https://apps.developer.homey.app/app-store/guidelines (1.10)
- [x] **Height.** A number in `widget.compose.json` is pixels, a percentage an
  aspect ratio; `Homey.ready({ height })` overrides it and the docs advise
  against using both. The static 188 stays.
- [ ] **`homey app compose`.** Run it and confirm the diff to `app.json` is empty.
- [ ] **The real tools.** `homey app validate --level publish`, then look at the
  widget in all of its states on a dashboard.

## Picnic API

The fields below were compared against `python-picnic-api2` (whose tests carry
captured responses from July 2026), the TypeScript `picnic-api` types and Home
Assistant's Picnic integration.

- [x] **`slot.cut_off_time`** is in `/api/15/deliveries/summary`, and in the
  captured responses it matches the 13:00 / 23:00 rule in `lib/cutoff.js`, which
  Picnic's own FAQ states for the Netherlands as well. Picnic's value is still
  preferred over the rule.
- [x] **Order price.** `orders[].total_price` is in cents; summing it over the
  orders of a delivery is what Home Assistant does too. Whether it includes the
  deposit is not documented anywhere.
- [x] **A delivery in full.** `GET /api/15/deliveries/{id}` carries
  `delivery_time` (`{ start, end }`), the orders with `checkout_total_price`
  and `total_deposit`, and `returned_containers`. The widget asks for it while
  it shows a delivery that has been made, which is how it can say when the
  groceries really arrived rather than when the poll noticed.
- [x] **`/api/15/cart` totals.** `total_price` and `checkout_total_price` in
  cents, `total_count` a number of products.
- [x] **Minimum order value.** It lives on the entries of `delivery_slots`, in
  cents, and is absent on past slots. `selected_slot` is `{ slot_id, state }`,
  where Home Assistant only trusts a `state` of `EXPLICIT`. `lib/cartresponse.js`
  looks it up through `selected_slot` whatever its state; worth tightening once
  a cart with an implicitly selected slot has been seen.
- [x] **A second factor still to be verified.** Seen on a real account: every
  request with a token whose second factor has not been verified is refused
  with HTTP 403 and `{"error":{"code":"TWO_FACTOR_AUTHENTICATION_REQUIRED"}}`.
  None of the public clients handle this code. The app now treats it as a
  sign-in being needed rather than as a failed poll, which is what left the
  widget showing an order from months before as running late.
- [x] **What the total means.** The widget showed €33,14 for a cart the Picnic
  app put at €32,86. Picnic works the cart out for the app version a client
  claims in `x-picnic-agent`, and this app claimed 1.15.233: that cart had no
  BundelBonus deals and no separate Family discount. Claiming 1.236.1, what the
  maintained TypeScript client sends, gave `total_price` 3286, `total_savings`
  927 and `membership_savings` 147, the Picnic app's total, other discounts and
  Family discount to the cent. Login, the poll and the cart all work with it.
  → `docs/picnic-api.md`, `lib/picnicheaders.js`
- [ ] **Which total the minimum is measured against.** Still unconfirmed, and
  the same four cents apply to it.
- [ ] **What a returned container is worth.** `returned_containers` entries are
  read as `{ localized_name, quantity, price }` with `price` per unit, so the
  deposit shown back is the sum of `price * quantity`. No captured response
  has a non-empty list in it, so `price` could as easily be the total for that
  line, which would make the widget overstate the refund. Check it against a
  delivery whose deposit has been counted before trusting the amount.
- [ ] **When the deposit is counted.** The refund only appears once Picnic has
  counted what went back, and the widget drops the delivery four hours after it
  arrived. If counting usually takes longer than that, nobody will ever see it
  and it belongs somewhere else, such as a notification or a flow trigger.
- [ ] **A cart with an implicitly selected slot.** `selected_slot.state` is
  `EXPLICIT` once a delivery moment is picked and `IMPLICIT` while it is
  Picnic's own suggestion, which is what the widget says "no delivery slot
  picked" on. `ACTIVE` is mentioned by one of the clients without saying what
  it means; if it turns up, decide which of the two it is.
- [ ] **Politeness.** `/api/15/cart` is fetched at most once every five minutes,
  only while a dashboard shows the widget, and a delivery that has been made at
  most once every ten minutes while the widget shows it. Confirm Picnic does
  not rate limit either.
- [ ] **A delivery that drops out of the summary long after its window.** The
  widget no longer shows it as delivered, but the "groceries delivered" flow
  trigger still fires when the app catches up, stamped with the moment it
  noticed. Decide whether a trigger months late should fire at all.
