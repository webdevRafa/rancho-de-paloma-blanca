
export interface Product {
  id: string;
  name: string;
  price: number;
  image?: string;
  description?: string;

  // NEW (optional) fields to support Deluxe level3
  skuCode?: string;         // maps 1:1 to DppLevel3Item.skuCode
  unitOfMeasure?: string;   // e.g., "Each", "Dozen"
  taxCode?: string;         // if you decide to send tax coding later
  // If you run discounts, you may add:
  defaultDiscountAmount?: number; // absolute
  defaultDiscountRate?: number;   // fraction (e.g., 0.1 for 10%)
}

export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export type MerchCartItem = {
  product: Product;
  quantity: number;
};