export interface Product {
  _id?: string;
  name: string;
  description: string;
  price: number;
  category: string;
  sku: string;
  stock: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  _id?: string;
  orderNumber: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderStatus = 'pending' | 'completed' | 'cancelled' | 'refunded';

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export interface User {
  _id?: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'admin' | 'cashier' | 'manager';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
