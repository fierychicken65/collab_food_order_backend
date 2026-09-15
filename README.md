# Collaborative Food Ordering Backend

A robust, high-performance Node.js & TypeScript backend service powering real-time collaborative group food orders, inventory management with PostgreSQL pessimistic concurrency locking, and live state synchronization over WebSockets.

---

## Explanation Video

---

## Setup & Run Instructions

### 1. Specific Software & Tool Versions Used
- **Node.js**: `v20.18.0` (or `v20.x` LTS / `v22.x`)
- **Package Manager**: `pnpm` `v11.8.0` (or `pnpm v9+` / `npm v10+`)
- **Database**: PostgreSQL `16.0-alpine`
- **Docker**: Docker Desktop `v24.x+` with Docker Compose `v2.x`
- **TypeScript**: `^7.0.2`
- **Vitest**: `^5.0.0`

### 2. Environment Configuration
Copy `.env.example` to create your local `.env` configuration file:

```bash
# Linux/macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```


### 3. Database Container Setup (PostgreSQL 16)
Start the PostgreSQL database container using Docker Compose:

```bash
docker compose up -d
```

*Or launch via standalone Docker command:*
```bash
docker run -d \
  --name collab_food_order_postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=collab_food_order \
  -p 5432:5432 \
  postgres:16-alpine
```

### 4. Installation, Seeding & Development Server

```bash
# Step 1: Install exact package dependencies
pnpm install

# Step 2: Run migrations & seed catalog with 15 initial products
pnpm db:seed

# Step 3: Start development server with live reload (tsx watch)
pnpm dev
```

The HTTP REST API will listen at: `http://localhost:3000`  
The WebSocket server will listen at: `ws://localhost:3000/ws`

### 5. Running Automated Tests

Run the complete Vitest integration and concurrency test suite:

```bash
pnpm test
```

### 6. Production Build & Execution

```bash
# Compile TypeScript to dist/
pnpm build

# Start production Node server
pnpm start
```

---

## Packages Used & Architectural Rationale

| Package | Version | Purpose & Selection Rationale |
| :--- | :--- | :--- |
| **`express`** | `^5.2.1` | **HTTP REST Routing Framework.** Lightweight, battle-tested HTTP server handling REST endpoints for health checks, product catalog queries, group session lifecycle, and solo orders. |
| **`@mikro-orm/core`**<br>**`@mikro-orm/postgresql`**<br>**`@mikro-orm/migrations`** | `^7.2.0` | **Data Mapper ORM & Database Driver.** Chosen for strict Data Mapper pattern isolation, first-class pessimistic row-level locking (`LockMode.PESSIMISTIC_WRITE`), auto-migration generator, and clean entity decorator support. |
| **`ws`** | `^8.21.3` | **Native WebSocket Engine.** Extremely lightweight, low-latency, high-throughput WebSocket library chosen over socket.io for minimal footprint, precise room subscription management, and direct control over binary/JSON protocol frames. |
| **`zod`** | `^4.6.4` | **Runtime Schema Validation.** Guarantees runtime type safety and strict input validation for incoming HTTP request bodies and WebSocket JSON messages before executing domain logic. |
| **`dotenv`** | `^17.4.2` | **Environment Configuration.** Loads environment variables from `.env` securely into `process.env`. |
| **`cors`** | `^2.8.6` | **Cross-Origin Security.** Configures CORS headers to allow cross-origin requests from web browsers and Flutter mobile app clients. |
| **`reflect-metadata`** | `^0.2.2` | **Metadata Reflection.** Required by MikroORM for entity decorator metadata reflection and type inference. |
| **`vitest`** | `^5.0.0` | **Concurrent Test Runner.** Ultra-fast TypeScript test runner executing database race-condition concurrency tests and session lifecycle unit tests. |
| **`tsx`** | `^4.23.13` | **TypeScript Execution.** Native tsx executor for running development servers and seed scripts instantly without build overhead. |
| **`typescript`** | `^7.0.2` | **Static Typing System.** Ensures strict compile-time type safety across entities, repositories, WebSocket payloads, and DTOs. |

