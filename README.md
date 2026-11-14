# Wude Mart — Executive Admin Console

Unified, high-density administrative web console for **Wude Mart**, engineered from the Google Stitch visual design system and integrated with the Wude Mart FastAPI backend.

## Key Capabilities & Modules

1. **Executive Commerce Overview (`#dashboard`)**:
   - Live synchronization with real backend database.
   - Core operational KPIs: Settled Revenue, Total Orders, Pending Payment Reviews, and Active Catalog Listings.
   - Recent live store orders stream.
   - Distinctly labeled and isolated simulation modeling for capacity flux.

2. **Orders Management (`#orders`)**:
   - High-density order queue with real-time status pills.
   - Filter by status: `pending_payment`, `payment_review`, `paid`, `processing`, `shipped`, `completed`, `cancelled`.
   - Slide-over detail drawer for in-depth order inspection.
   - Fulfillment status manager (`PATCH /api/admin/orders/{id}/status`) using FastAPI FormData protocol.
   - Seamless transition to Payment Verification station for pending wire slips.

3. **Payment Verification Station (`#payments`)**:
   - Master-detail split workspace with queue triage.
   - Strict manual approval protocol: customer receipts are never auto-cleared.
   - High-resolution bank transfer slip canvas with interactive Zoom (+/-), 90-degree Rotation, and Canvas Reset controls.
   - Audit trail and administrative review notes persistence.
   - Strict clearance authorization modal with ledger verification checks.
   - Instant order advancement to `paid` upon approval (`POST /api/admin/payments/{id}/review`).

4. **Products & Catalog CMS (`#products`)**:
   - Catalog management: SKU IDs, pricing, thumbnail preview, and active storefront availability.
   - In-context slide-out drawer for adding new products (`POST /api/admin/products`) and editing existing SKUs (`PATCH /api/admin/products/{id}`).
   - Safe product deletion (`DELETE /api/admin/products/{id}`) with administrative confirmation.

5. **Administrative Security Gate (`#login`)**:
   - Cryptographically signed JWT authentication (`POST /api/auth/login`).
   - Role-based gate: restricts customer access and allows only verified `admin` roles.
   - Dynamic API Base URL configuration switch for seamless staging and production targeting.

## Build & Deployment (Cloudflare Pages)

- **Framework**: Modern Zero-Dependency SPA (Tailwind CSS Executive Precision + ES Modules)
- **Build Command**: `node build.js` (or `npm run build`)
- **Build Output Directory**: `dist`
- **Routing**: `_redirects` SPA fallback rule included for Cloudflare Pages

### Local Development

To run locally with Python static server or any HTTP server:
```bash
python -m http.server 3000 --directory dist
```
Or start the backend API:
```bash
cd ../wude_mart_backend/wude_mart_backend
uvicorn main:app --reload
```
