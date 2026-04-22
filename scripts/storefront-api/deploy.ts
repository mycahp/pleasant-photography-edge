// Uploads the bundled edge script to Bunny EdgeScript via the Bunny API.
// Run via: deno task deploy:storefront-api
//
// Required env vars (from .env):
//   BUNNY_API_KEY         — Bunny account-level API key (not the storage key)
//   BUNNY_EDGE_SCRIPT_ID  — numeric script ID from the Bunny EdgeScript dashboard

const scriptId = Deno.env.get("BUNNY_EDGE_SCRIPT_ID")?.trim();
const apiKey = Deno.env.get("BUNNY_API_KEY")?.trim();

if (!scriptId || !apiKey) {
  console.error(
    "Error: BUNNY_API_KEY and BUNNY_EDGE_SCRIPT_ID must be set in .env",
  );
  Deno.exit(1);
}

const bundlePath = new URL("../../dist/storefront-api.js", import.meta.url);
let code: string;
try {
  code = await Deno.readTextFile(bundlePath);
} catch {
  console.error("Bundle not found. Run `deno task bundle:storefront-api` first.");
  Deno.exit(1);
}

const base = `https://api.bunny.net/compute/script/${scriptId}`;
const headers = { AccessKey: apiKey!, "Content-Type": "application/json" };

console.log(`Uploading code to Bunny EdgeScript (script ${scriptId})...`);

const uploadRes = await fetch(`${base}/code`, {
  method: "POST",
  headers,
  body: JSON.stringify({ Code: code }),
});

if (!uploadRes.ok) {
  const body = await uploadRes.text();
  console.error(`Upload failed (${uploadRes.status}): ${body}`);
  Deno.exit(1);
}

console.log("Publishing...");

const publishRes = await fetch(`${base}/publish`, {
  method: "POST",
  headers,
  body: JSON.stringify({}),
});

if (!publishRes.ok) {
  const body = await publishRes.text();
  console.error(`Publish failed (${publishRes.status}): ${body}`);
  Deno.exit(1);
}

console.log("Deployed and published successfully.");
