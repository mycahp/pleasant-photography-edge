// scripts/storefront-api/main.ts
import * as BunnySDK from "@bunny.net/edgescript-sdk";
import process from "node:process";
var STRIPE_API = "https://api.stripe.com/v1";
var GELATO_API = "https://order.gelatoapis.com/v4";
function stripeHeaders() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
}
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}
function json(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin)
    }
  });
}
async function stripeGet(path, params) {
  const url = new URL(`${STRIPE_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { headers: stripeHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stripe ${path} failed (${res.status}): ${body}`);
  }
  return await res.json();
}
async function stripePost(path, body) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: stripeHeaders(),
    body: body.toString()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe POST ${path} failed (${res.status}): ${text}`);
  }
  return await res.json();
}
async function getProducts() {
  const products = await stripeGet("/products", {
    active: "true",
    limit: "100"
  });
  const catalog = await Promise.all(
    products.data.map(async (product) => {
      const prices = await stripeGet("/prices", {
        product: product.id,
        active: "true",
        limit: "100"
      });
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        imageUrl: product.metadata.image_url ?? product.images[0] ?? null,
        photoDate: product.metadata.photo_date ?? null,
        prices: prices.data.map((p) => ({
          id: p.id,
          unitAmount: p.unit_amount,
          currency: p.currency,
          printSize: p.metadata.print_size ?? null
        }))
      };
    })
  );
  catalog.sort((a, b) => {
    const da = a.photoDate ?? "";
    const db = b.photoDate ?? "";
    if (da && db) return db.localeCompare(da);
    if (da) return -1;
    if (db) return 1;
    return 0;
  });
  return catalog;
}
async function getProduct(productId) {
  const product = await stripeGet(`/products/${productId}`);
  if (!product.id) {
    return null;
  }
  const prices = await stripeGet("/prices", {
    product: product.id,
    active: "true",
    limit: "100"
  });
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.metadata.image_url ?? product.images[0] ?? null,
    photoDate: product.metadata.photo_date ?? null,
    prices: prices.data.map((p) => ({
      id: p.id,
      unitAmount: p.unit_amount,
      currency: p.currency,
      printSize: p.metadata.print_size ?? null
    }))
  };
}
async function createCheckoutSession(items, returnUrl) {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("ui_mode", "embedded");
  params.set("return_url", returnUrl);
  for (let i = 0; i < items.length; i++) {
    params.set(`line_items[${i}][price]`, items[i].priceId);
    params.set(`line_items[${i}][quantity]`, String(items[i].quantity));
  }
  return await stripePost(
    "/checkout/sessions",
    params
  );
}
async function getSessionStatus(sessionId) {
  return await stripeGet(`/checkout/sessions/${sessionId}`);
}
async function verifyStripeSignature(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  const parts = signatureHeader.split(",").reduce((acc, pair) => {
    const [key2, value] = pair.split("=");
    acc[key2.trim()] = value;
    return acc;
  }, {});
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;
  const maxAge = 5 * 60;
  if (Math.abs(Date.now() / 1e3 - Number(timestamp)) > maxAge) return false;
  const payload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return expected === signature;
}
async function getSessionLineItems(sessionId) {
  const result = await stripeGet(
    `/checkout/sessions/${sessionId}/line_items`,
    { "expand[]": "data.price.product" }
  );
  return result.data;
}
async function createGelatoOrder(session, lineItems) {
  const gelatoKey = process.env.GELATO_API_KEY;
  if (!gelatoKey) throw new Error("GELATO_API_KEY is not set");
  const isTest = process.env.GELATO_TEST_MODE === "true";
  const items = lineItems.map((li) => {
    const product = li.price.product;
    const imageUrl = product.metadata.image_url ?? product.images[0] ?? "";
    const gelatoProductUid = li.price.metadata.gelato_product_uid ?? "";
    return {
      itemReferenceId: li.id,
      productUid: gelatoProductUid,
      quantity: li.quantity,
      files: [
        {
          type: "default",
          url: imageUrl
        }
      ]
    };
  });
  const addr = session.customer_details.address;
  const order = {
    orderType: isTest ? "draft" : "order",
    orderReferenceId: session.id,
    customerReferenceId: session.customer_details.email,
    currency: "USD",
    items,
    shipmentMethodUid: "standard",
    shippingAddress: {
      firstName: session.customer_details.name.split(" ")[0] ?? "",
      lastName: session.customer_details.name.split(" ").slice(1).join(" ") ?? "",
      email: session.customer_details.email,
      addressLine1: addr.line1,
      addressLine2: addr.line2 ?? "",
      city: addr.city,
      state: addr.state,
      postCode: addr.postal_code,
      country: addr.country
    }
  };
  const res = await fetch(`${GELATO_API}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": gelatoKey
    },
    body: JSON.stringify(order)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gelato order failed (${res.status}): ${text}`);
  }
  return await res.json();
}
async function handleWebhook(rawBody, event) {
  if (event.type !== "checkout.session.completed") return;
  const session = event.data;
  const checkoutSession = session.object;
  console.log(`Checkout completed: ${checkoutSession.id}`);
  const lineItems = await getSessionLineItems(checkoutSession.id);
  const gelatoOrder = await createGelatoOrder(checkoutSession, lineItems);
  console.log("Gelato order created:", JSON.stringify(gelatoOrder));
}
BunnySDK.net.http.serve(async (request) => {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  try {
    if (request.method === "GET") {
      if (url.pathname === "/products") {
        const catalog = await getProducts();
        return json(catalog, 200, origin);
      }
      const productMatch = url.pathname.match(/^\/products\/([a-zA-Z0-9_]+)$/);
      if (productMatch) {
        const product = await getProduct(productMatch[1]);
        if (!product) {
          return json({ error: "Product not found" }, 404, origin);
        }
        return json(product, 200, origin);
      }
      if (url.pathname === "/checkout/status") {
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) {
          return json({ error: "Missing session_id" }, 400, origin);
        }
        const session = await getSessionStatus(sessionId);
        return json(session, 200, origin);
      }
    }
    if (request.method === "POST") {
      if (url.pathname === "/checkout") {
        const body = await request.json();
        if (!body.items?.length) {
          return json({ error: "Cart is empty" }, 400, origin);
        }
        if (!body.returnUrl) {
          return json({ error: "Missing returnUrl" }, 400, origin);
        }
        for (const item of body.items) {
          if (!item.priceId || !item.quantity || item.quantity < 1) {
            return json({ error: "Invalid cart item" }, 400, origin);
          }
        }
        const session = await createCheckoutSession(body.items, body.returnUrl);
        return json({ clientSecret: session.client_secret }, 200, origin);
      }
      if (url.pathname === "/contact") {
        const body = await request.json();
        if (body.website) {
          return json({ success: true }, 200, origin);
        }
        const { name, email, message, turnstileToken } = body;
        if (!name?.trim() || !email?.trim() || !message?.trim() || !turnstileToken) {
          return json({ error: "Missing required fields" }, 400, origin);
        }
        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
        if (!turnstileSecret) throw new Error("TURNSTILE_SECRET_KEY is not set");
        const tvRes = await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ secret: turnstileSecret, response: turnstileToken })
          }
        );
        const tvData = await tvRes.json();
        if (!tvData.success) {
          return json({ error: "CAPTCHA verification failed" }, 400, origin);
        }
        const resendKey = process.env.RESEND_API_KEY;
        const resendFrom = process.env.RESEND_FROM ?? "onboarding@resend.dev";
        const contactEmail = process.env.CONTACT_EMAIL;
        if (!resendKey || !contactEmail) throw new Error("RESEND_API_KEY or CONTACT_EMAIL is not set");
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`
          },
          body: JSON.stringify({
            from: resendFrom,
            to: contactEmail,
            reply_to: email,
            subject: `Contact from ${name}`,
            text: `Name: ${name}
Email: ${email}

Message:
${message}`
          })
        });
        if (!emailRes.ok) {
          const text = await emailRes.text();
          throw new Error(`Email send failed (${emailRes.status}): ${text}`);
        }
        return json({ success: true }, 200, origin);
      }
      if (url.pathname === "/webhook") {
        const sigHeader = request.headers.get("Stripe-Signature");
        if (!sigHeader) {
          return json({ error: "Missing signature" }, 400);
        }
        const rawBody = await request.text();
        const valid = await verifyStripeSignature(rawBody, sigHeader);
        if (!valid) {
          return json({ error: "Invalid signature" }, 401);
        }
        const event = JSON.parse(rawBody);
        await handleWebhook(rawBody, event);
        return json({ received: true });
      }
    }
    return json({ error: "Not found" }, 404, origin);
  } catch (err) {
    console.error("storefront-api error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return json({ error: message }, 500, origin);
  }
});
