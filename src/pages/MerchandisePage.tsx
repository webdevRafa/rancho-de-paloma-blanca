// pages/MerchandisePage.tsx
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
import { MdShoppingCartCheckout } from "react-icons/md";

/** Product shape from Firestore (variant-as-SKU) */
type Size = "XS" | "S" | "M" | "L" | "XL" | "XXL" | "XXXL" | "OS" | string;

type Product = ProductType & {
  baseProductId?: string;
  size?: Size;
  stock?: number;
  imageUrl?: string; // prefer this key
  image?: string; // fallback key
  skuCode?: string;
  unitOfMeasure?: string;
  active?: boolean;
  color?: string; // color attribute (e.g., "Dark"|"Light")
};

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "OS"] as const;

function groupByBaseProduct(products: Product[]) {
  const map = new Map<string, Product[]>();
  for (const p of products) {
    const key = (p.baseProductId || p.id || "").toString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  // sort by size then color then name for stable ordering
  for (const [k, arr] of map) {
    arr.sort((a, b) => {
      const ai = SIZE_ORDER.indexOf((a.size || "").toUpperCase() as any);
      const bi = SIZE_ORDER.indexOf((b.size || "").toUpperCase() as any);
      if (ai !== -1 && bi !== -1 && ai !== bi) return ai - bi;
      const ac = (a.color || "").toLowerCase();
      const bc = (b.color || "").toLowerCase();
      if (ac !== bc) return ac.localeCompare(bc);
      return (a.name || "").localeCompare(b.name || "");
    });
    map.set(k, arr);
  }
  return map;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export default function MerchandisePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const { merchItems, addOrUpdateMerchItem, isHydrated } = useCart();

  // live products
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
            imageUrl: d.imageUrl || d.image,
            baseProductId:
              d.baseProductId ||
              (doc.id as string).split("-").slice(0, 2).join("-"),
            size: d.size,
            stock: typeof d.stock === "number" ? d.stock : 0,
            skuCode: d.skuCode || doc.id,
            unitOfMeasure: d.unitOfMeasure || "Each",
            active: d.active !== false,
            description: d.description,
            color: d.color,
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

  // helpers
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
  const cartHasItems = useMemo(() => {
    try {
      if (Array.isArray(merchItems)) {
        return merchItems.some((mi: any) => (mi?.quantity || 0) > 0);
      }
      // object/dictionary shape
      return Object.values(merchItems || {}).some(
        (x: any) => (x?.quantity || 0) > 0
      );
    } catch {
      return false;
    }
  }, [merchItems]);

  const checkoutDisabled = !cartHasItems;

  // --- Selection should be user-driven (no auto-pick on load) ---
  const [selectedByBase, setSelectedByBase] = useState<
    Record<string, string | null>
  >({});
  const [qtyByBase, setQtyByBase] = useState<Record<string, number>>({});
  const [sizeByBase, setSizeByBase] = useState<Record<string, string | null>>(
    {}
  );
  const [colorByBase, setColorByBase] = useState<Record<string, string | null>>(
    {}
  );
  const [touched, setTouched] = useState(false); // flips true only after a click

  // Default qty -> 1 for each base product; DO NOT set default selections
  useEffect(() => {
    const next: Record<string, number> = { ...qtyByBase };
    groups.forEach((_variants, baseId) => {
      if (next[baseId] == null) next[baseId] = 1;
    });
    if (JSON.stringify(next) !== JSON.stringify(qtyByBase)) {
      setQtyByBase(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  const hasOneSelected = useMemo(
    () => touched && Object.values(selectedByBase).some(Boolean),
    [touched, selectedByBase]
  );

  const setQty = (baseId: string, next: number) =>
    setQtyByBase((prev) => ({
      ...prev,
      [baseId]: clamp(Math.round(next || 0), 0, 20),
    }));

  const isSoldOut = (v: Product) => typeof v.stock === "number" && v.stock <= 0;

  // find a variant matching requested attributes
  const pickVariant = (
    variants: Product[],
    wantSize?: string | null,
    wantColor?: string | null
  ) => {
    let found =
      variants.find(
        (v) =>
          (!wantSize || v.size === wantSize) &&
          (!wantColor ||
            (v.color || "").toLowerCase() ===
              (wantColor || "").toLowerCase()) &&
          !isSoldOut(v)
      ) ||
      variants.find(
        (v) => !isSoldOut(v) && (!wantSize || v.size === wantSize)
      ) ||
      variants.find((v) => !isSoldOut(v)) ||
      variants[0];
    return found || variants[0];
  };

  const handleChooseSize = (
    baseId: string,
    variants: Product[],
    size: string
  ) => {
    const chosen = pickVariant(variants, size, colorByBase[baseId]);
    setTouched(true);
    setSizeByBase((p) => ({ ...p, [baseId]: size }));
    setSelectedByBase((p) => ({ ...p, [baseId]: chosen?.id ?? null }));
    if (chosen?.color) {
      setColorByBase((p) => ({ ...p, [baseId]: chosen.color! }));
    }
  };

  const handleChooseColor = (
    baseId: string,
    variants: Product[],
    color: string
  ) => {
    const chosen = pickVariant(variants, sizeByBase[baseId], color);
    setTouched(true);
    setColorByBase((p) => ({ ...p, [baseId]: color }));
    setSelectedByBase((p) => ({ ...p, [baseId]: chosen?.id ?? null }));
    if (chosen?.size) {
      setSizeByBase((p) => ({ ...p, [baseId]: chosen.size! }));
    }
  };

  const handleAddToCart = (baseId: string, variants: Product[]) => {
    const selectedVariantId = selectedByBase[baseId];
    if (!selectedVariantId) {
      toast.error("Please choose an option first.");
      return;
    }
    const variant = variants.find((v) => v.id === selectedVariantId);
    if (!variant) {
      toast.error("This option is no longer available.");
      return;
    }

    const desiredQty = qtyByBase[baseId] ?? 1;
    const current = cartQtyFor(variant.id);

    if (desiredQty <= 0) {
      if (current > 0) {
        addOrUpdateMerchItem(variant as any, 0);
        toast.success("Removed from cart");
      } else {
        toast.error("Set quantity to at least 1.");
      }
      return;
    }

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
    <div className="max-w-[1400px] mx-auto mt-28 px-6 py-10 text-[var(--color-text)]">
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-gin text-white">
          Rancho de Paloma Blanca Merch
        </h1>
        <p className="text-white/70 mt-2 font-acumin">
          Premium tees & ranch gear. Pick your options, set quantity, and add to
          cart.
        </p>
        <p>more products coming soon!</p>
      </div>

      <div
        className={
          isSingle
            ? "grid grid-cols-1 gap-8 place-items-center"
            : "grid gap-8 md:grid-cols-2 justify-items-center place-content-center"
        }
      >
        {Array.from(groups.entries()).map(([baseId, variants]) => {
          const selectedId = selectedByBase[baseId];
          const selectedVariant = variants.find((v) => v.id === selectedId);
          const displayVariant = selectedVariant ?? variants[0];

          const baseName = (displayVariant?.name || "")
            .replace(/\s+—\s*\w+$/i, "")
            .trim();

          const price = displayVariant?.price ?? variants[0]?.price ?? 0;

          const cover =
            displayVariant?.imageUrl ||
            displayVariant?.image ||
            variants[0]?.imageUrl ||
            variants[0]?.image;

          const sizes = Array.from(
            new Set(variants.map((v) => (v.size || "").toString()))
          ).filter(Boolean);
          const colors = Array.from(
            new Set(variants.map((v) => (v.color || "").toString()))
          ).filter(Boolean);

          const qty = qtyByBase[baseId] ?? 1;

          return (
            <div
              key={baseId}
              className="group border border-white/10 bg-[var(--color-card)]/40 shadow-sm hover:shadow-md hover:border-white/20 transition-all  w-full max-w-[1000px] mx-auto rounded-2xl overflow-hidden"
            >
              <div className="flex flex-col md:flex-row">
                <div className="relative md:w-1/2 aspect-[4/3]">
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
                  {selectedId && (
                    <div className="absolute top-3 right-3 bg-emerald-600/90 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Option selected
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
                          "Soft tee and comfortable ranch gear with the Paloma crest."}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-white font-semibold text-lg">
                        ${price}
                      </span>
                    </div>
                  </div>

                  {/* Attribute selectors */}
                  <div className="px-4 pb-2 space-y-3">
                    {/* Size */}
                    {sizes.length > 1 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-white/70 text-xs">Size</p>
                          <button
                            type="button"
                            onClick={() => {
                              setTouched(true);
                              setSizeByBase((p) => ({ ...p, [baseId]: null }));
                              setSelectedByBase((p) => ({
                                ...p,
                                [baseId]: null,
                              }));
                            }}
                            className="text-[11px] text-white/60 hover:text-white/90 underline decoration-dotted"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sizes.map((sz) => {
                            const tempPick = pickVariant(
                              variants,
                              sz,
                              colorByBase[baseId]
                            );
                            const disabled = isSoldOut(tempPick);
                            const selected = sizeByBase[baseId] === sz;
                            return (
                              <button
                                key={sz}
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  handleChooseSize(baseId, variants, sz)
                                }
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
                                title={disabled ? "Sold out" : `Select ${sz}`}
                              >
                                {sz}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Color */}
                    {colors.length > 1 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-white/70 text-xs">Color</p>
                          <button
                            type="button"
                            onClick={() => {
                              setTouched(true);
                              setColorByBase((p) => ({
                                ...p,
                                [baseId]: null,
                              }));
                              setSelectedByBase((p) => ({
                                ...p,
                                [baseId]: null,
                              }));
                            }}
                            className="text-[11px] text-white/60 hover:text-white/90 underline decoration-dotted"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {colors.map((c) => {
                            const tempPick = pickVariant(
                              variants,
                              sizeByBase[baseId],
                              c
                            );
                            const disabled = isSoldOut(tempPick);
                            const selected =
                              (colorByBase[baseId] || "").toLowerCase() ===
                              c.toLowerCase();
                            return (
                              <button
                                key={c}
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  handleChooseColor(baseId, variants, c)
                                }
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
                                title={disabled ? "Sold out" : `Select ${c}`}
                              >
                                {c}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quantity + Add to cart */}
                  <div className="mt-3 flex items-center gap-3 p-4">
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
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] px-4 py-2.5 text-xs text-white font-semibold transition-colors disabled:opacity-40"
                      disabled={!selectedByBase[baseId]}
                      title={
                        !selectedByBase[baseId]
                          ? "Choose an option to continue"
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
          onClick={(e) => {
            if (checkoutDisabled) {
              e.preventDefault();
              toast.error("Add at least one item to your cart to continue.");
            }
          }}
          aria-disabled={checkoutDisabled}
          tabIndex={checkoutDisabled ? -1 : 0}
          className={[
            "inline-flex items-center gap-2 px-2 py-1.5 font-semibold text-sm transition rounded-md font-acumin",
            checkoutDisabled ? "opacity-50 cursor-not-allowed" : "",
            // keep your “selected” styling logic exactly as before
            hasOneSelected
              ? "bg-[var(--color-accent-gold)] animate-pulse hover:brightness-95 text-black"
              : "bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] text-white",
          ].join(" ")}
          title={
            checkoutDisabled ? "Your cart is empty" : "Continue to Checkout"
          }
        >
          Continue to Checkout <MdShoppingCartCheckout className="size-8" />
        </Link>
      </div>
    </div>
  );
}
