import { fileURLToPath } from 'node:url';
import { type Db } from 'mongodb';
import { AUDIT_ACTIONS } from '@kaipos/shared';
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
  // Optional: index key shapes to drop before (re)creating indexes. Used when
  // reshaping a collection (e.g. moving from a businessId-scoped index to a
  // branchId-scoped one). Idempotent — missing indexes are ignored.
  dropIndexes?: Array<Record<string, 1 | -1>>;
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
          _id: { bsonType: 'string' },
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
          _id: { bsonType: 'string' },
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
          _id: { bsonType: 'string' },
          businessId: { bsonType: 'string' },
          email: { bsonType: 'string' },
          name: { bsonType: 'string' },
          passwordHash: { bsonType: 'string' },
          role: {
            enum: ['super_admin', 'admin', 'manager', 'supervisor', 'cashier', 'waiter', 'kitchen'],
          },
          branchIds: {
            bsonType: 'array',
            items: { bsonType: 'string' },
          },
          isActive: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [
      { key: { businessId: 1, email: 1 }, options: { unique: true } },
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
          _id: { bsonType: 'string' },
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
          'branchId',
          'name',
          'description',
          'price',
          'category',
          'sku',
          'stock',
          'trackStock',
          'stockUnit',
          'availability',
          'serviceSchedules',
          'allergens',
          'dietaryTags',
          'modifierGroups',
          'kitchenStationIds',
          'isActive',
          'createdAt',
          'updatedAt',
          'createdBy',
        ],
        properties: {
          _id: { bsonType: 'string' },
          businessId: { bsonType: 'string' },
          branchId: { bsonType: 'string' },
          name: { bsonType: 'string' },
          description: { bsonType: 'string' },
          price: { bsonType: 'number' },
          category: { bsonType: 'string' },
          sku: { bsonType: 'string' },
          // stock / lowStockThreshold use bsonType 'number' (not 'int') because the
          // Node MongoDB driver serializes plain JS integer literals as BSON double
          // by default. Requiring 'int' would reject routine writes unless every
          // call site wraps values in Int32 — see orders.subtotal / transactions.amount
          // for the same convention in this codebase.
          stock: { bsonType: 'number' },
          imageUrl: { bsonType: 'string' },
          cost: { bsonType: 'number' },
          taxRate: { bsonType: 'number' },
          trackStock: { bsonType: 'bool' },
          lowStockThreshold: { bsonType: 'number' },
          stockUnit: { enum: ['unit', 'kg', 'L'] },
          availability: {
            bsonType: 'object',
            required: ['pos', 'online', 'kiosk'],
            properties: {
              pos: { bsonType: 'bool' },
              online: { bsonType: 'bool' },
              kiosk: { bsonType: 'bool' },
            },
          },
          serviceSchedules: {
            bsonType: 'array',
            items: { enum: ['breakfast', 'lunch', 'dinner'] },
          },
          allergens: {
            bsonType: 'array',
            items: {
              enum: [
                'gluten',
                'dairy',
                'egg',
                'peanut',
                'tree-nut',
                'soy',
                'fish',
                'shellfish',
                'sesame',
              ],
            },
          },
          dietaryTags: {
            bsonType: 'array',
            items: {
              enum: ['vegetarian', 'vegan', 'gluten-free', 'keto', 'halal', 'kosher'],
            },
          },
          modifierGroups: {
            bsonType: 'array',
            items: {
              bsonType: 'object',
              required: ['id', 'name', 'required', 'options'],
              properties: {
                id: { bsonType: 'string' },
                name: { bsonType: 'string' },
                required: { bsonType: 'bool' },
                options: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'object',
                    required: ['id', 'label', 'priceDelta'],
                    properties: {
                      id: { bsonType: 'string' },
                      label: { bsonType: 'string' },
                      priceDelta: { bsonType: 'number' },
                    },
                  },
                },
              },
            },
          },
          kitchenStationIds: {
            bsonType: 'array',
            items: { bsonType: 'string' },
          },
          isActive: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    // Branch-scoped reshape (Paso 10): replace businessId-scoped indexes with
    // branchId-scoped ones so two branches of the same business can reuse SKUs.
    dropIndexes: [
      { businessId: 1, sku: 1 },
      { businessId: 1, category: 1, isActive: 1 },
    ],
    indexes: [
      { key: { branchId: 1, sku: 1 }, options: { unique: true } },
      { key: { branchId: 1, category: 1, isActive: 1 } },
      { key: { businessId: 1, branchId: 1 } },
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
          _id: { bsonType: 'string' },
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
          _id: { bsonType: 'string' },
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

  // ---- kitchenStations ----
  {
    name: 'kitchenStations',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['businessId', 'branchId', 'name', 'createdAt', 'updatedAt', 'createdBy'],
        properties: {
          _id: { bsonType: 'string' },
          businessId: { bsonType: 'string' },
          branchId: { bsonType: 'string' },
          name: { bsonType: 'string' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          createdBy: { bsonType: 'string' },
        },
      },
    },
    indexes: [{ key: { businessId: 1, branchId: 1 } }],
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
          _id: { bsonType: 'string' },
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
          _id: { bsonType: 'string' },
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

  // ---- refreshTokens ----
  {
    name: 'refreshTokens',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['userId', 'token', 'expiresAt', 'createdAt'],
        properties: {
          _id: { bsonType: 'string' },
          userId: { bsonType: 'string' },
          token: { bsonType: 'string' },
          expiresAt: { bsonType: 'date' },
          createdAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      { key: { userId: 1 } },
      { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
    ],
  },

  // ---- loginAttempts ----
  {
    name: 'loginAttempts',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['email', 'attempts', 'lastAttemptAt'],
        properties: {
          _id: { bsonType: 'string' },
          email: { bsonType: 'string' },
          attempts: { bsonType: 'int' },
          lockedUntil: { bsonType: ['date', 'null'] },
          lastAttemptAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [{ key: { email: 1 }, options: { unique: true } }],
  },

  // ---- auditLogs ----
  {
    name: 'auditLogs',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['action', 'target', 'createdAt'],
        properties: {
          _id: { bsonType: 'string' },
          businessId: { bsonType: 'string' },
          userId: { bsonType: 'string' },
          action: { enum: [...AUDIT_ACTIONS] },
          target: { bsonType: 'string' },
          ip: { bsonType: 'string' },
          userAgent: { bsonType: 'string' },
          metadata: { bsonType: 'object' },
          createdAt: { bsonType: 'date' },
        },
      },
    },
    indexes: [
      { key: { businessId: 1, createdAt: -1 } },
      { key: { userId: 1, createdAt: -1 } },
      { key: { createdAt: 1 }, options: { expireAfterSeconds: 90 * 24 * 60 * 60 } },
    ],
  },

  // ---- passwordResetTokens ----
  {
    name: 'passwordResetTokens',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['userId', 'token', 'expiresAt', 'createdAt'],
        properties: {
          _id: { bsonType: 'string' },
          userId: { bsonType: 'string' },
          token: { bsonType: 'string' },
          expiresAt: { bsonType: 'date' },
          createdAt: { bsonType: 'date' },
          usedAt: { bsonType: ['date', 'null'] },
        },
      },
    },
    indexes: [
      { key: { userId: 1 } },
      { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Setup: create/update collections with validators and indexes
// ---------------------------------------------------------------------------

export async function setupCollections(db: Db): Promise<void> {
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

    const collection = db.collection(col.name);

    // Drop obsolete indexes first (idempotent — missing indexes are ignored).
    if (col.dropIndexes?.length) {
      for (const key of col.dropIndexes) {
        // Mongo's default auto-generated index name is the concatenation of
        // `${field}_${direction}` pairs joined by `_` (e.g. `businessId_1_sku_1`).
        const indexName = Object.entries(key)
          .map(([field, dir]) => `${field}_${dir}`)
          .join('_');
        try {
          await collection.dropIndex(indexName);
          logger.info(`  Dropped obsolete index on "${col.name}": ${indexName}`);
        } catch (err) {
          const code = (err as { code?: number; codeName?: string }).code;
          // 27 = IndexNotFound, 26 = NamespaceNotFound
          if (code === 27 || code === 26) continue;
          throw err;
        }
      }
    }

    // Create indexes (idempotent)
    for (const idx of col.indexes) {
      await collection.createIndex(idx.key, idx.options);
    }
    logger.info(`  Ensured ${col.indexes.length} index(es) on "${col.name}"`);
  }
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

  logger.info('\nDone!');
  await closeConnection();
}

// Only run as a script when this file is the entry point — other modules
// (e.g. `db:reset`) import `setupCollections` without kicking off a second
// top-level `main()` that would race against theirs.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    logger.error({ err }, 'Setup failed');
    process.exit(1);
  });
}
