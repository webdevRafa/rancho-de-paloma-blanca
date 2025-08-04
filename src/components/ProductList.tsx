import React from "react";
import type { Product } from "../types/MerchTypes";

interface Props {
  products: Product[];
  cart: Record<string, { product: Product; quantity: number }>;
  onQuantityChange: (productId: string, quantity: number) => void;
}

const ProductList: React.FC<Props> = ({ products, cart, onQuantityChange }) => {
  return (
    <div className="mt-4">
      <h3 className="text-lg font-semibold mb-2 text-[var(--color-accent-gold)]">
        Add Merchandise
      </h3>
      <ul className="space-y-4">
        {products.map((product) => (
          <li key={product.id} className="flex items-center justify-between">
            <span>{product.name}</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={cart[product.id]?.quantity || 0}
                onChange={(e) =>
                  onQuantityChange(product.id, parseInt(e.target.value) || 0)
                }
                className="w-16 p-1 border rounded text-black"
              />
              <span>${product.price.toFixed(2)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProductList;
