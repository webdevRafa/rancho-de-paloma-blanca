# Back the Blue: October 10, 2026

The hunt was postponed from October 3 to Saturday, October 10 because of
weather. The rate stays $50 per hunter, per day for first responders and their
guests. Standard hunts remain $150 per hunter, per day.

## Backup

Before these changes, main at `6b73ace` was merged into `codex/builder` and
pushed as `519e97f`. That branch retains its earlier payment-success preview
as well as all of the pre-change main history. No force push was used.
Git protects the code only: keep a separate copy of Firestore's current fields
before editing the database. Reverting the code does not revert Firestore.

## Audit and changes

| Surface | Change |
| --- | --- |
| Homepage event card | October 10 date and a short weather-postponement notice; $50 stays the same. |
| /book, signed out and signed in | Shared hero date, event fact, and guest eligibility copy. |
| Season/package cards | October 10 event badge and guest eligibility; prices still come from seasonConfig/active. |
| DateSelector | Event highlighting and selected-date badges follow the shared October 10 constant. |
| BookingForm | Event selection and acknowledgement move to October 10; review and modal copy follow the shared date. |
| Event flyer in booking | Replaced the printed October 3/Brownsville flyer with a text-based October 10/Rio Hondo card. Original image files are retained but no longer imported. |
| EditBookingDatesModal | October 10 triggers the same acknowledgement before saving selected dates. |
| CheckoutPage | October 10 acknowledgement text; a date/pricing consistency check before creating a new order. |
| ClientDashboard success notice | Detects October 10 and displays the updated eligibility notice. Saved order dates and totals are still used. |
| BackTheBluePage | Updated dormant page component and replaced its old flyer; its CTA goes to /book. It is not currently registered in App.tsx, and no new route was added. |
| Customer reminder, customer paid, and admin paid emails | Shared October 10 event date and guest eligibility in HTML and plain text. Order details and attendee names stay dynamic. |
| Price calculation/cart | Rates continue to come from the active Firestore windows; no new hardcoded pricing calculation. |
| Historical flat-price migration | Preserved as history and marked as unsuitable for this postponement. Do not rerun it. |

The cutover check pauses affected **new carts** if the active configuration
still has the old $50 day, the wrong October 10 price, overlapping windows, or
missing October 10 acknowledgement metadata. The customer gets a message to
refresh or contact the ranch. Once Firestore is corrected, reload the site.
This check does not rewrite old orders or resume-payment amounts.

## Manual Firestore update

Open **seasonConfig → active → pricingWindows**. Keep the three entries in
the existing order. Save a copy of the original document first. Update the
whole array together if the console allows it, preserving all other fields.
Do not create literal fields named `pricingWindows.0.end`; edit inside the
existing array entries.

| Entry | Field | Current | New |
| --- | --- | --- | --- |
| 0: standard dates before event | end | 2026-10-02 | **2026-10-09** |
| 1: Back the Blue | start | 2026-10-03 | **2026-10-10** |
| 1: Back the Blue | end | 2026-10-03 | **2026-10-10** |
| 2: standard dates after event | start | 2026-10-04 | **2026-10-11** |

Use these final ranges:

| start (string) | end (string) | type (string) | rate (number) |
| --- | --- | --- | --- |
| 2026-09-01 | 2026-10-09 | flat | 150 |
| 2026-10-10 | 2026-10-10 | flat | 50 |
| 2026-10-11 | 2026-10-25 | flat | 150 |

In entry 1, replace **disclaimerBody** with:

> By selecting October 10, 2026, you confirm that you are a qualifying first responder booking for yourself and your guests. The rate is $50 per hunter, per day. Please bring proof of eligibility to check-in. Bookings without a qualifying first responder or the required proof will be turned away without a refund.

Keep these event fields unchanged:

- `label`: `Back the Blue`
- `disclaimerTitle`: `Back the Blue Event Notice`
- `disclaimerKey`: `backTheBlueJFirstResponder` (keep the existing exact value)
- `requiresDisclaimer`: boolean `true`
- `type`: `flat`
- `rate`: number `50`

Keep seasonStart, seasonEnd, weekdayRate, weekendRates, maxHuntersPerDay (100),
and partyDeckRatePerDay (500) unchanged.

**Why all three windows matter:** the pricing helper chooses the first matching
window. Moving only entry 1 leaves an overlap with entry 2 on October 10 and an
uncovered October 3. Adjusting both neighboring boundaries prevents ambiguity.
October 3 becomes a standard $150 date for new bookings if it remains available.
This update does not close October 3 because of weather.

## Existing 25 hunters and availability

A read-only check on October 2, 2026 found:

| Document | huntersBooked | partyDeckBooked |
| --- | --- | --- |
| availability/2026-10-03 | 25 | true |
| availability/2026-10-10 | 0 | false |

These values can change after this audit. No database documents were changed.

Changing pricingWindows does **not** move these 25 hunters or reserve their
places on October 10. With the current counters, October 10 can show 100
remaining places. If all 25 are transferring and there are no other bookings,
the correct remaining capacity would be 75.

Before relying on the October 10 capacity display, reconcile the transferring
paid orders and the availability counters together as a separate, reviewed
operation. Existing order dates, any Party Deck date, and corresponding
availability must agree. Do not just zero October 3 or add 25 to October 10
without tracking which reservations moved: cancellations/refunds use the saved
order dates to release capacity and could otherwise adjust the wrong day.
The October 3 Party Deck reservation also needs a specific decision.

Pending orders retain their original dates and saved totals; their continue
payment flow does not automatically reprice or reschedule them. They need
separate review if they should now refer to October 10. No existing bookings
were edited, and no postponement emails were sent.

## Release steps

1. Keep a copy of the original Firestore configuration.
2. Deploy the updated main frontend, then promptly make the array edits above.
   New affected carts will pause until the configuration is consistent.
3. Reconcile the existing reservations/capacity before treating the October 10
   remaining-spots count as including the transferred group.
4. Deploy the email changes. From the repository root in PowerShell:

   ```powershell
   $env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"
   firebase deploy --only "functions:api,functions:emailPendingOrderReminders" --project rancho-de-paloma-blanca
   ```

   The api function contains the paid email senders. Its transaction/payment
   code is unchanged; only the imported email templates and shared event copy
   have changed. The reminder schedule and send rules are unchanged.
   emailOnOrderCreated does not need redeployment for this change.

5. Hard-refresh the website. Check the homepage, /book, and an unpaid new cart:
   October 10 should highlight as the special event, require the acknowledgement,
   and total $50 for one hunter or $100 for two. October 3, October 9, and
   October 11 should price at $150 per hunter. Check the edit-dates modal too.
6. Verify the event notice names first responders **and their guests**, the
   Party Deck remains disabled, and the old flyer no longer appears.

Do not use the older `pricing:migrate` script for this change. No payment,
refund, webhook, or capacity-mutation code was changed.

## Verification

- 23 tests passed: all season-day prices and non-overlapping windows, old and
  partially edited config checks, both booking-page authentication states,
  event-card content, six customer/admin email cases, and existing capacity tests.
- Production frontend build and Firebase Functions TypeScript build passed.
- Targeted lint passed for the new shared event module, event card, pricing
  helper, and tests. Existing large page files were not subjected to a cleanup.
- Local browser checks confirmed October 10 on the homepage and signed-out
  booking page, including the package badge and weather notice.
- No real payment, production order creation, email send, Firebase deployment,
  or Firestore write was performed during verification.
