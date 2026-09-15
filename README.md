# Collaborative Food Ordering Backend

A robust, high-performance Node.js & TypeScript backend service powering real-time collaborative group food orders, inventory management with PostgreSQL pessimistic concurrency locking, and live state synchronization over WebSockets.

---

## Tech Stack & Dependencies

- **Runtime & Language**: Node.js (v20+) & TypeScript (ES2022 / NodeNext)
- **HTTP Framework**: Express
- **Real-Time Communication**: `ws` (Native WebSockets with custom room & presence manager)
- **Database & ORM**: PostgreSQL 16 & MikroORM v7 (`@mikro-orm/postgresql`, `@mikro-orm/migrations`)
- **Validation**: Zod (strict runtime request schemas)
- **Testing**: Vitest (unit, integration & concurrent race-condition tests)

---

## Database Schema & Entities

The relational database schema is managed via MikroORM entities and tracked using `@mikro-orm/migrations`:

- **`Product`**: Food menu items (`id`, `name`, `description`, `price` in cents, `imageUrl`, `category`, `totalStock`, `availableStock`).
- **`GroupSession`**: Shared group ordering sessions (`id`, `code` [6-character unique alphanumeric], `hostParticipantId`, `status` [`ACTIVE`, `ORDER_PLACED`, `ABANDONED`], `version`).
- **`Participant`**: Users in a group session (`id`, `displayName`, `isHost`, `isReady`, `isOnline`, `joinedAt`, `lastActiveAt`).
- **`CartItem`**: Collaborative line items in a group cart with explicit user attribution (`id`, `groupSession`, `product`, `participant`, `quantity`).
- **`Order`**: Finalized order record (`id`, `orderType` [`NORMAL`, `GROUP`], `customerName`, `totalAmount`, `status`, `groupSession`).
- **`OrderItem`**: Historical line items for orders preserving pricing and user attribution (`productName`, `price`, `quantity`, `addedByName`).

---

## Prerequisites & Environment Setup

### 1. Requirements
- **Node.js**: v20.x or higher
- **pnpm**: v9+ (or `npm`)
- **Docker**: For running PostgreSQL locally

### 2. Configure Environment Variables
Copy the provided `.env.example` template to create your `.env` file:

```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

### 3. Start PostgreSQL with Docker
Run the database container using the root `docker-compose.yml`:
```bash
docker compose up -d
```
Or start PostgreSQL manually:
```bash
docker run -d --name collab_food_order_postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=collab_food_order -p 5432:5432 postgres:16-alpine
```

---

## Installation, Migrations & Running

```bash
# 1. Install dependencies
pnpm install

# 2. Run migrations and seed database
pnpm db:seed

# 3. Start development server with live reload
pnpm dev

# 4. Production build & start
pnpm build
```

The HTTP API runs at `http://localhost:3000`.  
The WebSocket server runs at `ws://localhost:3000/ws`.

---

## REST API Reference

### Health & Products
- **`GET /health`**  
  Checks server and database health status.
- **`GET /api/products`**  
  Returns all menu items ordered by category with real-time stock levels, `isOutOfStock`, and `isLowStock` flags.

### Solo Orders
- **`POST /api/orders/solo`**  
  Places a standard solo order with atomic inventory deduction.  
  **Request Body:**
  ```json
  {
    "customerName": "Alice",
    "items": [
      { "productId": "uuid-here", "quantity": 2 }
    ]
  }
  ```

### Group Sessions
- **`POST /api/groups`**  
  Creates a new group session and designates the caller as Host. Returns session info and unique 6-character uppercase Join Code.  
  **Request Body:**
  ```json
  { "hostDisplayName": "Sarah" }
  ```
- **`POST /api/groups/join`**  
  Joins an active session using the Join Code.  
  **Request Body:**
  ```json
  { "code": "ABC123", "displayName": "David" }
  ```
