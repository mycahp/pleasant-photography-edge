import { createStripeClient } from "@shared/stripe.ts";

const DESCRIPTION = "200 gsm fine art print. 12-color precision, matte finish, FSC-certified paper.";

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
  if (product.description === DESCRIPTION) {
    console.log(`${product.id} (${product.name}): already set, skipping`);
    skipped++;
    continue;
  }

  await stripe.products.update(product.id, { description: DESCRIPTION });
  console.log(`${product.id} (${product.name}): updated`);
  updated++;
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
