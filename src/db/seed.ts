import { initDb } from './db.js';
import { Product } from '../entities/Product.js';

export const initialProducts = [
  {
    name: 'Classic Smash Cheeseburger',
    description: 'Double smashed beef patties, melted American cheese, pickles, diced onions, and house sauce on a toasted potato bun.',
    price: 999, // $9.99
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
    category: 'Burgers',
    totalStock: 20,
    availableStock: 20,
  },
  {
    name: 'Truffle Wagyu Deluxe',
    description: 'Premium Wagyu beef, black truffle aioli, aged Swiss gruyère, arugula, and caramelized shallots.',
    price: 1699, // $16.99
    imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600',
    category: 'Burgers',
    totalStock: 3, // LOW STOCK FOR TESTING REAL-TIME AVAILABILITY!
    availableStock: 3,
  },
  {
    name: 'Crispy Nashville Hot Chicken',
    description: 'Golden fried chicken breast tossed in fiery Nashville chili oil, topped with coleslaw and tangy dill pickles.',
    price: 1149, // $11.49
    imageUrl: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600',
    category: 'Burgers',
    totalStock: 15,
    availableStock: 15,
  },
  {
    name: 'Loaded Truffle Parmesan Fries',
    description: 'Hand-cut crispy Idaho russet fries tossed with white truffle oil, grated pecorino parmesan, and fresh chives.',
    price: 649, // $6.49
    imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600',
    category: 'Sides',
    totalStock: 25,
    availableStock: 25,
  },
  {
    name: 'Beer-Battered Crispy Onion Rings',
    description: 'Thick-cut Spanish sweet onions coated in craft IPA batter, served with spicy chipotle dipping sauce.',
    price: 549, // $5.49
    imageUrl: 'https://images.unsplash.com/photo-1639024471285-0afc83531485?w=600',
    category: 'Sides',
    totalStock: 2, // LOW STOCK FOR TESTING REAL-TIME AVAILABILITY!
    availableStock: 2,
  },
  {
    name: 'Artisan Margherita Pizza',
    description: 'San Marzano tomato sauce, fresh buffalo mozzarella, fragrant sweet basil leaves, and cold-pressed extra virgin olive oil.',
    price: 1499, // $14.99
    imageUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=600',
    category: 'Pizza',
    totalStock: 12,
    availableStock: 12,
  },
  {
    name: 'Spicy Pepperoni & Hot Honey Pizza',
    description: 'Crispy cupping pepperoni, mozzarella, crushed red chili flakes, and a hot honey drizzle over charred sourdough crust.',
    price: 1649, // $16.49
    imageUrl: 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=600',
    category: 'Pizza',
    totalStock: 10,
    availableStock: 10,
  },
  {
    name: 'Fresh Mango Passion Lemonade',
    description: 'Freshly squeezed California lemons, Alphonso mango purée, passionfruit pulp, and fresh crushed mint.',
    price: 449, // $4.49
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600',
    category: 'Drinks',
    totalStock: 30,
    availableStock: 30,
  },
  {
    name: 'Cold Brew Craft Float',
    description: 'Slow-steeped Colombian cold brew poured over artisan Madagascar bourbon vanilla bean ice cream.',
    price: 599, // $5.99
    imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600',
    category: 'Drinks',
    totalStock: 15,
    availableStock: 15,
  },
  {
    name: 'Molten Lava Chocolate Cake',
    description: 'Warm dark chocolate cake with a rich flowing center, served with cocoa nib crumble.',
    price: 799, // $7.99
    imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600',
    category: 'Desserts',
    totalStock: 5,
    availableStock: 5,
  },
];

export async function seed() {
  console.log('🌱 Connecting to database and running migrations...');
  const orm = await initDb(false);
  await orm.migrator.up();
  console.log('✅ Migrations applied successfully.');

  const em = orm.em.fork();

  const existingCount = await em.count(Product);
  if (existingCount === 0) {
    console.log('🌱 Seeding initial products...');
    for (const item of initialProducts) {
      const product = new Product(item);
      em.persist(product);
    }
    await em.flush();
    console.log(`✅ Seeded ${initialProducts.length} menu items successfully.`);
  } else {
    console.log(`ℹ️ Products already seeded (${existingCount} items present in database). Resetting stock...`);
    for (const item of initialProducts) {
      const p = await em.findOne(Product, { name: item.name });
      if (p) {
        p.availableStock = item.availableStock;
        p.totalStock = item.totalStock;
      }
    }
    await em.flush();
    console.log('✅ Stock levels refreshed.');
  }

  await orm.close();
}

if (process.argv[1] && (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'))) {
  seed()
    .then(() => {
      console.log('🚀 Seeding completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}
