const base = import.meta.env.PUBLIC_API_BASE_URL;

if (!base) {
  throw new Error("PUBLIC_API_BASE_URL is not set");
}

export const api = {
  products: `${base}/products`,
  product: (id: string) => `${base}/products/${id}`,
  checkout: `${base}/checkout`,
  checkoutStatus: (sessionId: string) =>
    `${base}/checkout/status?session_id=${sessionId}`,
} as const;
