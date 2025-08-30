export type Size = "S" | "M" | "L" | "XL" | "XXL";

export interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  active?: boolean;
  description?: string;
  skuCode?: string; 
  unitOfMeasure?: string; 
  taxCode?: string;  
defaultDiscountAmount?: number; 
  defaultDiscountRate?: number;  
  baseProductId?: string;
  size?: Size;
  stock?: number;
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