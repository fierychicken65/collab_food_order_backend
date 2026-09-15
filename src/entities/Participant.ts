import 'reflect-metadata';
import { Entity, PrimaryKey, Property, ManyToOne, OneToMany } from '@mikro-orm/decorators/legacy';
import { Collection, type Rel } from '@mikro-orm/core';
import { randomUUID } from 'crypto';
import { GroupSession } from './GroupSession.js';
import { CartItem } from './CartItem.js';

@Entity()
export class Participant {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @ManyToOne(() => GroupSession, { deleteRule: 'cascade' })
  groupSession!: Rel<GroupSession>;

  @Property({ type: 'varchar', length: 100 })
  displayName!: string;

  @Property({ type: 'boolean', default: false })
  isHost: boolean = false;

  @Property({ type: 'boolean', default: false })
  isReady: boolean = false;

  @Property({ type: 'boolean', default: true })
  isOnline: boolean = true;

  @OneToMany(() => CartItem, (cartItem: CartItem) => cartItem.participant)
  cartItems = new Collection<CartItem>(this);

  @Property({ type: 'datetime', defaultRaw: 'CURRENT_TIMESTAMP' })
  joinedAt: Date = new Date();

  @Property({ type: 'datetime', defaultRaw: 'CURRENT_TIMESTAMP', onUpdate: () => new Date() })
  lastActiveAt: Date = new Date();

  constructor(partial?: Partial<Participant>) {
    Object.assign(this, partial);
  }
}
