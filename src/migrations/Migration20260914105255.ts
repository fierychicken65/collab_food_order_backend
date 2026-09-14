import { Migration } from '@mikro-orm/migrations';

export class Migration20260914105255 extends Migration {

  override name = 'Migration20260914105255';

  override up(): void | Promise<void> {
    this.addSql(`create table "group_session" ("id" uuid not null, "code" varchar(6) not null, "host_participant_id" uuid not null, "status" varchar(30) not null default 'ACTIVE', "version" int not null default 1, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, primary key ("id"));`);
    this.addSql(`create index "group_session_code_index" on "group_session" ("code");`);
    this.addSql(`alter table "group_session" add constraint "group_session_code_unique" unique ("code");`);

    this.addSql(`create table "order" ("id" uuid not null, "group_session_id" uuid null, "order_type" varchar(20) not null default 'GROUP', "customer_name" varchar(100) not null, "total_amount" int not null, "status" varchar(30) not null default 'CONFIRMED', "created_at" timestamptz not null default CURRENT_TIMESTAMP, primary key ("id"));`);

    this.addSql(`create table "participant" ("id" uuid not null, "group_session_id" uuid not null, "display_name" varchar(100) not null, "is_host" boolean not null default false, "is_ready" boolean not null default false, "is_online" boolean not null default true, "joined_at" timestamptz not null default CURRENT_TIMESTAMP, "last_active_at" timestamptz not null default CURRENT_TIMESTAMP, primary key ("id"));`);

    this.addSql(`create table "product" ("id" uuid not null, "name" varchar(255) not null, "description" text not null, "price" int not null, "image_url" varchar(500) not null, "category" varchar(100) not null, "total_stock" int not null, "available_stock" int not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, primary key ("id"));`);

    this.addSql(`create table "order_item" ("id" uuid not null, "order_id" uuid not null, "product_id" uuid null, "product_name" varchar(255) not null, "price" int not null, "quantity" int not null, "added_by_name" varchar(100) not null, primary key ("id"));`);

    this.addSql(`create table "cart_item" ("id" uuid not null, "group_session_id" uuid not null, "product_id" uuid not null, "participant_id" uuid not null, "quantity" int not null default 1, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, primary key ("id"));`);
    this.addSql(`alter table "cart_item" add constraint "cart_item_group_session_id_product_id_participant_id_unique" unique ("group_session_id", "product_id", "participant_id");`);

    this.addSql(`alter table "order" add constraint "order_group_session_id_foreign" foreign key ("group_session_id") references "group_session" ("id") on delete set null;`);

    this.addSql(`alter table "participant" add constraint "participant_group_session_id_foreign" foreign key ("group_session_id") references "group_session" ("id") on delete cascade;`);

    this.addSql(`alter table "order_item" add constraint "order_item_order_id_foreign" foreign key ("order_id") references "order" ("id") on delete cascade;`);
    this.addSql(`alter table "order_item" add constraint "order_item_product_id_foreign" foreign key ("product_id") references "product" ("id") on delete set null;`);

    this.addSql(`alter table "cart_item" add constraint "cart_item_group_session_id_foreign" foreign key ("group_session_id") references "group_session" ("id") on delete cascade;`);
    this.addSql(`alter table "cart_item" add constraint "cart_item_product_id_foreign" foreign key ("product_id") references "product" ("id");`);
    this.addSql(`alter table "cart_item" add constraint "cart_item_participant_id_foreign" foreign key ("participant_id") references "participant" ("id") on delete cascade;`);
  }

}
