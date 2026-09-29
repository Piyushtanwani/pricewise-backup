# PriceWise Backend — Setup and API Reference (v1, 29 Sep 2026)

Express 5 + Prisma + PostgreSQL. Every response shape below matches what the pages in
`frontend/src/pages` currently read from `frontend/src/data/mockData.ts`, so each page can swap
its mock import for an API call without changing its JSX.

## 1. Local setup

```bash
cd backend
npm install                 # also runs `prisma generate`
cp .env.example .env        # then set JWT_SECRET and ADMIN_API_KEY
npm run db:up               # PostgreSQL 15 in Docker on host port 5433
npx prisma migrate deploy   # or `npm run db:migrate` while changing the schema
npm run seed                # WIPES data, then loads the mockData catalogue + a test user
npm run dev                 # http://localhost:5000
npm test                    # unit tests (no database or network needed)
```

The Docker database uses port **5433** because a native PostgreSQL often occupies 5432.
The seed creates `test@example.com`; its development password is in `prisma/seed.ts`.

## 2. Adding Amazon and Flipkart API keys

Put credentials only in `backend/.env` (gitignored). Never commit them or paste them into chat, tickets or the frontend.

| Store | Variables | Where to get them |
|---|---|---|
| Amazon | `AMAZON_CREATORS_CLIENT_ID`, `AMAZON_CREATORS_CLIENT_SECRET`, `AMAZON_PARTNER_TAG` | Amazon Associates → Creators API. **PA-API 5.0 was retired on 15 May 2026**; old Access Key / Secret Key pairs return 403. |
| Flipkart | `FLIPKART_AFFILIATE_ID`, `FLIPKART_AFFILIATE_TOKEN` | affiliate.flipkart.com → API Token (one active token per account). |

India defaults are already set: `AMAZON_MARKETPLACE=www.amazon.in` and the EU token endpoint
`https://api.amazon.co.uk/auth/o2/token`. Both programmes require an approved affiliate account.

Verify, then populate live data:

```bash
curl localhost:5000/api/integrations/status                     # configured: true/false per store
curl -H "x-admin-key: $ADMIN_API_KEY" "localhost:5000/api/admin/live-search?q=sony+wh-1000xm5"
curl -H "x-admin-key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
     -d '{"query":"sony wh-1000xm5","category":"Headphones"}' localhost:5000/api/admin/import
npm run sync                                                     # refresh all linked listings
```

Seeded listings have no ASIN/FSN, so the sync skips them until they are linked with
`PATCH /api/admin/listings/:id {"externalId":"B0..."}` or matched during an import.
Set `PRICE_SYNC_INTERVAL_MINUTES` to run the sync in-process.

## 3. Endpoints

Authenticated routes need `Authorization: Bearer <token>`. Errors are `{ "message": string, "details"?: any }`.

| Frontend page | Method and path | Notes |
|---|---|---|
| Login / Signup | `POST /api/auth/register`, `POST /api/auth/login` | Returns `{ token, user }` |
| Navbar | `GET /api/auth/me`, `POST /api/auth/logout` | Logout is stateless (client drops token) |
| Home, Discover, Search | `GET /api/products` | `q, category, brand, store` (comma lists), `minPrice, maxPrice, minRating, sort, page, limit`. Returns `{ items: ProductCard[], total, page, limit }` |
| Filters, category tiles | `GET /api/products/meta` | Categories and brands with counts, stores, price range |
| Product Detail | `GET /api/products/:id` | Card + `storePrices`, `stats`, `verdict`, `insights`, `techSpecs`, `userState` (with token) |
| Product Detail charts | `GET /api/products/:id/history?range=3M&store=Amazon` | `range`: 7D, 30D, 3M, 6M, 1Y, All. Points `{ date, price, avg }` |
| Prediction tab | `GET /api/products/:id/prediction` | Points `{ date, price, predicted, upper, lower }`, 7/30-day forecast, confidence |
| Smart Alternatives | `GET /api/products/:id/alternatives` | Same category, similar price |
| Compare | `GET /api/products/compare?ids=a,b,c` | 2–4 ids; cards + `techSpecs` + `techSpecLabels` |
| Price Intelligence | `GET /api/intelligence/price?productId=&range=&store=` | Stats, history and prediction in one call |
| AI Assistant | `POST /api/intelligence/ai` `{ message, productIds? }` | Returns `{ role, content, products, insights }` |
| Wishlist | `GET/POST /api/user/wishlist`, `DELETE /api/user/wishlist/:productId` | Items include `addedPrice, change, changePercent` |
| Watchlist | `GET/POST /api/user/watchlist`, `DELETE /api/user/watchlist/:productId` | POST accepts optional `targetPrice` |
| Alerts | `GET/POST /api/user/alerts`, `PATCH/DELETE /api/user/alerts/:alertId` | GET returns `{ summary, alerts, events }` |
| Navbar bell | `GET /api/user/notifications`, `PATCH …/:id/read`, `POST …/read-all` | |
| Profile | `GET/PATCH /api/user/profile`, `PUT /api/user/password` | Includes stats |
| Settings | `GET/PUT /api/user/settings/notifications` | Keys mirror the Settings toggles |
| For You | `GET /api/user/recommendations` | Items include a `reason` |
| (operators) | `/api/admin/*` with `x-admin-key` | `integrations`, `sync`, `import`, `live-search`, `listings` |

`ProductCard` has the same fields as the `Product` type in `components/ui/ProductCard.tsx`:
`id, brand, name, image, rating, reviews, specs, bestPrice, mrp, discount, bestStore, stores, trend, category, aiVerdict, verdictColor, priceHistory`.

## 4. Known limitations

- The frontend still imports `mockData.ts`; no page calls this API yet.
- Notifications are in-app only. The email and push flags are stored, but nothing sends email or push yet (SendGrid/FCM not integrated).
- The AI assistant is rule-based (budget, category and intent parsing), not an LLM.
- Forecasts use a damped linear trend unless `ML_SERVICE_URL` points at `ml-service/`, whose current model is a random placeholder.
- Cross-store matching compares titles conservatively; GTIN matching is not implemented.
- The cache and scheduler run in-process; move them to Redis/BullMQ before running more than one instance.
- There is no rate limiting on auth routes yet.
- `prisma/dev.db` (the old SQLite database) is unused and can be deleted.
- `data-pipeline/main.py` still describes PA-API and is superseded by `src/services/stores`.
