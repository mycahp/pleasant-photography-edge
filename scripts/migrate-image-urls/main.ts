import { createStripeClient, Stripe } from "@shared/stripe.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Error: ${name} environment variable is not set`);
    Deno.exit(1);
  }
  return value;
}

const stripe = createStripeClient(requireEnv("STRIPE_SECRET_KEY"));

let updated = 0;
let skipped = 0;

for await (const product of stripe.products.list({ limit: 100, active: true })) {
  const imageUrl = product.metadata.image_url;

  if (!imageUrl) {
    console.log(`${product.id} (${product.name}): no image_url, skipping`);
    skipped++;
    continue;
  }

  if (product.metadata.print_url) {
    console.log(`${product.id} (${product.name}): already has print_url, skipping`);
    skipped++;
    continue;
  }

  const baseUrl = imageUrl.split("?")[0];
  await stripe.products.update(product.id, {
    metadata: {
      web_url: baseUrl,
      print_url: `${baseUrl}?noOptimization=true`,
    },
  });

  console.log(`${product.id} (${product.name}): updated`);
  updated++;
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
