export interface Business {
  _id: string;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Branch {
  _id: string;
  businessId: string;
  name: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface Category {
  _id: string;
  businessId: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ModifierOption {
  name: string;
  price: number;
}

export interface Modifier {
  _id: string;
  businessId: string;
  name: string;
  options: ModifierOption[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'out-of-service';

export interface Table {
  _id: string;
  branchId: string;
  number: number;
  capacity: number;
  status: TableStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Transaction {
  _id: string;
  businessId: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  status: TransactionStatus;
  reference?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface Product {
  _id: string;
  businessId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  sku: string;
  stock: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface AppliedModifier {
  modifierId: string;
  name: string;
  optionName: string;
  price: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  modifiers: AppliedModifier[];
}

export interface Order {
  _id: string;
  businessId: string;
  branchId: string;
  orderNumber: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customerId?: string;
  tableId?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type OrderStatus = 'pending' | 'completed' | 'cancelled' | 'refunded';

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export interface User {
  _id: string;
  businessId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type UserRole = 'admin' | 'cashier' | 'manager';

export interface ApiErrorDetail {
  field: string;
  message: string;
  received?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: ApiErrorDetail[];
}

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
