import { type Db } from 'mongodb';
import { logger } from '../lib/logger.js';
import { hashPassword } from '../lib/password.js';
import { getDb, closeConnection } from './client.js';

// ---------------------------------------------------------------------------
// Atlas guard: refuse to run against MongoDB Atlas / prod Secrets Manager
// ---------------------------------------------------------------------------

function assertLocalMongo(): void {
  if (process.env.MONGO_SECRET_ARN) {
    throw new Error(
      'Seed refuses to run with MONGO_SECRET_ARN set. This script is for local/Docker Mongo only.',
    );
  }

  const uri = process.env.MONGO_URI;
  if (uri && uri.includes('mongodb+srv://')) {
    throw new Error(
      'Seed refuses to run against an Atlas URI (mongodb+srv://). Use local/Docker Mongo only.',
    );
  }

  const host = uri ?? '';
  const looksLocal =
    host === '' ||
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('@mongo:') ||
    host.includes('//mongo:');
  if (!looksLocal) {
    logger.warn(
      { uri: host.replace(/\/\/[^@]*@/, '//***@') },
      'MONGO_URI does not look local — proceeding anyway, but double-check you are not targeting a shared DB',
    );
  }
}

// ---------------------------------------------------------------------------
// Seed data (idempotent: skipped if the seed business already exists)
// ---------------------------------------------------------------------------

