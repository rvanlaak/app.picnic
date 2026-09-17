# Picnic app for Homey

Connect Picnic with Homey.

Add individual items or multiple items based on a recipy to your shopping cart. Or trigger flows based on the different states of your order.

## Instructions

After installing the app, login using your Picnic account via the app settings. Here you can also add your favorite recipes.

## Flow Triggers
Polling the status of your Picnic account and providing trigger flowcards based on the following events:

- Groceries have been ordered, with tokens:
  - price (in euro)
  - eta date
  - eta begin, returning the begin of the 60 minutes delivery timeframe
  - eta end, returning the end of the 60 minutes delivery timeframe
- Delivery time has been announced (Picnic published the 20min delivery timeframe, usually several hours before the delivery itself), with tokens:
  - eta date
  - eta begin, returning the begin of the 20 minutes delivery timeframe
  - eta end, returning the end of the 20 minutes delivery timeframe
- Your groceries will be delivered soon, a configurable number of minutes (30 by default) before the delivery timeframe starts, with the same tokens
- Start of the time frame when the delivery is announced, with the same tokens
- End of the time frame when the delivery is announced, with the same tokens
- Your groceries have been delivered, with tokens:
  - eta date
  - eta begin and eta end of the timeframe the delivery was expected in
  - delivery time, the moment the groceries were actually delivered. Picnic usually drops a finished delivery from its response without saying when it arrived, in which case this is the moment the app noticed

## Dashboard Widget
A "Delivery" widget for Homey Dashboards, which shows the one thing a screen on
the wall is good at telling you: when the groceries turn up.

- An order that has been placed shows the day and the slot Picnic will deliver
  in, counting down towards it
- Once Picnic announces the delivery moment, the countdown is to that window
  instead, with a bar that fills between the announcement and the delivery
- During the window it says the groceries are arriving, after it that Picnic is
  running late, and afterwards the time they were delivered
- The amount of the order is shown alongside it, which can be turned off in the
  widget's settings
- While an order can still be changed, the widget says until when. In the last
  hour before it closes that becomes a countdown in minutes
- With nothing ordered, the widget shows what is in your cart and how many
  products that is, and how much is missing when that is below the minimum
  order value
- Tapping the widget opens Picnic, which can be turned off in the widget's
  settings

Nothing on the widget is ever counted down in seconds: a dashboard is read in
passing, and the minute it arrives in is as precise as that reading gets.

The widget needs Homey firmware v12.1.0 or newer, which is what Homey
Dashboards themselves need. What could not be verified while building it, for
lack of the SDK documentation and a Picnic account, is written down in
[VERIFICATION.md](VERIFICATION.md).

## Flow Actions
- Adding a product to your basket based on the name of the product passed as an argument.
- Adding products based on a recipe as configured via the settings page.
- Adding products based on a randomly picked recipe.

## Global Tokens
The following order specific global tokens are available:

- Order status
- Order costs
- Delivery status
- Start of the delivery window
- End of the delivery window

## Changelog

Every release and what changed in it is in [CHANGELOG.md](CHANGELOG.md).

## Donate
Feel free to donate if you like the app :-)

[![Paypal donate][pp-donate-image]][pp-donate-link]

[pp-donate-link]: https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=SGUF7AJYAF83C
[pp-donate-image]: https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif
