import type { Collection } from 'mongodb';
import type {
  Business,
  Branch,
  Category,
  KitchenStation,
  Product,
  Order,
  User,
  RefreshToken,
  LoginAttempt,
  PasswordResetToken,
  AuditLog,
} from '@kaipos/shared';
import { getDb } from './client.js';

export async function getBusinessesCollection(): Promise<Collection<Business>> {
  const db = await getDb();
  return db.collection<Business>('businesses');
}

export async function getBranchesCollection(): Promise<Collection<Branch>> {
  const db = await getDb();
  return db.collection<Branch>('branches');
}

export async function getCategoriesCollection(): Promise<Collection<Category>> {
  const db = await getDb();
  return db.collection<Category>('categories');
}

export async function getKitchenStationsCollection(): Promise<Collection<KitchenStation>> {
  const db = await getDb();
  return db.collection<KitchenStation>('kitchenStations');
}

export async function getProductsCollection(): Promise<Collection<Product>> {
  const db = await getDb();
  return db.collection<Product>('products');
}

export async function getOrdersCollection(): Promise<Collection<Order>> {
  const db = await getDb();
  return db.collection<Order>('orders');
}

export async function getUsersCollection(): Promise<Collection<User>> {
  const db = await getDb();
  return db.collection<User>('users');
}

export async function getRefreshTokensCollection(): Promise<Collection<RefreshToken>> {
  const db = await getDb();
  return db.collection<RefreshToken>('refreshTokens');
}

export async function getLoginAttemptsCollection(): Promise<Collection<LoginAttempt>> {
  const db = await getDb();
  return db.collection<LoginAttempt>('loginAttempts');
}

export async function getPasswordResetTokensCollection(): Promise<Collection<PasswordResetToken>> {
  const db = await getDb();
  return db.collection<PasswordResetToken>('passwordResetTokens');
}

export async function getAuditLogsCollection(): Promise<Collection<AuditLog>> {
  const db = await getDb();
  return db.collection<AuditLog>('auditLogs');
}
