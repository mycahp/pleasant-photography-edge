import { createStripeClient } from "@shared/stripe.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Error: ${name} environment variable is not set`);
    Deno.exit(1);
  }
  return value;
}

const stripe = createStripeClient(requireEnv("STRIPE_SECRET_KEY"));

const rate = await stripe.shippingRates.create({
  display_name: "Standard Shipping",
  type: "fixed_amount",
  fixed_amount: { amount: 700, currency: "usd" },
  delivery_estimate: {
    minimum: { unit: "business_day", value: 5 },
    maximum: { unit: "business_day", value: 10 },
  },
});

console.log(`Shipping rate created: ${rate.id}`);
console.log(`Add to .env: STRIPE_SHIPPING_RATE_ID=${rate.id}`);
