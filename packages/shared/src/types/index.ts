export interface Business {
  _id: string;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  email?: string;
  // ISO 4217 currency code used for money formatting across POS / admin
  // surfaces. Falls back to `DEFAULT_CURRENCY` ('COP') when missing so existing
  // documents stay valid without a migration.
  currency?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Subset of `Business` returned alongside auth responses so the frontend can
// format money and render the tenant name without a follow-up round-trip.
export interface AuthBusiness {
  _id: string;
  name: string;
  slug: string;
  currency: string;
}

export interface Branch {
  _id: string;
  businessId: string;
  name: string;
  address?: string;
  phone?: string;
  timezone: string;
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

export interface KitchenStation {
  _id: string;
  businessId: string;
  branchId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type Allergen =
  | 'gluten'
  | 'dairy'
  | 'egg'
  | 'peanut'
  | 'tree-nut'
  | 'soy'
  | 'fish'
  | 'shellfish'
  | 'sesame';

export type DietaryTag = 'vegetarian' | 'vegan' | 'gluten-free' | 'keto' | 'halal' | 'kosher';

export type StockUnit = 'unit' | 'kg' | 'L';

export type ServiceSchedule = 'breakfast' | 'lunch' | 'dinner';

export interface ProductAvailability {
  pos: boolean;
  online: boolean;
  kiosk: boolean;
}

export interface ModifierOptionAvailability {
  daysOfWeek?: number[];
  from?: string;
  to?: string;
}

export interface ModifierOption {
  id: string;
  label: string;
  priceDelta: number;
  available?: ModifierOptionAvailability;
}

export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  maxSelectable: number;
  options: ModifierOption[];
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  priceDelta: number;
  imageUrl?: string;
}

export interface AvailabilityWindow {
  daysOfWeek: number[];
  from: string;
  to: string;
}

export interface Product {
  _id: string;
  businessId: string;
  branchId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  sku: string;
  stock: number;
  imageUrl?: string;
  cost?: number;
  taxRate?: number;
  trackStock: boolean;
  lowStockThreshold?: number;
  stockUnit: StockUnit;
  availability: ProductAvailability;
  serviceSchedules: ServiceSchedule[];
  allergens: Allergen[];
  dietaryTags: DietaryTag[];
  modifierGroups: ModifierGroup[];
  kitchenStationIds: string[];
  variants?: ProductVariant[];
  availabilityWindow?: AvailabilityWindow;
  sortOrder: number;
  barcode?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ProductPreference {
  _id: string;
  businessId: string;
  branchId: string;
  productId: string;
  featured: boolean;
  sortOrderOverride?: number;
  updatedAt: Date;
  updatedBy: string;
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
  branchIds?: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'supervisor'
  | 'cashier'
  | 'waiter'
  | 'kitchen';

// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

export interface TokenPayload {
  userId: string;
  businessId: string;
  role: UserRole;
  branchIds?: string[];
}

export interface RefreshToken {
  _id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  // Set when the session was opened with "mantener sesión (30 días)". Persisted
  // on the token itself so rotation can re-issue with the same extended TTL —
  // otherwise every refresh silently downgrades the session back to 7 days.
  rememberMe?: boolean;
}

export interface LoginAttempt {
  _id: string;
  email: string;
  attempts: number;
  lockedUntil: Date | null;
  lastAttemptAt: Date;
}

export interface PasswordResetToken {
  _id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  usedAt: Date | null;
}

// Auth API request/response shapes

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'passwordHash'>;
  // Returned alongside the user so the frontend doesn't need a follow-up
  // /api/auth/me round-trip after login. `null` for super_admin.
  business: AuthBusiness | null;
}

export interface MeResponse {
  user: Omit<User, 'passwordHash'>;
  business: AuthBusiness | null;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Audit log types
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  'login',
  'login_failed',
  'logout',
  'register',
  'password_reset_request',
  'password_reset_complete',
  'token_refresh',
  'authorization_failed',
  'order_created',
  'order_status_changed',
  'product_created',
  'product_updated',
  'product_deleted',
  'product_featured',
  'product_unfeatured',
  'products_reordered',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditLog {
  _id: string;
  businessId?: string;
  userId?: string;
  action: AuditAction;
  target: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// API error/response types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// WebSocket contracts (re-exported from ./websocket.ts)
// ---------------------------------------------------------------------------

export type {
  WSChannel,
  WSChannelKind,
  ParsedChannel,
  WSMessage,
  WSSubscribeRequest,
  WSUnsubscribeRequest,
  WSPingRequest,
  WSClientRequest,
} from './websocket.js';

export { WS_MESSAGE_VERSION, channelFor, parseChannel, canSubscribeTo } from './websocket.js';
