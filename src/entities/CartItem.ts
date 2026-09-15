import 'reflect-metadata';
import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/decorators/legacy';
import type { Rel } from '@mikro-orm/core';
import { randomUUID } from 'crypto';
import { GroupSession } from './GroupSession.js';
import { Product } from './Product.js';
import { Participant } from './Participant.js';

@Entity()
@Unique({ properties: ['groupSession', 'product', 'participant'] })
export class CartItem {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => GroupSession, { deleteRule: 'cascade' })
  groupSession!: Rel<GroupSession>;

  @ManyToOne(() => Product)
  product!: Product;

  @ManyToOne(() => Participant, { deleteRule: 'cascade' })
  participant!: Rel<Participant>;

  @Property({ type: 'integer' })
  quantity: number = 1;

  @Property({ type: 'datetime', defaultRaw: 'CURRENT_TIMESTAMP' })
  createdAt: Date = new Date();

  @Property({ type: 'datetime', defaultRaw: 'CURRENT_TIMESTAMP', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  constructor(partial?: Partial<CartItem>) {
    Object.assign(this, partial);
  }
}
