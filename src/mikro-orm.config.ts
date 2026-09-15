import { defineConfig } from '@mikro-orm/postgresql';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { Migrator } from '@mikro-orm/migrations';
import dotenv from 'dotenv';
import {
  Product,
  GroupSession,
  Participant,
  CartItem,
  Order,
  OrderItem,
} from './entities/index.js';

dotenv.config();

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const dbUrl = process.env.DATABASE_URL || '';

// Render external URLs, Supabase, Neon require SSL. Render internal (dpg-*) URLs do not use SSL.
const needsSsl =
  process.env.DB_SSL === 'true' ||
  dbUrl.includes('sslmode=require') ||
  dbUrl.includes('ssl=true') ||
  dbUrl.includes('.render.com') ||
  dbUrl.includes('neon.tech') ||
  dbUrl.includes('supabase.co');

export default defineConfig({
  ...(hasDatabaseUrl
    ? { clientUrl: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgrespassword',
        dbName: process.env.DB_NAME || 'collab_food_order',
      }),
  driverOptions: needsSsl
    ? { ssl: { rejectUnauthorized: false } }
    : undefined,
  entities: [Product, GroupSession, Participant, CartItem, Order, OrderItem],
  metadataProvider: ReflectMetadataProvider,
  extensions: [Migrator],
  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    disableForeignKeys: false,
    allOrNothing: true,
    dropTables: false,
    safe: false,
    snapshot: true,
    emit: 'ts',
  },
  debug: process.env.NODE_ENV === 'development',
});