- **`GET /api/groups/:id`**  
  Returns complete authoritative session state (session metadata, participants list with online/readiness states, attributed cart items, and live menu inventory).
- **`GET /api/groups/code/:code`**  
  Quick lookup to verify code validity before joining.
- **`POST /api/groups/:id/ready`**  
  Toggles participant readiness status (`isReady`).
- **`POST /api/groups/:id/checkout`**  
  Places the group order. Strictly restricted to the host; requires all participants to be ready.

---

## WebSocket Real-Time Protocol (`/ws`)

Connect to `ws://<host>:3000/ws`. All messages are JSON formatted.

### Inbound Client Messages (Client to Server)
| Message Type | Required Payload Fields | Description |
| :--- | :--- | :--- |
| `JOIN_SESSION` | `sessionId`, `participantId` | Associates socket with session, marks user online, sends full `SESSION_STATE`. |
| `PING` | — | Heartbeat keepalive ping (server replies with `PONG`). |
| `REQUEST_SYNC` | `sessionId` | Re-requests complete authoritative `SESSION_STATE` after reconnect. |
| `CART_ADD` | `sessionId`, `participantId`, `productId`, `quantity` | Atomically locks stock and adds item attributed to participant. |
| `CART_UPDATE` | `sessionId`, `participantId`, `cartItemId`, `quantity` | Modifies item quantity or removes if quantity is 0. |
| `CART_REMOVE` | `sessionId`, `participantId`, `cartItemId` | Removes cart item and restores available stock. |
| `TOGGLE_READY` | `sessionId`, `participantId` | Toggles readiness status ("Ready" vs "Still Browsing"). |
| `PLACE_ORDER` | `sessionId`, `participantId` | Host places order (enforces `allReady` and non-empty cart). |

### Outbound Broadcast Messages (Server to Client)
| Event Type | Payload Data | Description |
| :--- | :--- | :--- |
| `SESSION_STATE` | `{ session, participants, cartItems, products }` | Complete state snapshot on connection or resync. |
| `PARTICIPANT_STATUS_CHANGED` | `{ participantId, isOnline, isReady, allReady, participants }` | Broadcast when a user joins, disconnects, or toggles readiness. |
| `CART_UPDATED` | `{ cartItems, totalCartAmount, version }` | Broadcast immediately when any participant modifies the cart. |
| `INVENTORY_UPDATED` | `{ productId, availableStock, totalStock, isOutOfStock, isLowStock }` | Broadcast when product stock changes. |
| `ORDER_PLACED` | `{ orderId, sessionId, hostDisplayName, totalAmount, items }` | Broadcast when host places order; prompts receipt modal. |
| `ERROR` | `{ message }` | Emitted to a socket when an operation fails (e.g. `INSUFFICIENT_STOCK`). |

---

## Automated Tests

Run the test suite using Vitest:
```bash
pnpm test
```

### Test Suites:
1. **`concurrency.test.ts`**:
   - Tests simultaneous `cartService.addItem` race conditions on a product with only 1 unit remaining.
   - Confirms that PostgreSQL pessimistic row locking allows exactly 1 caller to succeed while the other receives `INSUFFICIENT_STOCK`, keeping stock non-negative (`0`).
   - Verifies item attribution tags on cart items.
2. **`group-readiness-and-checkout.test.ts`**:
   - Tests readiness status toggling and calculation of `allReady`.
   - Tests that non-hosts cannot checkout (`403 HOST_ONLY_CHECKOUT`).
   - Tests that host checkout is blocked when participants are not ready or the cart is empty.
   - Verifies successful order placement, session completion (`ORDER_PLACED`), item attribution preservation, and total stock reduction.
3. **`group-session.test.ts`**:
   - Tests 6-character uppercase code generation, host assignment, and participant joining.
4. **`products-and-solo-order.test.ts`**:
   - Tests product listing, solo order placement, and atomic stock reduction.