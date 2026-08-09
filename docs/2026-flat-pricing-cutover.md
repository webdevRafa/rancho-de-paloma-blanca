# 2026 flat-pricing Firestore cutover

The application code supports both the current package windows and the new flat
pricing configuration. Deploy the compatible code before changing
`seasonConfig/active`.

## Target rules

- Standard dates: `$150` per hunter, per hunt day.
- Back the Blue on October 3, 2026: `$50` per hunter.
- Season: September 1 through October 25, 2026.
- Party Deck rate, capacity, and special-event disclaimer metadata are preserved.

The migration creates these non-overlapping pricing windows:

1. September 1–October 2: flat `$150`.
2. October 3: flat `$50`, with the existing Back the Blue metadata preserved.
3. October 4–October 25: flat `$150`.

Non-overlapping windows are required because the client uses the first matching
window.

## Prerequisites

Run the migration only after:

1. The `codex/builder` code has passed tests, lint, and builds.
2. The compatible application code has been deployed.
3. Pending orders/payment sessions have been reviewed.
4. Application Default Credentials are configured for an account allowed to
   read and write the target Firestore project.
5. The application admin role can read
   `seasonConfigArchive/2026-before-flat-pricing`; admin revenue views use that
   document for legacy orders that do not contain their own configuration
   snapshot.

## Dry run

From `functions/`, install dependencies and inspect the proposed change:

```bash
npm install
npm run pricing:migrate -- --project=YOUR_FIREBASE_PROJECT_ID
```

The dry run reads `seasonConfig/active`, verifies the exact October 3 event
window exists, and prints the pricing-relevant output. It does not write.

## Apply

After reviewing the dry-run output:

```bash
npm run pricing:migrate -- --project=YOUR_FIREBASE_PROJECT_ID --apply --confirm=flat-2026
```

The write is atomic. It:

- creates `seasonConfigArchive/2026-before-flat-pricing` as a rollback copy;
- updates `seasonConfig/active` with the three flat windows;
- cleans the season and pricing-window dates to ordinary ISO strings; and
- preserves the current October 3 label and disclaimer fields.

The script refuses to overwrite an existing archive document.

## Immediate smoke test

Before accepting real payments, verify the checkout review totals for one
hunter:

- September 1 → `$150`.
- October 3 → `$50` and the first-responder acknowledgement is required.
- October 4 → `$150`.
- October 2–4 → `$350`.

Also verify one historical paid order in the admin dashboard. Revenue reporting
prefers the configuration snapshot stored with that order, so a past sale should
not be repriced by the new active document.