---

## Assumptions Made During Development

1. **Host-Centric Session Lifecycle & Auto-Close**:
   - The creator of a group session is designated as the **Host**.
   - If the Host leaves or disconnects from the session, the group session status is automatically transitioned to `CLOSED`. Any reserved cart stock for that session is immediately unlocked and returned to catalog `availableStock` via PostgreSQL pessimistic locks.


2. **No Authentication or Authorization**:
   - We have not implemented Auth for this project. So the user's state while using the app is temporary and will be lost once he closes the app


  
---

## Database Schema & Entities

- **`Product`**: Menu items (`id`, `name`, `description`, `price` in cents, `imageUrl`, `category`, `totalStock`, `availableStock`).
- **`GroupSession`**: Shared sessions (`id`, `code` [6-character unique uppercase code], `hostParticipantId`, `status` [`ACTIVE`, `CLOSED`, `ORDER_PLACED`], `version`).
- **`Participant`**: Users in a session (`id`, `displayName`, `isHost`, `isReady`, `isOnline`, `joinedAt`).
- **`CartItem`**: Shared cart line items with explicit user attribution (`id`, `groupSession`, `product`, `participant`, `quantity`).
- **`Order`**: Completed order records (`id`, `orderType` [`NORMAL`, `GROUP`], `customerName`, `totalAmount`, `status`, `groupSession`).
- **`OrderItem`**: Historical line items preserving pricing and user attribution (`productName`, `price`, `quantity`, `addedByName`).

---

## REST API Summary

- **`GET /health`** - Server and database health check.
- **`GET /api/products`** - Product catalog with live stock indicators (`availableStock`, `isOutOfStock`, `isLowStock`).
- **`POST /api/orders/solo`** - Solo order placement with atomic stock deduction.
- **`POST /api/groups`** - Create new group session & generate 6-character Join Code.
- **`POST /api/groups/join`** - Join session via code.
- **`GET /api/groups/:id`** - Get full session state snapshot.
- **`POST /api/groups/:id/leave`** - Leave session (Host leaving auto-closes session & releases stock).
- **`POST /api/groups/:id/ready`** - Toggle participant readiness.
- **`POST /api/groups/:id/checkout`** - Host-only group order placement.

---

## WebSocket Real-Time Protocol (`ws://localhost:3000/ws`)

| Event Type | Direction | Description |
| :--- | :--- | :--- |
| `JOIN_SESSION` | Client -> Server | Connects socket to session room & sends `SESSION_STATE`. |
| `CART_ADD` | Client -> Server | Atomically locks stock and adds item attributed to user. |
| `CART_UPDATE` | Client -> Server | Mutates item quantity or removes item if quantity is 0. |
| `CART_REMOVE` | Client -> Server | Removes cart item & releases stock back to catalog. |
| `TOGGLE_READY` | Client -> Server | Toggles user readiness ("Ready" vs "Still Browsing"). |
| `LEAVE_SESSION` | Client -> Server | User exits session (Host exit triggers session closure). |
| `PLACE_ORDER` | Client -> Server | Host places group order (requires `allReady: true`). |
| `SESSION_STATE` | Server -> Broadcast | Full session snapshot on connect/resync. |
| `CART_UPDATED` | Server -> Broadcast | Broadcasts updated cart & totals to all participants. |
| `INVENTORY_UPDATED` | Server -> Broadcast | Broadcasts updated catalog stock levels. |
| `PARTICIPANT_STATUS_CHANGED` | Server -> Broadcast | Broadcasts user joins, disconnects, or readiness toggles. |
| `SESSION_CLOSED` | Server -> Broadcast | Broadcasts session closure when host leaves/disconnects. |
| `ORDER_PLACED` | Server -> Broadcast | Broadcasts confirmed order summary to all participants. |