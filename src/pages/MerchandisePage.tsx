import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useCart } from "../context/CartContext";
import type { Product as ProductType } from "../types/MerchTypes";
import { toast } from "react-toastify";
import { Minus, Plus, Check } from "lucide-react";

/**
 * Product document shape we expect in Firestore.
 * Each size variant is its own document (variant-as-SKU).
 * Example ID: "TEE-PALOMA-XL"
 */
type Size = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "XXXL" | string;

type Product = ProductType & {
  baseProductId?: string;
  size?: Size;
  stock?: number;
  imageUrl?: string; // prefer this key, but we also map 'image' below
  image?: string;
  skuCode?: string;
  unitOfMeasure?: string;
  active?: boolean;
};

/** Friendly size order used in the UI */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;

/**
 * Group variants by baseProductId so the UI can render a single card per product
 * with a size selector. Falls back to product.id when baseProductId is missing.
 */
function groupByBaseProduct(products: Product[]) {
  const map = new Map<string, Product[]>();
  for (const p of products) {
    const key = (p.baseProductId || p.id || "").toString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  for (const [k, arr] of map) {
    arr.sort((a, b) => {
      const ai = SIZE_ORDER.indexOf((a.size || "").toUpperCase() as any);
      const bi = SIZE_ORDER.indexOf((b.size || "").toUpperCase() as any);
      if (ai !== -1 && bi !== -1) return ai - bi;
      return (a.name || "").localeCompare(b.name || "");
    });
    map.set(k, arr);
  }
  return map;
}

/** Utility to clamp a number between min and max */
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * New, polished Merchandise Page
 * - Clean product cards that match Party Deck / Rules styling
 * - Size pill selector (no inventory counts) with deselect support
 * - Quantity stepper that allows 0 (0 = remove)
 * - "Add to cart" CTA with toast feedback
 * - Real-time product updates via Firestore
 */
export default function MerchandisePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const { merchItems, addOrUpdateMerchItem, isHydrated } = useCart();

  /** Realtime subscription to products */
  useEffect(() => {
    const q = query(
      collection(db, "products"),
      where("active", "==", true),
      orderBy("name", "asc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Product[] = [];
        snap.forEach((doc) => {
          const d = doc.data() as any;
          rows.push({
            id: d.id || doc.id,
            name: d.name,
            price: typeof d.price === "number" ? d.price : Number(d.price) || 0,
            imageUrl: d.imageUrl || d.image, // support both keys
            baseProductId:
              d.baseProductId ||
              (doc.id as string).split("-").slice(0, 2).join("-"),
            size: d.size,
            stock: typeof d.stock === "number" ? d.stock : 0,
            skuCode: d.skuCode || doc.id,
            unitOfMeasure: d.unitOfMeasure || "Each",
            active: d.active !== false,
            description: d.description,
          });
        });
        setProducts(rows);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(err.message || "Failed to load products");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  /** cart quantity helper (supports object or array merchItems shapes) */
  const cartQtyFor = (productId: string) => {
    try {
      const rec = (merchItems as any)?.[productId];
      if (rec && typeof rec.quantity === "number") return rec.quantity;
      if (Array.isArray(merchItems)) {
        const found = (merchItems as any[]).find(
          (x: any) => x?.product?.id === productId
        );
        if (found) return found.quantity || 0;
      }
      return 0;
    } catch {
      return 0;
    }
  };

  const groups = useMemo(() => groupByBaseProduct(products), [products]);
  const isSingle = useMemo(() => groups.size === 1, [groups]);

  // Local UI state: selection (variantId) & quantity per base product
  const [selectedByBase, setSelectedByBase] = useState<
    Record<string, string | null>
  >({});
  const [qtyByBase, setQtyByBase] = useState<Record<string, number>>({});

  // When any base product has a size selected and qty === 1, flip the CTA color
  const hasOneSelected = useMemo(() => {
    let flag = false as unknown as boolean;
    try {
      groups.forEach((_vars, baseId) => {
        const sel = (selectedByBase as any)[baseId];
        const q = (qtyByBase as any)[baseId] ?? 1;
        if (sel && q === 1) flag = true as unknown as boolean;
      });
    } catch {}
    return !!flag;
  }, [groups, selectedByBase, qtyByBase]);

  const toggleSelected = (baseId: string, variantId: string) => {
    setSelectedByBase((prev) => ({
      ...prev,
      [baseId]: prev[baseId] === variantId ? null : variantId,
    }));
  };
  const setQty = (baseId: string, next: number) => {
    setQtyByBase((prev) => ({
      ...prev,
      [baseId]: clamp(Math.round(next || 0), 0, 20),
    }));
  };

  const handleAddToCart = (baseId: string, variants: Product[]) => {
    const selectedVariantId = selectedByBase[baseId];
    if (!selectedVariantId) {
      toast.error("Please select a size first.");
      return;
    }
    const variant = variants.find((v) => v.id === selectedVariantId);
    if (!variant) {
      toast.error("This option is no longer available.");
      return;
    }

    const desiredQty = qtyByBase[baseId] ?? 1;
    const current = cartQtyFor(variant.id);

    // If quantity is 0, treat as removal if in cart
    if (desiredQty <= 0) {
      if (current > 0) {
        addOrUpdateMerchItem(variant as any, 0);
        toast.success("Removed from cart");
      } else {
        toast.error("Set quantity to at least 1.");
      }
      return;
    }

    // Cap by stock if stock is tracked (UI does not show counts)
    const stockCap =
      typeof variant.stock === "number" ? variant.stock : current + desiredQty;
    const nextQty = clamp(
      current + desiredQty,
      0,
      stockCap ?? current + desiredQty
    );

    addOrUpdateMerchItem(variant as any, nextQty);
    toast.success(`${variant.name || "Item"} added to cart`);
  };

  if (!isHydrated) {
    return (
      <div className="max-w-4xl mx-auto mt-32 px-6">
        <p className="text-white/80">Loading cart…</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto mt-32 px-6">
        <h1 className="text-3xl font-acumin text-white text-center mb-6">
          Rancho de Paloma Blanca Merch
        </h1>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-[var(--color-card)] p-5 animate-pulse"
            >
              <div className="h-40 rounded-xl bg-white/5 mb-4" />
              <div className="h-5 w-2/3 bg-white/10 rounded mb-2" />
              <div className="h-4 w-1/3 bg-white/10 rounded mb-6" />
              <div className="h-9 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-4xl mx-auto mt-32 px-6 text-red-400">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-28 px-6 py-10 text-[var(--color-text)]">
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-gin text-white">
          Rancho de Paloma Blanca Merch
        </h1>
        <p className="text-white/70 mt-2 font-acumin">
          Premium tees & ranch gear. Pick your size, set quantity, and add to
          cart.
        </p>
        <p>more products coming soon!</p>
      </div>

      {/* Cards per base product */}
      <div
        className={
          isSingle
            ? "grid grid-cols-1 gap-6 place-items-center"
            : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {Array.from(groups.entries()).map(([baseId, variants]) => {
          const cover = variants[0]?.imageUrl || variants[0]?.image;
          const baseName = (variants[0]?.name || "").replace(
            /\s+—\s*\w+$/i,
            ""
          );
          const price = variants[0]?.price ?? 0;

          // If user hasn't interacted yet, default quantity to 1
          const qty = qtyByBase[baseId] ?? 1;
          const selectedVariantId = selectedByBase[baseId] ?? null;

          // Determine which sizes are out of stock (we won't show counts)
          const isSoldOut = (v: Product) =>
            typeof v.stock === "number" && v.stock <= 0;

          return (
            <div
              key={baseId}
              className="group border border-white/10 bg-[var(--color-card)]/40 shadow-sm hover:shadow-md hover:border-white/20 transition-all w-full max-w-[800px] mx-auto rounded-2xl overflow-hidden"
            >
              <div className="flex flex-col md:flex-row">
                <div className="relative md:w-1/2">
                  {cover ? (
                    <img
                      src={cover}
                      alt={baseName || baseId}
                      className="w-full h-full object-cover bg-black/10"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-44 bg-black/10" />
                  )}
                  {selectedVariantId && (
                    <div className="absolute top-3 right-3 bg-emerald-600/90 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Size selected
                    </div>
                  )}
                </div>

                <div className="md:w-1/2">
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <h2 className="text-lg text-white font-gin font-semibold leading-tight">
                        {baseName || baseId}
                      </h2>
                      <p className="text-white/70 text-sm mt-0.5">
                        {variants[0]?.description ||
                          "Soft cotton tee with the Paloma crest."}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-white font-semibold text-lg">
                        ${price}
                      </span>
                    </div>
                  </div>

                  {/* Size selector */}
                  <div className="mt-2 px-4 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white/70 text-xs">Size</p>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedByBase((p) => ({ ...p, [baseId]: null }))
                        }
                        className="text-[11px] text-white/60 hover:text-white/90 underline decoration-dotted disabled:opacity-30"
                        disabled={!selectedVariantId}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {variants.map((v) => {
                        const selected = selectedVariantId === v.id;
                        const disabled = isSoldOut(v);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleSelected(baseId, v.id)}
                            className={[
                              "px-3 py-1.5 rounded-xl border text-sm transition-all",
                              selected
                                ? "bg-white text-black border-white shadow"
                                : "bg-black/20 text-white/90 border-white/10 hover:border-white/30",
                              disabled
                                ? "opacity-40 cursor-not-allowed"
                                : "cursor-pointer",
                            ].join(" ")}
                            aria-pressed={selected}
                            aria-label={`Select size ${v.size || "—"}`}
                            title={
                              disabled ? "Sold out" : `Select ${v.size || "—"}`
                            }
                          >
                            {v.size || "—"}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quantity + Add to cart */}
                  <div className="mt-4 flex items-center gap-3 p-4">
                    <div className="flex items-center rounded-xl border border-white/10 overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setQty(baseId, (qtyByBase[baseId] ?? 1) - 1)
                        }
                        className="p-2 hover:bg-white/10 text-white"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={qty}
                        onChange={(e) => setQty(baseId, Number(e.target.value))}
                        className="w-12 text-center bg-transparent text-white py-1.5 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setQty(baseId, (qtyByBase[baseId] ?? 1) + 1)
                        }
                        className="p-2 hover:bg-white/10 text-white"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddToCart(baseId, variants)}
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] px-4 py-2.5 text-xs  text-white font-semibold transition-colors disabled:opacity-40"
                      disabled={!selectedVariantId}
                      title={
                        !selectedVariantId
                          ? "Select a size to continue"
                          : "Add to cart"
                      }
                    >
                      <Plus className="h-4 w-4" />{" "}
                      {(qty ?? 1) <= 0 ? "Update cart" : "Add to cart"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 text-center">
        <Link
          to="/checkout"
          className={[
            "inline-flex items-center gap-2 px-6 py-3  font-semibold rounded-xl",
            hasOneSelected
              ? "bg-[var(--color-accent-gold)] animate-pulse hover:brightness-95 text-black"
              : "bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white",
          ].join(" ")}
        >
          Continue to Checkout
        </Link>
      </div>
    </div>
  );
}
