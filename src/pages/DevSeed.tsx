import { useState } from "react";
import { seedAvailability } from "../utils/seed/seedAvailability";
import { useAuth } from "../context/AuthContext";
import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

type ProductSeed = {
  id: string;
  baseProductId?: string;
  name: string;
  price?: number;
  size?: "S" | "M" | "L" | "XL" | "XXL" | string;
  stock?: number;
  imageUrl?: string;
  active?: boolean;
  skuCode?: string;
};

const DevSeed = () => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{
    ok: number;
    skipped: number;
  } | null>(null);
  const { user } = useAuth();

  const handleSeedAvailability = async () => {
    setLoading(true);
    try {
      await seedAvailability();
      setDone(true);
    } catch (err) {
      console.error("Error seeding availability:", err);
      alert("Failed to seed availability");
    } finally {
      setLoading(false);
    }
  };

  async function parseJsonFile<T = unknown>(f: File): Promise<T> {
    const text = await f.text();
    return JSON.parse(text) as T;
  }

  const handleImportProducts = async () => {
    if (!file) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      // Accept either an array of items or an object keyed by id
      const parsed = await parseJsonFile<any>(file);
      const items: ProductSeed[] = Array.isArray(parsed)
        ? parsed
        : Object.values(parsed);

      if (!items.length) {
        alert("JSON has no items.");
        return;
      }

      const batch = writeBatch(db);
      let ok = 0;
      let skipped = 0;

      for (const raw of items) {
        // Basic validation
        const id = String(raw.id || "").trim();
        const name = String(raw.name || "").trim();
        const stock = typeof raw.stock === "number" ? raw.stock : undefined;

        if (!id || !name || stock == null) {
          console.warn("Skipping invalid item:", raw);
          skipped++;
          continue;
        }

        const docRef = doc(collection(db, "products"), id);
        batch.set(
          docRef,
          {
            id,
            baseProductId:
              raw.baseProductId ?? id.split("-").slice(0, 2).join("-"), // e.g., TEE-PALOMA
            name,
            price: 20, // enforce $20 each per your spec
            size: raw.size ?? id.split("-").slice(-1)[0], // last token as size if missing
            stock,
            imageUrl:
              raw.imageUrl ?? "REPLACE_WITH_YOUR_FIREBASE_STORAGE_DOWNLOAD_URL",
            active: raw.active ?? true,
            skuCode: raw.skuCode ?? id,
            unitOfMeasure: "Each",
          },
          { merge: true }
        );

        ok++;
      }

      await batch.commit();
      setImportResult({ ok, skipped });
      alert(
        `✅ Imported ${ok} products. ${skipped ? `Skipped ${skipped}.` : ""}`
      );
    } catch (e) {
      console.error(e);
      alert("❌ Failed to import products. Check console for details.");
    } finally {
      setImportBusy(false);
    }
  };

  // Simple gate using your existing approach
  if (user?.email !== "support@satxink.com") {
    return (
      <div className="text-center mt-20 text-red-500 font-semibold">
        Not authorized
      </div>
    );
  }

  return (
    <div className="p-10 text-white mt-30 mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl mb-4 text-white">Dev Seeder</h1>
        <button
          onClick={handleSeedAvailability}
          disabled={loading}
          className="bg-[var(--color-button)] px-3 py-2 rounded text-white hover:bg-[var(--color-button-hover)] disabled:opacity-50 text-sm"
        >
          {loading ? "Seeding..." : "Seed Availability Data"}
        </button>
        {done && (
          <p className="mt-3 text-green-400">
            ✅ Availability seeding complete!
          </p>
        )}
      </div>

      <div className="border border-white/10 rounded-2xl p-5">
        <h2 className="text-xl font-semibold mb-2">Import Products (.json)</h2>
        <p className="text-sm text-white/70 mb-3">
          Upload the <code>products_seed.json</code> I provided (or a compatible
          JSON). Each item will be written to <code>products/&lt;id&gt;</code>{" "}
          with price forced to <strong>$20</strong>.
        </p>
        <input
          type="file"
          accept="application/json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block mb-3 text-black"
        />
        <div className="flex items-center gap-3">
          <button
            disabled={!file || importBusy}
            onClick={handleImportProducts}
            className="bg-[var(--color-button)] px-3 py-2 rounded text-white hover:bg-[var(--color-button-hover)] disabled:opacity-50 text-sm"
          >
            {importBusy ? "Importing…" : "Import products_seed.json"}
          </button>
          {file && <span className="text-xs text-white/70">{file.name}</span>}
        </div>
        {importResult && (
          <p className="mt-3 text-green-400 text-sm">
            ✅ Imported {importResult.ok}{" "}
            {importResult.ok === 1 ? "item" : "items"}
            {importResult.skipped ? ` — Skipped ${importResult.skipped}` : ""}
          </p>
        )}
        <p className="mt-3 text-xs text-white/60">
          Tip: Ensure your Firestore security rules allow admin writes to{" "}
          <code>products</code>, or use a callable Cloud Function for seeding.
        </p>
      </div>
    </div>
  );
};

export default DevSeed;
