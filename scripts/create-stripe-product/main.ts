import { parseArgs } from "@std/cli/parse-args";
import { loadDefaultVariants, defaultsToVariants } from "@shared/types.ts";
import { createStripeClient, Stripe } from "@shared/stripe.ts";
import { uploadToBunny, type BunnyConfig } from "@shared/bunny.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Error: ${name} environment variable is not set`);
    Deno.exit(1);
  }
  return value;
}

const stripe = createStripeClient(requireEnv("STRIPE_SECRET_KEY"));

const bunnyConfig: BunnyConfig = {
  storageZone: requireEnv("BUNNY_STORAGE_ZONE"),
  storageApiKey: requireEnv("BUNNY_STORAGE_API_KEY"),
  cdnHostname: requireEnv("BUNNY_CDN_HOSTNAME"),
  storageRegion: Deno.env.get("BUNNY_STORAGE_REGION"),
};

const args = parseArgs(Deno.args, {
  string: ["name"],
});

const filePath = String(args._[0] || "");

if (!args.name || !filePath) {
  console.error(
    "Usage: deno run --allow-net --allow-read --env-file=.env scripts/create-stripe-product/main.ts --name <name> <file>",
  );
  Deno.exit(1);
}

try {
  const variants = defaultsToVariants(await loadDefaultVariants());

  console.log(`Uploading ${filePath} to Bunny...`);
  const fileData = await Deno.readFile(filePath);
  const fileName = filePath.split("/").pop()!;
  const cdnUrl = await uploadToBunny(fileData, fileName, bunnyConfig);
  console.log(`  Uploaded: ${cdnUrl}`);

  console.log(`Creating Stripe product: ${args.name}`);
  const product = await stripe.products.create({
    name: args.name,
    images: [cdnUrl],
    metadata: { image_url: cdnUrl },
  });
  console.log(`  Product created: ${product.id}`);

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

    console.log(
      `  Price created: ${price.id} (${variant.printSize} - $${(variant.priceInCents / 100).toFixed(2)})`,
    );
  }

  console.log("\nDone.");
} catch (err) {
  if (err instanceof Stripe.errors.StripeConnectionError) {
    console.error("Failed to connect to Stripe:", err.message);
    Deno.exit(1);
  }
  if (err instanceof Stripe.errors.StripeAuthenticationError) {
    console.error("Stripe authentication failed:", err.message);
    Deno.exit(1);
  }
  if (err instanceof Stripe.errors.StripeAPIError) {
    console.error("Stripe API error:", err.message);
    Deno.exit(1);
  }
  console.error("Unexpected error:", err);
  Deno.exit(1);
}
