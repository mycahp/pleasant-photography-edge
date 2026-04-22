# Pleasant Photography Edge

Monorepo for a photography print storefront — photo management, Stripe product catalog, Bunny CDN asset hosting, and Gelato print fulfillment.

## Architecture

```
pleasant-photography-edge/
├── admin/          # Fresh 2 web app — product management dashboard
├── scripts/        # Deno CLI tools for batch operations
├── shared/         # Modules and config shared across apps and scripts
├── storefront/     # Customer-facing storefront (coming soon)
└── deno.json       # Root import map
```

**Runtime:** [Deno](https://deno.com)
**Services:** [Stripe](https://stripe.com) (payments/catalog), [Bunny CDN](https://bunny.net) (asset storage/delivery), [Gelato](https://www.gelato.com) (print fulfillment)

---

## Admin (`admin/`)

A [Fresh 2](https://fresh.deno.dev) web application for managing the photo product catalog. Built with Preact, Preact Signals, and Vite.

### Features

- **Upload photos** — select a file, upload to Bunny CDN Storage, and create the corresponding Stripe Product with variant Prices in one step.
- **Product listing** — view all active products pulled from the Stripe API, with images served from the Bunny CDN.
- **Edit products** — inline editing of product name, image URL, print size labels, and Gelato Product UIDs on existing prices.
- **Add new prices** — add additional print size variants to an existing product.
- **Archive prices** — deactivate a price without deleting it (Stripe prices are immutable; archiving is the supported removal mechanism).
- **Delete products** — archives the Stripe Product and all its Prices, and deletes the source file from Bunny Storage.
- **Configurable variant templates** — default print sizes, prices, and Gelato Product UIDs loaded from `shared/variants.json`. Overridable per-product at creation time.

### API Routes

| Method | Path                  | Description                                |
| ------ | --------------------- | ------------------------------------------ |
| POST   | `/api/create-product` | Upload file to Bunny, create Stripe Product + Prices |
| GET    | `/api/products`       | List all active products with prices       |
| PATCH  | `/api/products`       | Update product/price metadata, add prices, archive prices |
| DELETE | `/api/products?id=…`  | Archive product + prices, delete CDN file  |
| GET    | `/api/variants`       | Return default variant template from config |

### Running Locally

```bash
cd admin
deno task dev
```

The dev server starts on `http://localhost:5173` (Vite) with HMR. Requires a `.env` file in the project root (see [Environment Variables](#environment-variables)).

### Building & Deploying

```bash
cd admin
deno task build        # outputs to admin/_fresh/
deno task preview      # serves the built app
```

For production on a VPS, serve with `deno serve`:

```bash
deno serve -A --port 8000 --env-file=../.env _fresh/server.js
```

---

## Scripts (`scripts/`)

Deno CLI tools for batch operations outside the admin UI.

### `create-stripe-product`

Uploads a photo to Bunny CDN and creates a Stripe Product with variant Prices — the same workflow as the admin UI, but from the command line.

```bash
deno run \
  --allow-net --allow-read --allow-env \
  --env-file=.env \
  scripts/create-stripe-product/main.ts \
  --name "Sunset at Point Reyes" \
  path/to/photo.jpg
```

Variant sizes and prices come from `shared/variants.json`.

### `storefront-api` (Bunny EdgeScript)

A Bunny EdgeScript that runs on the CDN edge, providing the product catalog and
Stripe embedded checkout API for the storefront.

| Method | Path               | Description                                      |
| ------ | ------------------ | ------------------------------------------------ |
| GET    | `/products`        | List all active products with prices             |
| GET    | `/products/:id`    | Get a single product with prices                 |
| POST   | `/checkout`        | Create a Stripe embedded checkout session        |
| GET    | `/checkout/status` | Get checkout session status (`?session_id=…`)    |
| POST   | `/webhook`         | Stripe webhook — triggers Gelato fulfillment     |

#### Deploying

```bash
deno task deploy:storefront-api
```

This bundles `scripts/storefront-api/main.ts` to `dist/storefront-api.js` using
esbuild (marking the Bunny SDK as external since it's provided by the runtime),
then uploads it to Bunny via the EdgeScript API.

Requires `BUNNY_API_KEY` and `BUNNY_EDGE_SCRIPT_ID` in `.env`. Find the script
ID in the Bunny dashboard under **Edge Scripting → your script → Settings**.

To bundle without deploying:

```bash
deno task bundle:storefront-api
```

Environment variables for the script itself (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `GELATO_API_KEY`, etc.) must be configured in the
Bunny dashboard under **Edge Scripting → your script → Environment Variables**.

---

## Shared (`shared/`)

Modules imported by both `admin/` and `scripts/` via the `@shared/` import map alias.

| File             | Exports                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `stripe.ts`      | `createStripeClient(apiKey)` — returns a configured Stripe SDK instance |
| `bunny.ts`       | `uploadToBunny(fileData, fileName, config)`, `deleteFromBunny(fileName, config)` |
| `types.ts`       | `Variant`, `VariantDefault` interfaces, `loadDefaultVariants()`, `defaultsToVariants()` |
| `variants.json`  | Default variant template — print sizes, prices (cents), Gelato Product UIDs |

### Variant Template

`shared/variants.json` defines the default print sizes offered for new products:

```json
[
  { "printSize": "8x10",  "defaultPriceInCents": 2500, "gelatoProductUid": "poster_8x10_TODO" },
  { "printSize": "12x18", "defaultPriceInCents": 4500, "gelatoProductUid": "poster_12x18_TODO" },
  { "printSize": "16x24", "defaultPriceInCents": 6500, "gelatoProductUid": "poster_16x24_TODO" }
]
```

Prices are in cents (Stripe convention). Gelato Product UIDs should be replaced with real values from your Gelato account.

---

## Storefront (`storefront/`)

Customer-facing Astro site for browsing and purchasing prints. Consumes products
from the `storefront-api` edge script and images from Bunny CDN.

### Running Locally

```bash
cd storefront
npm install
npm run dev
```

### Building & Deploying

```bash
deno task deploy:storefront
```

This runs `astro build` (outputting to `storefront/dist/`), then uploads every
file in that directory to the root of your Bunny Storage zone. Your Bunny Pull
Zone should point at that storage zone to serve the site.

To build without deploying:

```bash
deno task build:storefront
```

Before deploying, update `storefront/astro.config.mjs` with your actual domain.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```
STRIPE_SECRET_KEY=sk_live_…
BUNNY_STORAGE_ZONE=your-storage-zone
BUNNY_STORAGE_API_KEY=your-storage-api-key
BUNNY_CDN_HOSTNAME=cdn.yourdomain.com
BUNNY_STORAGE_REGION=ny.storage.bunnycdn.com
```

| Variable                | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`     | Stripe secret API key                                                |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (for the `/webhook` edge route)        |
| `BUNNY_STORAGE_ZONE`    | Bunny Storage zone name (also the FTP username)                      |
| `BUNNY_STORAGE_API_KEY` | Bunny Storage API key (FTP password)                                 |
| `BUNNY_CDN_HOSTNAME`    | Hostname of the Bunny Pull Zone (e.g. `cdn.example.com`)             |
| `BUNNY_STORAGE_REGION`  | Storage API endpoint region (e.g. `ny.storage.bunnycdn.com`)         |
| `BUNNY_API_KEY`         | Bunny account-level API key — used only for deploying the edge script |
| `BUNNY_EDGE_SCRIPT_ID`  | Numeric ID of the EdgeScript in the Bunny dashboard                  |
| `GELATO_API_KEY`        | Gelato API key for print fulfillment orders                          |
| `GELATO_TEST_MODE`      | Set to `true` to create Gelato draft orders instead of live orders   |

---

## Prerequisites

- [Deno](https://deno.com) v2+
- A Stripe account with API keys
- A Bunny.net Storage Zone and Pull Zone
- A Gelato account (for print fulfillment Product UIDs)
