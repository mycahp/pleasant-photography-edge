import type { Context } from "fresh";
import { createStripeClient, Stripe } from "@shared/stripe.ts";
import { deleteFromBunny } from "@shared/bunny.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const handler = {
  async GET(_ctx: Context<unknown>) {
    try {
      const stripe = createStripeClient(requireEnv("STRIPE_SECRET_KEY"));

      const products = await stripe.products.list({
        active: true,
        limit: 100,
        expand: ["data.default_price"],
      });

      const results = await Promise.all(
        products.data.map(async (product) => {
          const prices = await stripe.prices.list({
            product: product.id,
            active: true,
          });

          return {
            id: product.id,
            name: product.name,
            image: product.images[0] ?? null,
            imageUrl: product.metadata.image_url ?? null,
            photoDate: product.metadata.photo_date ?? null,
            prices: prices.data.map((p) => ({
              id: p.id,
              unitAmount: p.unit_amount,
              currency: p.currency,
              printSize: p.metadata.print_size ?? null,
              gelatoProductUid: p.metadata.gelato_product_uid ?? null,
            })),
          };
        }),
      );

      results.sort((a, b) => {
        const da = a.photoDate ?? "";
        const db = b.photoDate ?? "";
        if (da && db) return db.localeCompare(da);
        if (da) return -1;
        if (db) return 1;
        return 0;
      });

      return jsonResponse(results);
    } catch (err) {
      console.error("list-products error:", err);
      const message = err instanceof Error ? err.message : "Internal server error";
      return jsonResponse({ error: message }, 500);
    }
  },

  async DELETE(ctx: Context<unknown>) {
    try {
      const url = new URL(ctx.req.url);
      const productId = url.searchParams.get("id");

      if (!productId) {
        return jsonResponse({ error: "Missing product id" }, 400);
      }

      const stripe = createStripeClient(requireEnv("STRIPE_SECRET_KEY"));
      const bunnyConfig = {
        storageZone: requireEnv("BUNNY_STORAGE_ZONE"),
        storageApiKey: requireEnv("BUNNY_STORAGE_API_KEY"),
        cdnHostname: requireEnv("BUNNY_CDN_HOSTNAME"),
        storageRegion: Deno.env.get("BUNNY_STORAGE_REGION"),
      };

      const product = await stripe.products.retrieve(productId);

      const prices = await stripe.prices.list({
        product: productId,
        active: true,
      });

      for (const price of prices.data) {
        await stripe.prices.update(price.id, { active: false });
      }

      await stripe.products.update(productId, { active: false });

      const imageUrl = product.metadata.image_url;
      if (imageUrl) {
        try {
          const fileName = new URL(imageUrl).pathname.replace(/^\//, "");
          await deleteFromBunny(fileName, bunnyConfig);
        } catch (bunnyErr) {
          console.error("Bunny delete failed (product already archived):", bunnyErr);
        }
      }

      return jsonResponse({ deleted: productId });
    } catch (err) {
      console.error("delete-product error:", err);
      const message = err instanceof Stripe.errors.StripeInvalidRequestError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Internal server error";
      return jsonResponse({ error: message }, 500);
    }
  },

  async PATCH(ctx: Context<unknown>) {
    try {
      const body = await ctx.req.json() as {
        productId: string;
        product?: {
          name?: string;
          imageUrl?: string;
          photoDate?: string;
        };
        metadataUpdates?: {
          priceId: string;
          printSize: string;
          gelatoProductUid: string;
        }[];
        archivePriceIds?: string[];
        newPrices?: {
          amountInCents: number;
          printSize: string;
          gelatoProductUid: string;
        }[];
      };

      if (!body.productId) {
        return jsonResponse({ error: "Missing productId" }, 400);
      }

      const stripe = createStripeClient(requireEnv("STRIPE_SECRET_KEY"));

      if (body.product) {
        const updateFields: Record<string, unknown> = {};
        const metadataUpdates: Record<string, string> = {};
        if (body.product.name) updateFields.name = body.product.name;
        if (body.product.imageUrl !== undefined) {
          updateFields.images = body.product.imageUrl ? [body.product.imageUrl] : [];
          metadataUpdates.image_url = body.product.imageUrl;
        }
        if (body.product.photoDate !== undefined) {
          metadataUpdates.photo_date = body.product.photoDate;
        }
        if (Object.keys(metadataUpdates).length) {
          updateFields.metadata = metadataUpdates;
        }
        if (Object.keys(updateFields).length) {
          await stripe.products.update(body.productId, updateFields);
        }
      }

      if (body.metadataUpdates) {
        for (const update of body.metadataUpdates) {
          await stripe.prices.update(update.priceId, {
            metadata: {
              print_size: update.printSize,
              gelato_product_uid: update.gelatoProductUid,
            },
          });
        }
      }

      if (body.archivePriceIds) {
        for (const priceId of body.archivePriceIds) {
          await stripe.prices.update(priceId, { active: false });
        }
      }

      const createdPriceIds: string[] = [];
      if (body.newPrices) {
        for (const np of body.newPrices) {
          const price = await stripe.prices.create({
            product: body.productId,
            unit_amount: np.amountInCents,
            currency: "usd",
            metadata: {
              print_size: np.printSize,
              gelato_product_uid: np.gelatoProductUid,
            },
          });
          createdPriceIds.push(price.id);
        }
      }

      return jsonResponse({ productId: body.productId, createdPriceIds });
    } catch (err) {
      console.error("update-product error:", err);
      const message = err instanceof Error ? err.message : "Internal server error";
      return jsonResponse({ error: message }, 500);
    }
  },
};
