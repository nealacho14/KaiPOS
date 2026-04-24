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
  // All seed _id values are UUID v4 to match production (services mint ids with
  // `crypto.randomUUID()`) and to satisfy the `z.string().uuid()` validators on
  // API route params. The fixed pattern `00000000-0000-4000-8000-NNNNNNNNNNNN`
  // keeps them stable, debuggable, and obviously non-random.
  const businessId = '00000000-0000-4000-8000-000000000100';
  const branchId = '00000000-0000-4000-8000-000000000200';
  const branchIdNaco = '00000000-0000-4000-8000-000000000201';
  const adminUserId = '00000000-0000-4000-8000-000000000301';
  const cashierUserId = '00000000-0000-4000-8000-000000000302';

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

  await db.collection('branches').insertMany([
    {
      _id: branchId as never,
      businessId,
      name: 'Sucursal Piantini',
      address: 'Calle Gustavo Mejía Ricart 54, Piantini',
      phone: '809-555-0101',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
    {
      _id: branchIdNaco as never,
      businessId,
      name: 'Sucursal Naco',
      address: 'Av. Tiradentes 12, Naco',
      phone: '809-555-0102',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    },
  ]);
  logger.info('  Seeded 2 branches: Piantini, Naco');

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
      branchIds: [branchId, branchIdNaco],
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
      _id: '00000000-0000-4000-8000-000000000401' as never,
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
      _id: '00000000-0000-4000-8000-000000000402' as never,
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
      _id: '00000000-0000-4000-8000-000000000403' as never,
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
      _id: '00000000-0000-4000-8000-000000000404' as never,
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
      _id: '00000000-0000-4000-8000-000000000405' as never,
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

  const products = [
    {
      _id: '00000000-0000-4000-8000-000000000001' as never,
      ...productDefaults,
      name: 'Tostones con Salami',
      description: 'Tostones crujientes con salami frito',
      price: 350,
      category: 'Entradas',
      sku: 'ENT-001',
      stock: 100,
    },
    {
      _id: '00000000-0000-4000-8000-000000000002' as never,
      ...productDefaults,
      name: 'Yuca Frita',
      description: 'Yuca frita con salsa de ajo',
      price: 250,
      category: 'Entradas',
      sku: 'ENT-002',
      stock: 100,
    },
    {
      _id: '00000000-0000-4000-8000-000000000003' as never,
      ...productDefaults,
      name: 'Pollo al Horno',
      description: 'Medio pollo al horno con especias criollas',
      price: 650,
      category: 'Platos Principales',
      sku: 'PLA-001',
      stock: 50,
    },
    {
      _id: '00000000-0000-4000-8000-000000000004' as never,
      ...productDefaults,
      name: 'Churrasco de Res',
      description: 'Churrasco a la parrilla con chimichurri',
      price: 950,
      category: 'Platos Principales',
      sku: 'PLA-002',
      stock: 30,
    },
    {
      _id: '00000000-0000-4000-8000-000000000005' as never,
      ...productDefaults,
      name: 'Mofongo de Chicharrón',
      description: 'Mofongo relleno de chicharrón con caldo',
      price: 550,
      category: 'Platos Principales',
      sku: 'PLA-003',
      stock: 40,
    },
    {
      _id: '00000000-0000-4000-8000-000000000006' as never,
      ...productDefaults,
      name: 'Bandera Dominicana',
      description: 'Arroz blanco, habichuelas rojas y carne guisada',
      price: 450,
      category: 'Platos Principales',
      sku: 'PLA-004',
      stock: 60,
    },
    {
      _id: '00000000-0000-4000-8000-000000000007' as never,
      ...productDefaults,
      name: 'Jugo de Chinola',
      description: 'Jugo natural de chinola (maracuyá)',
      price: 150,
      category: 'Bebidas',
      sku: 'BEB-001',
      stock: 200,
    },
    {
      _id: '00000000-0000-4000-8000-000000000008' as never,
      ...productDefaults,
      name: 'Morir Soñando',
      description: 'Leche con jugo de naranja y azúcar',
      price: 180,
      category: 'Bebidas',
      sku: 'BEB-002',
      stock: 200,
    },
    {
      _id: '00000000-0000-4000-8000-000000000009' as never,
      ...productDefaults,
      name: 'Habichuelas con Dulce',
      description: 'Postre tradicional de habichuelas dulces con leche',
      price: 200,
      category: 'Postres',
      sku: 'POS-001',
      stock: 30,
    },
    {
      _id: '00000000-0000-4000-8000-00000000000a' as never,
      ...productDefaults,
      name: 'Flan de Coco',
      description: 'Flan cremoso de coco con caramelo',
      price: 220,
      category: 'Postres',
      sku: 'POS-002',
      stock: 25,
    },
    // Naco branch — a small catalog so the branch switcher is meaningful.
    {
      _id: '00000000-0000-4000-8000-00000000000b' as never,
      ...productDefaults,
      branchId: branchIdNaco,
      name: 'Sancocho de 7 Carnes',
      description: 'Sancocho tradicional dominicano con siete carnes',
      price: 850,
      category: 'Platos Principales',
      sku: 'NAC-PLA-001',
      stock: 20,
    },
    {
      _id: '00000000-0000-4000-8000-00000000000c' as never,
      ...productDefaults,
      branchId: branchIdNaco,
      name: 'Empanadas de Pollo',
      description: 'Empanadas fritas rellenas de pollo guisado',
      price: 120,
      category: 'Entradas',
      sku: 'NAC-ENT-001',
      stock: 80,
    },
    {
      _id: '00000000-0000-4000-8000-00000000000d' as never,
      ...productDefaults,
      branchId: branchIdNaco,
      name: 'Mamajuana',
      description: 'Bebida tradicional con ron, vino tinto y miel',
      price: 300,
      category: 'Bebidas',
      sku: 'NAC-BEB-001',
      stock: 40,
    },
  ];
  await db.collection('products').insertMany(products);
  logger.info('  Seeded 13 products (10 Piantini, 3 Naco)');

  const modifiers = [
    {
      _id: '00000000-0000-4000-8000-000000000501' as never,
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
      _id: '00000000-0000-4000-8000-000000000502' as never,
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
      _id: '00000000-0000-4000-8000-000000000503' as never,
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
    {
      _id: '00000000-0000-4000-8000-000000000601',
      branchId,
      number: 1,
      capacity: 2,
      status: 'available',
    },
    {
      _id: '00000000-0000-4000-8000-000000000602',
      branchId,
      number: 2,
      capacity: 4,
      status: 'available',
    },
    {
      _id: '00000000-0000-4000-8000-000000000603',
      branchId,
      number: 3,
      capacity: 4,
      status: 'available',
    },
    {
      _id: '00000000-0000-4000-8000-000000000604',
      branchId,
      number: 4,
      capacity: 6,
      status: 'available',
    },
    {
      _id: '00000000-0000-4000-8000-000000000605',
      branchId,
      number: 5,
      capacity: 8,
      status: 'available',
    },
    {
      _id: '00000000-0000-4000-8000-000000000606',
      branchId,
      number: 6,
      capacity: 2,
      status: 'available',
    },
  ].map((t) => ({ ...t, createdAt: now, updatedAt: now, createdBy: adminUserId }));
  await db.collection('tables').insertMany(tables as never);
  logger.info('  Seeded 6 tables');

  await db.collection('kitchenStations').insertOne({
    _id: '00000000-0000-4000-8000-000000000701' as never,
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
