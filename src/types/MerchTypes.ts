
export interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  isActive?: boolean;
  tags?: string[];
}

export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}
