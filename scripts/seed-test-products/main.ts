// One-off script to create test-mode Stripe products from the live catalog.
// Images are already on the CDN so no upload needed.
// Run: deno run --allow-net --allow-env --env-file=.env scripts/seed-test-products/main.ts

import { createStripeClient } from "@shared/stripe.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) { console.error(`Missing ${name}`); Deno.exit(1); }
  return value;
}

const stripe = createStripeClient(requireEnv("STRIPE_SECRET_KEY"));

const variants = [
  { printSize: "8x12",  priceInCents: 2500, gelatoProductUid: "fine_arts_poster_geo_simplified_product_12-0_ver_a4-8x12-inch_200-gsm-80lb-enhanced-uncoated" },
  { printSize: "12x18", priceInCents: 3000, gelatoProductUid: "fine_arts_poster_geo_simplified_product_12-0_ver_300x450-mm-12x18-inch_200-gsm-80lb-enhanced-uncoated" },
  { printSize: "16x24", priceInCents: 3500, gelatoProductUid: "fine_arts_poster_geo_simplified_product_12-0_ver_400x600-mm-16x24-inch_200-gsm-80lb-enhanced-uncoated" },
];

const products = [
  { name: "Japanese Temple",   imageUrl: "https://cdn.pleasant.photography/storefront/mpp_japan_temple.jpg",     photoDate: "2026-02-22" },
  { name: "The Next Wave",     imageUrl: "https://cdn.pleasant.photography/storefront/mpp_surfers.jpg",          photoDate: "2026-02-22" },
  { name: "Surveyor",          imageUrl: "https://cdn.pleasant.photography/storefront/mpp_surveyor.jpg",         photoDate: "2026-02-22" },
  { name: "Fishing at Fuji",   imageUrl: "https://cdn.pleasant.photography/storefront/mpp_fuji.jpg",            photoDate: "2026-02-22" },
  { name: "Buddha of Kamakura",imageUrl: "https://cdn.pleasant.photography/storefront/mpp_kamakura_buddah.jpg", photoDate: "2026-02-22" },
  { name: "Baby Blue",         imageUrl: "https://cdn.pleasant.photography/storefront/mpp_baby_blue.jpg",        photoDate: "2026-02-22" },
];

for (const p of products) {
  console.log(`Creating: ${p.name}`);
  const product = await stripe.products.create({
    name: p.name,
    images: [p.imageUrl],
    metadata: { image_url: p.imageUrl, photo_date: p.photoDate },
  });

  for (const v of variants) {
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: v.priceInCents,
      currency: "usd",
      metadata: { print_size: v.printSize, gelato_product_uid: v.gelatoProductUid },
    });
    console.log(`  ${v.printSize} → ${price.id}`);
  }
}

console.log("\nDone.");
