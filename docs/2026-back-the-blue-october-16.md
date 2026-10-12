# Back the Blue: October 16, 2026

The event has moved from October 10 to Friday, October 16, 2026. The rate
remains $50 per hunter for qualifying first responders and their guests.
Standard dates remain $150 per hunter, per day.

## Firestore update after the October 16 website release

In Firestore open `seasonConfig` → `active` → `pricingWindows`. Save a copy of
the current document before editing. Update the existing array entries and
preserve their order; do not create dotted fields such as
`pricingWindows.1.start`.

| Entry | Field | Current | New |
| --- | --- | --- | --- |
| 0: standard dates before event | `end` | `2026-10-09` | `2026-10-15` |
| 1: Back the Blue | `start` | `2026-10-10` | `2026-10-16` |
| 1: Back the Blue | `end` | `2026-10-10` | `2026-10-16` |
| 1: Back the Blue | `disclaimerBody` | October 10 wording | Replace the date with October 16, 2026 |
| 2: standard dates after event | `start` | `2026-10-11` | `2026-10-17` |

Final date ranges:

| Start | End | Type | Rate |
| --- | --- | --- | ---: |
| `2026-09-01` | `2026-10-15` | `flat` | 150 |
| `2026-10-16` | `2026-10-16` | `flat` | 50 |
| `2026-10-17` | `2026-10-25` | `flat` | 150 |

All dates are strings; rates are numbers. On entry 1 retain `label: "Back the
Blue"`, `disclaimerTitle: "Back the Blue Event Notice"`, the exact existing
`disclaimerKey`, `requiresDisclaimer: true`, and `type: "flat"`. Keep
`seasonStart`, `seasonEnd`, rates outside the windows, `maxHuntersPerDay`, and
`partyDeckRatePerDay` unchanged.

Use this disclaimer body for entry 1:

> By selecting October 16, 2026, you confirm that you are a qualifying first
> responder booking for yourself and your guests. The rate is $50 per hunter,
> per day. Please bring proof of eligibility to check-in. Bookings without a
> qualifying first responder or the required proof will be turned away without
> a refund.

## Existing reservations and capacity

Pricing-window edits do not change saved order dates or availability counters.
Before editing capacity, inspect the October 10 and October 16 availability
documents and identify which existing orders are being moved. Reconcile those
orders and counters together. Do not assume changing `huntersBooked` alone
updates an order's date or its cancellation/refund capacity behavior. Preserve
the separate Party Deck value unless the ranch has confirmed a move for it.

After saving the Firestore update, refresh `/book` and confirm October 16 is
the $50 event date, with October 15 and 17 at the standard $150 rate. The
website release pauses affected new carts while the live pricing windows still
conflict with the October 16 schedule.

The shared date is also used by customer reminders, paid customer emails, and
paid administrative emails. Deploy `functions:api` and
`functions:emailPendingOrderReminders` after this code release so those email
templates use the new event date.
