export interface CartItem {
  priceId: string;
  productId: string;
  productName: string;
  printSize: string;
  unitAmount: number;
  quantity: number;
}

const KEY = 'ppp_cart';

export function getCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(items: CartItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart:updated', { detail: items }));
}

export function addToCart(item: Omit<CartItem, 'quantity'>): void {
  const cart = getCart();
  const existing = cart.find((i) => i.priceId === item.priceId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...item, quantity: 1 });
  }
  save(cart);
}

export function removeFromCart(priceId: string): void {
  save(getCart().filter((i) => i.priceId !== priceId));
}

export function setQuantity(priceId: string, quantity: number): void {
  const cart = getCart();
  if (quantity <= 0) {
    save(cart.filter((i) => i.priceId !== priceId));
    return;
  }
  const item = cart.find((i) => i.priceId === priceId);
  if (item) {
    item.quantity = quantity;
    save(cart);
  }
}

export function clearCart(): void {
  save([]);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}
