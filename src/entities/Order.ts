import 'reflect-metadata';
import { Entity, PrimaryKey, Property, ManyToOne, OneToMany } from '@mikro-orm/decorators/legacy';
import { Collection } from '@mikro-orm/core';
import { randomUUID } from 'crypto';
import { GroupSession } from './GroupSession.js';
import { OrderItem } from './OrderItem.js';

export enum OrderType {
  NORMAL = 'NORMAL',
  GROUP = 'GROUP',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity()
export class Order {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => GroupSession, { nullable: true })
  groupSession?: GroupSession;

  @Property({ type: 'varchar', length: 20, default: OrderType.GROUP })
  orderType: OrderType = OrderType.GROUP;

  @Property({ type: 'varchar', length: 100 })
  customerName!: string;

  @Property({ type: 'integer' })
  totalAmount!: number;

  @Property({ type: 'varchar', length: 30, default: OrderStatus.CONFIRMED })
  status: OrderStatus = OrderStatus.CONFIRMED;

  @OneToMany(() => OrderItem, (item: OrderItem) => item.order)
  items = new Collection<OrderItem>(this);

  @Property({ type: 'datetime', defaultRaw: 'CURRENT_TIMESTAMP' })
  createdAt: Date = new Date();

  constructor(partial?: Partial<Order>) {
    Object.assign(this, partial);
  }
}
