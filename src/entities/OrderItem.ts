import 'reflect-metadata';
import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/decorators/legacy';
import type { Rel } from '@mikro-orm/core';
import { randomUUID } from 'crypto';
import { Order } from './Order.js';
import { Product } from './Product.js';

@Entity()
export class OrderItem {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Order, { deleteRule: 'cascade' })
  order!: Rel<Order>;

  @ManyToOne(() => Product, { nullable: true })
  product?: Rel<Product>;

  @Property({ type: 'varchar', length: 255 })
  productName!: string;

  @Property({ type: 'integer' })
  price!: number;

  @Property({ type: 'integer' })
  quantity!: number;

  @Property({ type: 'varchar', length: 100 })
  addedByName!: string;

  constructor(partial?: Partial<OrderItem>) {
    Object.assign(this, partial);
  }
}
