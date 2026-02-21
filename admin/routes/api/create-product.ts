import type { Context } from "fresh";
import { loadDefaultVariants, defaultsToVariants } from "@shared/types.ts";
import type { Variant } from "@shared/types.ts";
import { createStripeClient, Stripe } from "@shared/stripe.ts";
import { uploadToBunny } from "@shared/bunny.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const handler = {
  async POST(ctx: Context) {
    try {
      const formData = await ctx.req.formData();
      const name = formData.get("name") as string;
      const file = formData.get("file") as File;
      const variantsJson = formData.get("variants") as string | null;

      if (!name || !file || file.size === 0) {
        return new Response(
          JSON.stringify({ error: "Missing name or file" }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }

      let variants: Variant[];
      if (variantsJson) {
        const parsed = JSON.parse(variantsJson) as Variant[];
        const defaults = await loadDefaultVariants();
        variants = parsed.map((v) => {
          const def = defaults.find((d) => d.printSize === v.printSize);
          return {
            printSize: v.printSize,
            priceInCents: v.priceInCents,
            gelatoProductUid: def?.gelatoProductUid ?? v.gelatoProductUid,
          };
        });
      } else {
        variants = defaultsToVariants(await loadDefaultVariants());
      }

      const stripe = createStripeClient(requireEnv("STRIPE_SECRET_KEY"));
      const bunnyConfig = {
        storageZone: requireEnv("BUNNY_STORAGE_ZONE"),
        storageApiKey: requireEnv("BUNNY_STORAGE_API_KEY"),
        cdnHostname: requireEnv("BUNNY_CDN_HOSTNAME"),
        storageRegion: Deno.env.get("BUNNY_STORAGE_REGION"),
      };

      const fileData = new Uint8Array(await file.arrayBuffer());
      const cdnUrl = await uploadToBunny(fileData, file.name, bunnyConfig);

      const product = await stripe.products.create({
        name,
        images: [cdnUrl],
        metadata: { image_url: cdnUrl },
      });

      const priceIds: string[] = [];
      for (const variant of variants) {
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: variant.priceInCents,
          currency: "usd",
          metadata: {
            print_size: variant.printSize,
            gelato_product_uid: variant.gelatoProductUid,
          },
        });
        priceIds.push(price.id);
      }

      return new Response(
        JSON.stringify({ productId: product.id, priceIds }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    } catch (err) {
      const message = err instanceof Stripe.errors.StripeConnectionError
        ? "Failed to connect to Stripe"
        : err instanceof Stripe.errors.StripeAuthenticationError
          ? "Stripe authentication failed"
          : err instanceof Error
            ? err.message
            : "Internal server error";

      console.error("create-product error:", err);
      return new Response(
        JSON.stringify({ error: message }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  },
};
