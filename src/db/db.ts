import { MikroORM } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config.js';

let orm: MikroORM | null = null;

export async function initDb(runMigrations: boolean = true): Promise<MikroORM> {
  if (!orm) {
    orm = await MikroORM.init(config);
    if (runMigrations) {
      await orm.migrator.up();
    }
  }
  return orm;
}

export function getOrm(): MikroORM {
  if (!orm) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return orm;
}

export function getEntityManager() {
  return getOrm().em.fork();
}
