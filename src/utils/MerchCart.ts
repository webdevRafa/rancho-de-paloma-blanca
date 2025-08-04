
import type { Product, CartItem } from "../types/MerchTypes";

export function calculateMerchCart(cart: Record<string, number>, products: Product[]): {
  cartItems: CartItem[];
  merchTotal: number;
} {
  let merchTotal = 0;
  const cartItems: CartItem[] = [];

  for (const product of products) {
    const qty = cart[product.id] || 0;
    if (qty > 0) {
      const itemTotal = product.price * qty;
      merchTotal += itemTotal;
      cartItems.push({
        productId: product.id,
        name: product.name,
        quantity: qty,
        price: product.price,
      });
    }
  }

  return { cartItems, merchTotal };
}
