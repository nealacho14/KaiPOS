import type { Collection } from 'mongodb';
import type { Product, Order, User } from '@kaipos/shared';
import { getDb } from './client.js';

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
