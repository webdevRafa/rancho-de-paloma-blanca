// MerchandisePage.tsx
import { useEffect, useState } from "react";
import { useCart } from "../context/CartContext";
import ProductList from "../components/ProductList";
import type { Product } from "../types/MerchTypes";
import { Link } from "react-router-dom";

const MerchandisePage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const { merchItems, addOrUpdateMerchItem } = useCart();

  useEffect(() => {
    // Fetch from Firebase later
    setProducts([
      { id: "shirt1", name: "Ranch Tee - Tan", price: 25 },
      { id: "cap1", name: "Hunter Cap - Camo", price: 20 },
    ]);
  }, []);

  const handleQuantityChange = (product: Product, quantity: number) => {
    addOrUpdateMerchItem(product, quantity);
  };

  return (
    <div className="max-w-2xl mx-auto mt-60 text-[var(--color-text)] bg-white px-6 py-10">
      <h1 className="text-2xl font-acumin text-[var(--color-footer)] mb-6 text-center">
        Shop Official Merch
      </h1>
      <ProductList
        products={products}
        cart={merchItems}
        onQuantityChange={(id, qty) => {
          const product = products.find((p) => p.id === id);
          if (product) handleQuantityChange(product, qty);
        }}
      />
      <div className="mt-8 text-center">
        <Link
          to="/checkout"
          className="bg-[var(--color-button)] hover:bg-[var(--color-button-hover)] px-6 py-3 rounded-md text-white font-semibold"
        >
          Continue to Checkout
        </Link>
      </div>
    </div>
  );
};

export default MerchandisePage;
