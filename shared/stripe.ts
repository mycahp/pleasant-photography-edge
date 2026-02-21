import Stripe from "stripe";

export function createStripeClient(apiKey: string): Stripe {
  return new Stripe(apiKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export { Stripe };
