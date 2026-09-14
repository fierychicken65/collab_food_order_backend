import 'reflect-metadata';
import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'crypto';
import { Order } from './Order.js';
import { Product } from './Product.js';

@Entity()
export class OrderItem {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => Order, { deleteRule: 'cascade' })
  order!: Order;

  @ManyToOne(() => Product, { nullable: true })
  product?: Product;

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
