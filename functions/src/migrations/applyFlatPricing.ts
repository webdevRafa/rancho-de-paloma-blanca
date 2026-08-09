import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const EXPECTED_CONFIRMATION = "flat-2026";
const BACK_THE_BLUE_DATE = "2026-10-03";
const ARCHIVE_DOCUMENT = "2026-before-flat-pricing";

const getArgument = (name: string) => {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(
    prefix.length
  );
};

const cleanIsoDate = (value: unknown) => String(value ?? "").replace(/"/g, "");

const projectId = getArgument("project");
const shouldApply = process.argv.includes("--apply");
const confirmation = getArgument("confirm");

if (!projectId) {
  throw new Error(
    "Missing --project=<firebase-project-id>. The project must be explicit for safety."
  );
}

if (shouldApply && confirmation !== EXPECTED_CONFIRMATION) {
  throw new Error(
    `Applying requires --confirm=${EXPECTED_CONFIRMATION}. Run without --apply for a dry run.`
  );
}

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault(), projectId });
}

const db = getFirestore();
const activeRef = db.collection("seasonConfig").doc("active");
const archiveRef = db
  .collection("seasonConfigArchive")
  .doc(ARCHIVE_DOCUMENT);
const activeSnapshot = await activeRef.get();

if (!activeSnapshot.exists) {
  throw new Error("seasonConfig/active does not exist.");
}

const currentConfig = activeSnapshot.data() ?? {};
const currentWindows = Array.isArray(currentConfig.pricingWindows)
  ? (currentConfig.pricingWindows as Array<Record<string, unknown>>)
  : [];
const specialWindow = currentWindows.find(
  (window) =>
    cleanIsoDate(window.start) === BACK_THE_BLUE_DATE &&
    cleanIsoDate(window.end) === BACK_THE_BLUE_DATE
);

if (!specialWindow) {
  throw new Error(
    "The exact October 3 Back the Blue pricing window was not found. No changes were made."
  );
}

const nextConfig = {
  ...currentConfig,
  seasonStart: "2026-09-01",
  seasonEnd: "2026-10-25",
  weekdayRate: 150,
  weekendRates: {
    ...(typeof currentConfig.weekendRates === "object" &&
    currentConfig.weekendRates !== null
      ? currentConfig.weekendRates
      : {}),
    singleDay: 150,
    twoConsecutiveDays: 300,
    threeDayCombo: 450,
  },
  pricingWindows: [
    {
      start: "2026-09-01",
      end: "2026-10-02",
      type: "flat",
      rate: 150,
    },
    {
      ...specialWindow,
      start: BACK_THE_BLUE_DATE,
      end: BACK_THE_BLUE_DATE,
      type: "flat",
      rate: 50,
    },
    {
      start: "2026-10-04",
      end: "2026-10-25",
      type: "flat",
      rate: 150,
    },
  ],
};

console.log(
  JSON.stringify(
    {
      mode: shouldApply ? "apply" : "dry-run",
      projectId,
      source: activeRef.path,
      archive: archiveRef.path,
      nextPricing: {
        seasonStart: nextConfig.seasonStart,
        seasonEnd: nextConfig.seasonEnd,
        weekdayRate: nextConfig.weekdayRate,
        weekendRates: nextConfig.weekendRates,
        pricingWindows: nextConfig.pricingWindows,
      },
    },
    null,
    2
  )
);

if (!shouldApply) {
  console.log(
    `Dry run only. Re-run with --apply --confirm=${EXPECTED_CONFIRMATION} after reviewing the output.`
  );
  process.exit(0);
}

const archiveSnapshot = await archiveRef.get();
if (archiveSnapshot.exists) {
  throw new Error(
    `${archiveRef.path} already exists. Refusing to overwrite the rollback copy.`
  );
}

const batch = db.batch();
batch.create(archiveRef, {
  archivedAt: FieldValue.serverTimestamp(),
  sourcePath: activeRef.path,
  config: currentConfig,
});
batch.set(activeRef, nextConfig);
await batch.commit();

console.log(
  `Updated ${activeRef.path} and created rollback copy ${archiveRef.path}.`
);
