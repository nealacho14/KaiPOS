import { type Db } from 'mongodb';
import { logger } from '../lib/logger.js';
import { getDb, closeConnection } from './client.js';

// ---------------------------------------------------------------------------
// Collection schemas & indexes
// ---------------------------------------------------------------------------

interface CollectionSetup {
  name: string;
  validator: Record<string, unknown>;
  indexes: Array<{
    key: Record<string, 1 | -1>;
    options?: Record<string, unknown>;
  }>;
}

const collections: CollectionSetup[] = [
  // ---- businesses ----
  {
    name: 'businesses',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['name', 'slug', 'isActive', 'createdAt', 'updatedAt'],
        properties: {
          name: { bsonType: 'string' },
          slug: { bsonType: 'string' },
          address: { bsonType: 'string' },
          phone: { bsonType: 'string' },
          email: { bsonType: 'string' },
          isActive: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [{ key: { slug: 1 }, options: { unique: true } }],
  },

  // ---- branches ----
  {
    name: 'branches',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['businessId', 'name', 'isActive', 'createdAt', 'updatedAt', 'createdBy'],
        properties: {
          businessId: { bsonType: 'string' },
          name: { bsonType: 'string' },
          address: { bsonType: 'string' },
          phone: { bsonType: 'string' },
          isActive: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [
      { key: { businessId: 1 } },
      { key: { businessId: 1, name: 1 }, options: { unique: true } },
    ],
  },

  // ---- users ----
  {
    name: 'users',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'businessId',
          'email',
          'name',
          'passwordHash',
          'role',
          'isActive',
          'createdAt',
          'updatedAt',
          'createdBy',
        ],
        properties: {
          businessId: { bsonType: 'string' },
          email: { bsonType: 'string' },
          name: { bsonType: 'string' },
          passwordHash: { bsonType: 'string' },
          role: { enum: ['admin', 'cashier', 'manager'] },
          isActive: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [
      { key: { email: 1 }, options: { unique: true } },
      { key: { businessId: 1, role: 1 } },
    ],
  },

  // ---- categories ----
  {
    name: 'categories',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'businessId',
          'name',
          'sortOrder',
          'isActive',
          'createdAt',
          'updatedAt',
          'createdBy',
        ],
        properties: {
          businessId: { bsonType: 'string' },
          name: { bsonType: 'string' },
          description: { bsonType: 'string' },
          sortOrder: { bsonType: 'int' },
          isActive: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [
      { key: { businessId: 1, name: 1 }, options: { unique: true } },
      { key: { businessId: 1, isActive: 1 } },
    ],
  },

  // ---- products ----
  {
    name: 'products',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'businessId',
          'name',
          'description',
          'price',
          'category',
          'sku',
          'stock',
          'isActive',
          'createdAt',
          'updatedAt',
          'createdBy',
        ],
        properties: {
          businessId: { bsonType: 'string' },
          name: { bsonType: 'string' },
          description: { bsonType: 'string' },
          price: { bsonType: 'number' },
          category: { bsonType: 'string' },
          sku: { bsonType: 'string' },
          stock: { bsonType: 'int' },
          isActive: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [
      { key: { businessId: 1, sku: 1 }, options: { unique: true } },
      { key: { businessId: 1, category: 1, isActive: 1 } },
    ],
  },

  // ---- modifiers ----
  {
    name: 'modifiers',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'businessId',
          'name',
          'options',
          'isActive',
          'createdAt',
          'updatedAt',
          'createdBy',
        ],
        properties: {
          businessId: { bsonType: 'string' },
          name: { bsonType: 'string' },
          options: {
            bsonType: 'array',
            items: {
              bsonType: 'object',
              required: ['name', 'price'],
              properties: {
                name: { bsonType: 'string' },
                price: { bsonType: 'number' },
              },
            },
          },
          isActive: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [{ key: { businessId: 1 } }, { key: { businessId: 1, isActive: 1 } }],
  },

  // ---- tables ----
  {
    name: 'tables',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'branchId',
          'number',
          'capacity',
          'status',
          'createdAt',
          'updatedAt',
          'createdBy',
        ],
        properties: {
          branchId: { bsonType: 'string' },
          number: { bsonType: 'int' },
          capacity: { bsonType: 'int' },
          status: { enum: ['available', 'occupied', 'reserved', 'out-of-service'] },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [
      { key: { branchId: 1, number: 1 }, options: { unique: true } },
      { key: { branchId: 1, status: 1 } },
    ],
  },

  // ---- orders ----
  {
    name: 'orders',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'businessId',
          'branchId',
          'orderNumber',
          'items',
          'subtotal',
          'tax',
          'total',
          'status',
          'paymentMethod',
          'createdAt',
          'updatedAt',
          'createdBy',
        ],
        properties: {
          businessId: { bsonType: 'string' },
          branchId: { bsonType: 'string' },
          orderNumber: { bsonType: 'string' },
          items: { bsonType: 'array' },
          subtotal: { bsonType: 'number' },
          tax: { bsonType: 'number' },
          total: { bsonType: 'number' },
          status: { enum: ['pending', 'completed', 'cancelled', 'refunded'] },
          paymentMethod: { enum: ['cash', 'card', 'transfer', 'other'] },
          customerId: { bsonType: 'string' },
          tableId: { bsonType: 'string' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [
      { key: { businessId: 1, branchId: 1, createdAt: -1 } },
      { key: { businessId: 1, orderNumber: 1 }, options: { unique: true } },
    ],
  },

  // ---- transactions ----
  {
    name: 'transactions',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'businessId',
          'orderId',
          'amount',
          'method',
          'status',
          'createdAt',
          'updatedAt',
          'createdBy',
        ],
        properties: {
          businessId: { bsonType: 'string' },
          orderId: { bsonType: 'string' },
          amount: { bsonType: 'number' },
          method: { enum: ['cash', 'card', 'transfer', 'other'] },
          status: { enum: ['pending', 'completed', 'failed', 'refunded'] },
          reference: { bsonType: 'string' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [{ key: { businessId: 1, orderId: 1 } }, { key: { businessId: 1, createdAt: -1 } }],
  },
];

// ---------------------------------------------------------------------------
// Setup: create/update collections with validators and indexes
// ---------------------------------------------------------------------------

async function setupCollections(db: Db): Promise<void> {
  const existing = new Set(
    await db
      .listCollections({}, { nameOnly: true })
      .toArray()
      .then((cols) => cols.map((c) => c.name)),
  );

  for (const col of collections) {
    if (existing.has(col.name)) {
      // Try to update validator on existing collection (requires collMod privilege)
      try {
        await db.command({
          collMod: col.name,
          validator: col.validator,
          validationLevel: 'moderate',
          validationAction: 'error',
        });
        logger.info(`  Updated validator for "${col.name}"`);
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (code === 8000) {
          logger.info(`  Skipped validator update for "${col.name}" (insufficient privileges)`);
        } else {
          throw err;
        }
      }
    } else {
      await db.createCollection(col.name, {
        validator: col.validator,
        validationLevel: 'moderate',
        validationAction: 'error',
      });
      logger.info(`  Created collection "${col.name}"`);
    }

    // Create indexes (idempotent)
    const collection = db.collection(col.name);
    for (const idx of col.indexes) {
      await collection.createIndex(idx.key, idx.options);
    }
    logger.info(`  Ensured ${col.indexes.length} index(es) on "${col.name}"`);
  }
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

async function seedData(db: Db): Promise<void> {
  const businessesCol = db.collection('businesses');

  // Check idempotency — skip if already seeded
  const existingBusiness = await businessesCol.findOne({ slug: 'la-cocina-de-kai' });
  if (existingBusiness) {
    logger.info('  Seed data already exists (business "la-cocina-de-kai" found). Skipping.');
    return;
  }

  const now = new Date();
  const businessId = 'biz_seed_001';
  const branchId = 'branch_seed_001';
  const adminUserId = 'user_seed_admin';

  // Business
  await businessesCol.insertOne({
    _id: businessId as never,
    name: 'La Cocina de Kai',
    slug: 'la-cocina-de-kai',
    address: 'Av. Winston Churchill 1099, Santo Domingo',
    phone: '809-555-0100',
    email: 'info@lacocinadekai.com',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  logger.info('  Seeded business: La Cocina de Kai');

  // Branch
  await db.collection('branches').insertOne({
    _id: branchId as never,
    businessId,
    name: 'Sucursal Piantini',
    address: 'Calle Gustavo Mejía Ricart 54, Piantini',
    phone: '809-555-0101',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: adminUserId,
  });
  logger.info('  Seeded branch: Sucursal Piantini');

  // Users (3 roles)
  const users = [
    {
      _id: adminUserId as never,
      businessId,
      email: 'admin@lacocinadekai.com',
      name: 'Carlos Méndez',
      passwordHash: '$2b$10$placeholder_admin_hash',
      role: 'admin',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      _id: 'user_seed_manager' as never,
      businessId,
      email: 'manager@lacocinadekai.com',
      name: 'María Santos',
      passwordHash: '$2b$10$placeholder_manager_hash',
      role: 'manager',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      _id: 'user_seed_cashier' as never,
      businessId,
      email: 'cajero@lacocinadekai.com',
      name: 'Juan Pérez',
      passwordHash: '$2b$10$placeholder_cashier_hash',
      role: 'cashier',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
  ];
  await db.collection('users').insertMany(users);
  logger.info('  Seeded 3 users (admin, manager, cashier)');

  // Categories
  const categories = [
    {
      _id: 'cat_seed_appetizers' as never,
      businessId,
      name: 'Entradas',
      description: 'Aperitivos y entradas',
      sortOrder: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      _id: 'cat_seed_main' as never,
      businessId,
      name: 'Platos Principales',
      description: 'Platos fuertes',
      sortOrder: 2,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      _id: 'cat_seed_drinks' as never,
      businessId,
      name: 'Bebidas',
      description: 'Jugos, refrescos y cócteles',
      sortOrder: 3,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      _id: 'cat_seed_desserts' as never,
      businessId,
      name: 'Postres',
      description: 'Dulces y postres',
      sortOrder: 4,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      _id: 'cat_seed_sides' as never,
      businessId,
      name: 'Acompañantes',
      description: 'Arroz, ensaladas y más',
      sortOrder: 5,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
  ];
  await db.collection('categories').insertMany(categories);
  logger.info('  Seeded 5 categories');

  // Products
  const products = [
    {
      businessId,
      name: 'Tostones con Salami',
      description: 'Tostones crujientes con salami frito',
      price: 350,
      category: 'Entradas',
      sku: 'ENT-001',
      stock: 100,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Yuca Frita',
      description: 'Yuca frita con salsa de ajo',
      price: 250,
      category: 'Entradas',
      sku: 'ENT-002',
      stock: 100,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Pollo al Horno',
      description: 'Medio pollo al horno con especias criollas',
      price: 650,
      category: 'Platos Principales',
      sku: 'PLA-001',
      stock: 50,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Churrasco de Res',
      description: 'Churrasco a la parrilla con chimichurri',
      price: 950,
      category: 'Platos Principales',
      sku: 'PLA-002',
      stock: 30,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Mofongo de Chicharrón',
      description: 'Mofongo relleno de chicharrón con caldo',
      price: 550,
      category: 'Platos Principales',
      sku: 'PLA-003',
      stock: 40,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Bandera Dominicana',
      description: 'Arroz blanco, habichuelas rojas y carne guisada',
      price: 450,
      category: 'Platos Principales',
      sku: 'PLA-004',
      stock: 60,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Jugo de Chinola',
      description: 'Jugo natural de chinola (maracuyá)',
      price: 150,
      category: 'Bebidas',
      sku: 'BEB-001',
      stock: 200,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Morir Soñando',
      description: 'Leche con jugo de naranja y azúcar',
      price: 180,
      category: 'Bebidas',
      sku: 'BEB-002',
      stock: 200,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Habichuelas con Dulce',
      description: 'Postre tradicional de habichuelas dulces con leche',
      price: 200,
      category: 'Postres',
      sku: 'POS-001',
      stock: 30,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Flan de Coco',
      description: 'Flan cremoso de coco con caramelo',
      price: 220,
      category: 'Postres',
      sku: 'POS-002',
      stock: 25,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
  ];
  await db.collection('products').insertMany(products);
  logger.info('  Seeded 10 products');

  // Modifiers
  const modifiers = [
    {
      businessId,
      name: 'Tamaño',
      options: [
        { name: 'Regular', price: 0 },
        { name: 'Grande', price: 100 },
      ],
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Extras',
      options: [
        { name: 'Queso Extra', price: 75 },
        { name: 'Aguacate', price: 50 },
        { name: 'Huevo Frito', price: 60 },
      ],
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      businessId,
      name: 'Nivel de Picante',
      options: [
        { name: 'Sin Picante', price: 0 },
        { name: 'Poco Picante', price: 0 },
        { name: 'Muy Picante', price: 0 },
      ],
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
  ];
  await db.collection('modifiers').insertMany(modifiers);
  logger.info('  Seeded 3 modifiers');

  // Tables
  const tables = [
    { branchId, number: 1, capacity: 2, status: 'available' },
    { branchId, number: 2, capacity: 4, status: 'available' },
    { branchId, number: 3, capacity: 4, status: 'available' },
    { branchId, number: 4, capacity: 6, status: 'available' },
    { branchId, number: 5, capacity: 8, status: 'available' },
    { branchId, number: 6, capacity: 2, status: 'available' },
  ].map((t) => ({ ...t, createdAt: now, updatedAt: now, createdBy: adminUserId }));
  await db.collection('tables').insertMany(tables);
  logger.info('  Seeded 6 tables');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.info('KaiPOS Database Setup');
  logger.info('=====================\n');

  const db = await getDb();

  logger.info('Setting up collections, validators, and indexes...');
  await setupCollections(db);

  logger.info('\nSeeding data...');
  await seedData(db);

  logger.info('\nDone!');
  await closeConnection();
}

main().catch((err) => {
  logger.error({ err }, 'Setup failed');
  process.exit(1);
});
