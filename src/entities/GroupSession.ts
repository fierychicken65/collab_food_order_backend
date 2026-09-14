import 'reflect-metadata';
import { Entity, PrimaryKey, Property, OneToMany } from '@mikro-orm/decorators/legacy';
import { Collection } from '@mikro-orm/core';
import { randomUUID } from 'crypto';
import { Participant } from './Participant.js';
import { CartItem } from './CartItem.js';

export enum GroupSessionStatus {
  ACTIVE = 'ACTIVE',
  ORDER_PLACED = 'ORDER_PLACED',
  ABANDONED = 'ABANDONED',
}

@Entity()
export class GroupSession {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'varchar', length: 6, unique: true, index: true })
  code!: string;

  @Property({ type: 'uuid' })
  hostParticipantId!: string;

  @Property({ type: 'varchar', length: 30, default: GroupSessionStatus.ACTIVE })
  status: GroupSessionStatus = GroupSessionStatus.ACTIVE;

  @Property({ type: 'integer', default: 1 })
  version: number = 1;

  @OneToMany(() => Participant, (participant: Participant) => participant.groupSession)
  participants = new Collection<Participant>(this);

  @OneToMany(() => CartItem, (cartItem: CartItem) => cartItem.groupSession)
  cartItems = new Collection<CartItem>(this);

  @Property({ type: 'datetime', defaultRaw: 'CURRENT_TIMESTAMP' })
  createdAt: Date = new Date();

  @Property({ type: 'datetime', defaultRaw: 'CURRENT_TIMESTAMP', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  constructor(partial?: Partial<GroupSession>) {
    Object.assign(this, partial);
  }
}
