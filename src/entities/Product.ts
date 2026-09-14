import 'reflect-metadata';
import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'crypto';

@Entity()
export class Product {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'varchar', length: 255 })
  name!: string;

  @Property({ type: 'text' })
  description!: string;

  @Property({ type: 'integer' })
  price!: number; // in cents (e.g. 999 = $9.99)

  @Property({ type: 'varchar', length: 500 })
  imageUrl!: string;

  @Property({ type: 'varchar', length: 100 })
  category!: string;

  @Property({ type: 'integer' })
  totalStock!: number;

  @Property({ type: 'integer' })
  availableStock!: number;

  @Property({ type: 'datetime', defaultRaw: 'CURRENT_TIMESTAMP' })
  createdAt: Date = new Date();

  @Property({ type: 'datetime', defaultRaw: 'CURRENT_TIMESTAMP', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  constructor(partial?: Partial<Product>) {
    Object.assign(this, partial);
  }
}
