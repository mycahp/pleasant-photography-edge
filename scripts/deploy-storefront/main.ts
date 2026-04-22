// Builds and deploys the Astro storefront to Bunny CDN Storage.
// Run via: deno task deploy:storefront:test or deno task deploy:storefront:prod
//
// Required env vars (from .env / .env.prod):
//   BUNNY_SITE_STORAGE_ZONE     — Bunny Storage zone name for the website
//   BUNNY_SITE_STORAGE_API_KEY  — API key for the site storage zone
//   BUNNY_SITE_STORAGE_REGION   — e.g. ny.storage.bunnycdn.com
//
// Files are uploaded to the root of the storage zone. The pull zone should
// point directly at this zone with index document set to index.html.

import { walk } from "jsr:@std/fs/walk";
import { relative } from "jsr:@std/path";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Error: ${name} environment variable is not set`);
    Deno.exit(1);
  }
  return value;
}

const storageZone = requireEnv("BUNNY_SITE_STORAGE_ZONE");
const apiKey = requireEnv("BUNNY_SITE_STORAGE_API_KEY");
const region = Deno.env.get("BUNNY_SITE_STORAGE_REGION") || "storage.bunnycdn.com";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

function contentType(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

async function uploadFile(localPath: string, remotePath: string): Promise<void> {
  const data = await Deno.readFile(localPath);
  const url = `https://${region}/${storageZone}/${remotePath}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: apiKey,
      "Content-Type": contentType(localPath),
    },
    body: data,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed for ${remotePath} (${res.status}): ${body}`);
  }
}

const distDir = new URL("../../storefront/dist", import.meta.url);

let uploaded = 0;
let failed = 0;

console.log(`Deploying storefront/dist → Bunny Storage (${storageZone})...\n`);

for await (const entry of walk(distDir, { includeDirs: false })) {
  const remotePath = relative(distDir.pathname, entry.path);
  try {
    await uploadFile(entry.path, remotePath);
    console.log(`  ✓ ${remotePath}`);
    uploaded++;
  } catch (err) {
    console.error(`  ✗ ${remotePath}: ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

console.log(`\n${uploaded} uploaded, ${failed} failed.`);
if (failed > 0) Deno.exit(1);
