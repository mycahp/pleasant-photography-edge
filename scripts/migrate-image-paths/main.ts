import { createStripeClient } from "@shared/stripe.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Error: ${name} environment variable is not set`);
    Deno.exit(1);
  }
  return value;
}

function fixUrl(url: string): string {
  return url.replace(/\/storefront\/(?!products\/)/, "/storefront/products/");
}

const stripe = createStripeClient(requireEnv("STRIPE_SECRET_KEY"));

let updated = 0;
let skipped = 0;

for await (const product of stripe.products.list({ limit: 100, active: true })) {
  const { web_url, print_url, image_url } = product.metadata;

  const urlsToFix = { web_url, print_url, image_url };
  const updates: Record<string, string> = {};

  for (const [key, val] of Object.entries(urlsToFix)) {
    if (!val) continue;
    const fixed = fixUrl(val);
    if (fixed !== val) updates[key] = fixed;
  }

  if (Object.keys(updates).length === 0) {
    console.log(`${product.id} (${product.name}): already correct, skipping`);
    skipped++;
    continue;
  }

  await stripe.products.update(product.id, { metadata: updates });
  console.log(`${product.id} (${product.name}): updated`, updates);
  updated++;
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
