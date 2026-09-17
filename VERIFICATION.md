# What still has to be verified

The dashboard widget was built without two things: the Homey Apps SDK
documentation site, which is blocked from the network the work happened on, and
a Picnic account to call the API with. Everything below was therefore read off
something other than the source of truth — the `homey` CLI and `homey-lib`
packages from npm, the SDK's own type declarations, and this app's existing
code — or assumed and then written defensively so that being wrong costs a
feature rather than the app.

This is the list to work through with the documentation open and an account
logged in. Nothing here is known to be wrong; it is what is known to be
unconfirmed.

## Homey SDK

- [ ] **Widget settings schema.** `widget.compose.json` uses `type: "checkbox"`
  with `value` and an i18n `title`. `homey-lib` validates `settings` as a bare
  array without looking inside it, so a wrong shape would not fail validation:
  it would show up as a broken settings screen when placing the widget.
  → *The Basics → Widgets → Settings*
- [ ] **Style library names.** The widget uses `homey-widget` on `<body>`,
  `homey-text-bold`, `homey-text-small` and `--homey-su-*`. Every variable has
  a fallback, so a wrong name degrades rather than breaks. Muted text is done
  with `opacity: 0.6` because the name of the colour variable for secondary
  text could not be confirmed — if one exists, use it instead.
  → *The Basics → Widgets → Styling*
- [ ] **`/homey.js`.** The widget's `index.html` deliberately does not include
  the script tag that `settings/index.html` has, because the CLI's own widget
  template does not either. Confirm Homey injects it for widgets.
- [ ] **Realtime events.** The app calls `homey.api.realtime("delivery_state",
  …)` and the widget listens with `Homey.on("delivery_state", …)`. The type
  declarations say a widget receives "the app's realtime events" but not
  whether the name needs a prefix or any registration. If it does not arrive,
  the widget still updates: it asks again every 30 seconds by itself.
- [ ] **`hapticFeedback()`.** Added in firmware v12.1.2 according to the
  changelog, while the app asks for `>=12.1.0`. The call is wrapped in a
  `try`/`catch` for that reason. Either confirm the version it landed in and
  raise `compatibility` to it, or leave the guard.
- [ ] **`popup()`.** Whether opening an external URL from a widget is allowed
  as used here, and what it does on a wall-mounted dashboard as opposed to in
  the phone app.
- [ ] **Preview images.** `preview-light.png` and `preview-dark.png` are
  512×512 with a transparent background; the CLI resizes them to squares from
  128 to 512. Confirm there is no other expected size or aspect, and that the
  ring reads well against the widget picker's own background in both themes.
  → *App Store → Guidelines → 1.10 Widget Previews*
- [ ] **Height.** `height: 188` is a static pixel value, taken from the CLI
  template's default. Check whether a widget whose content varies in length is
  expected to use `Homey.ready({ height })` or `setHeight()` instead, and what
  the dashboard grid does with a height that does not fit its rows.
- [ ] **`homey app compose`.** The `widgets` block in `app.json` was written by
  hand to match what `HomeyCompose` generates (widget id injected, settings
  defaulted, appended after `flow`). Run `homey app compose` and confirm the
  diff is empty.
- [ ] **The real tools.** Only `homey-lib`'s `validate({ level: 'publish' })`
  could be run here. Run `homey app validate --level publish`, then
  `homey app run` on a Homey and look at the widget in all of its states.

## Picnic API

Nothing below could be called. The fields were inferred from what this app
already reads and from what the unofficial API is documented to return, and
every one of them is read defensively: a field that is missing, null or of the
wrong type leaves that part of the widget empty instead of throwing.

- [ ] **`slot.cut_off_time`** in `/api/15/deliveries/summary`. Taken when it is
  there, which is why it is still worth confirming, but nothing rests on it any
  more: when Picnic does not hand one over the app works the deadline out
  itself. Worth comparing the two when a real response is in front of you — if
  they disagree, Picnic is right and `lib/cutoff.js` is wrong.
- [ ] **The 13:00 / 23:00 rule.** `lib/cutoff.js` derives the deadline as 13:00
  the day before a delivery whose window starts before 13:00, and 23:00 the day
  before one that starts later. That is what a Dutch account sees today,
  reported rather than read off Picnic. Confirm it holds for the German store
  as well, and that it does not vary by hub or by kind of slot. A rule that is
  wrong here shows a deadline that is off by hours, which is worse than showing
  none: if it turns out to vary, fall back to only showing a deadline Picnic
  itself gave.
- [ ] **`/api/15/cart` totals.** `total_price` in cents and `total_count` as a
  number of products. Confirm both names and the unit.
- [ ] **Minimum order value.** Read from `minimum_order_value` on the cart, on
  `selected_slot`, or on the matching entry in `delivery_slots`, in that order,
  because it could not be established which one carries it. Confirm which, and
  whether it is in cents.
- [ ] **What the total means.** Whether `total_price` includes deposit and
  fees, and whether `checkout_total_price` is the number a customer recognises
  as "what is in my cart". The same question decides whether comparing
  `total_price` against the minimum is the comparison Picnic itself makes.
- [ ] **Politeness.** `/api/15/cart` is fetched at most once every five
  minutes, only while a dashboard is actually showing the widget and only while
  nothing is ordered. Confirm that is acceptable, and that Picnic does not rate
  limit it.
- [ ] **`https://picnic.app`.** Where tapping the widget goes. A deep link into
  the store or the cart would be better, and the right host may differ per
  country (the app already knows whether the account is `nl` or `de`).
- [ ] **What a cart alongside an open order means.** It is taken to mean those
  items still have to be added to that order, so the widget puts the amount and
  the deadline under the countdown. Confirm there is no other way for products
  to end up in the cart while an order is open — one that would have the widget
  urging someone to finish something they did not start.