async function seedData(db: Db): Promise<void> {
  const businessesCol = db.collection('businesses');

  const existingBusiness = await businessesCol.findOne({ slug: 'la-cocina-de-kai' });
  if (existingBusiness) {
    logger.info('  Seed data already exists (business "la-cocina-de-kai" found). Skipping.');
    return;
  }

  const now = new Date();
  const businessId = 'biz_seed_001';
  const branchId = 'branch_seed_001';
  const adminUserId = 'user_seed_admin';
  const cashierUserId = 'user_seed_cashier';

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

  const [adminHash, cashierHash] = await Promise.all([
    hashPassword('admin123'),
    hashPassword('cajero123'),
  ]);

  const users = [
    {
      _id: adminUserId as never,
      businessId,
      email: 'admin@lacocinadekai.com',
      name: 'Carlos Méndez',
      passwordHash: adminHash,
      role: 'admin',
      branchIds: [branchId],
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      _id: cashierUserId as never,
      businessId,
      email: 'cajero@lacocinadekai.com',
      name: 'Juan Pérez',
      passwordHash: cashierHash,
      role: 'cashier',
      branchIds: [branchId],
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
  ];
  await db.collection('users').insertMany(users);
  logger.info('  Seeded 2 users (admin, cajero)');

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

  const productDefaults = {
    businessId,
    branchId,
    trackStock: true,
    stockUnit: 'unit' as const,
    availability: { pos: true, online: false, kiosk: false },
    serviceSchedules: [] as string[],
    allergens: [] as string[],
    dietaryTags: [] as string[],
    modifierGroups: [] as Array<Record<string, unknown>>,
    kitchenStationIds: [] as string[],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: adminUserId,
  };

  // Explicit string _id values — products' $jsonSchema requires _id as string;
  // without this MongoDB auto-generates an ObjectId which violates the validator.
  const products = [
    {
      _id: 'prod_seed_ent_001' as never,
      ...productDefaults,
      name: 'Tostones con Salami',
      description: 'Tostones crujientes con salami frito',
      price: 350,
      category: 'Entradas',
      sku: 'ENT-001',
      stock: 100,
    },
    {
      _id: 'prod_seed_ent_002' as never,
      ...productDefaults,
      name: 'Yuca Frita',
      description: 'Yuca frita con salsa de ajo',
      price: 250,
      category: 'Entradas',
      sku: 'ENT-002',
      stock: 100,
    },
    {
      _id: 'prod_seed_pla_001' as never,
      ...productDefaults,
      name: 'Pollo al Horno',
      description: 'Medio pollo al horno con especias criollas',
      price: 650,
      category: 'Platos Principales',
      sku: 'PLA-001',
      stock: 50,
    },
    {
      _id: 'prod_seed_pla_002' as never,
      ...productDefaults,
      name: 'Churrasco de Res',
      description: 'Churrasco a la parrilla con chimichurri',
      price: 950,
      category: 'Platos Principales',
      sku: 'PLA-002',
      stock: 30,
    },
    {
      _id: 'prod_seed_pla_003' as never,
      ...productDefaults,
      name: 'Mofongo de Chicharrón',
      description: 'Mofongo relleno de chicharrón con caldo',
      price: 550,
      category: 'Platos Principales',
      sku: 'PLA-003',
      stock: 40,
    },
    {
      _id: 'prod_seed_pla_004' as never,
      ...productDefaults,
      name: 'Bandera Dominicana',
      description: 'Arroz blanco, habichuelas rojas y carne guisada',
      price: 450,
      category: 'Platos Principales',
      sku: 'PLA-004',
      stock: 60,
    },
    {
      _id: 'prod_seed_beb_001' as never,
      ...productDefaults,
      name: 'Jugo de Chinola',
      description: 'Jugo natural de chinola (maracuyá)',
      price: 150,
      category: 'Bebidas',
      sku: 'BEB-001',
      stock: 200,
    },
    {
      _id: 'prod_seed_beb_002' as never,
      ...productDefaults,
      name: 'Morir Soñando',
      description: 'Leche con jugo de naranja y azúcar',
      price: 180,
      category: 'Bebidas',
      sku: 'BEB-002',
      stock: 200,
    },
    {
      _id: 'prod_seed_pos_001' as never,
      ...productDefaults,
      name: 'Habichuelas con Dulce',
      description: 'Postre tradicional de habichuelas dulces con leche',
      price: 200,
      category: 'Postres',
      sku: 'POS-001',
      stock: 30,
    },
    {
      _id: 'prod_seed_pos_002' as never,
      ...productDefaults,
      name: 'Flan de Coco',
      description: 'Flan cremoso de coco con caramelo',
      price: 220,
      category: 'Postres',
      sku: 'POS-002',
      stock: 25,
    },
  ];
  await db.collection('products').insertMany(products);
  logger.info('  Seeded 10 products');

  // Explicit string _id values — both collections' $jsonSchema requires _id as string.
  const modifiers = [
    {
      _id: 'mod_seed_size' as never,
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
      _id: 'mod_seed_extras' as never,
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
      _id: 'mod_seed_spice' as never,
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

  const tables = [
    { _id: 'table_seed_1', branchId, number: 1, capacity: 2, status: 'available' },
    { _id: 'table_seed_2', branchId, number: 2, capacity: 4, status: 'available' },
    { _id: 'table_seed_3', branchId, number: 3, capacity: 4, status: 'available' },
    { _id: 'table_seed_4', branchId, number: 4, capacity: 6, status: 'available' },
    { _id: 'table_seed_5', branchId, number: 5, capacity: 8, status: 'available' },
    { _id: 'table_seed_6', branchId, number: 6, capacity: 2, status: 'available' },
  ].map((t) => ({ ...t, createdAt: now, updatedAt: now, createdBy: adminUserId }));
  await db.collection('tables').insertMany(tables as never);
  logger.info('  Seeded 6 tables');

  await db.collection('kitchenStations').insertOne({
    _id: 'station_seed_001' as never,
    businessId,
    branchId,
    name: 'Cocina caliente',
    createdAt: now,
    updatedAt: now,
    createdBy: adminUserId,
  });
  logger.info('  Seeded 1 kitchen station');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.info('KaiPOS Database Seed');
  logger.info('====================\n');

  assertLocalMongo();

  const db = await getDb();

  logger.info('Seeding data...');
  await seedData(db);

  logger.info('\nDone!');
  await closeConnection();
}

main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
