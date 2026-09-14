import { defineConfig } from '@mikro-orm/postgresql';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
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

export default defineConfig({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgrespassword',
  dbName: process.env.DB_NAME || 'collab_food_order',
  entities: [Product, GroupSession, Participant, CartItem, Order, OrderItem],
  metadataProvider: ReflectMetadataProvider,
  debug: process.env.NODE_ENV === 'development',
});
