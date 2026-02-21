import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface Price {
  id: string;
  unitAmount: number | null;
  currency: string;
  printSize: string | null;
  gelatoProductUid: string | null;
}

interface Product {
  id: string;
  name: string;
  image: string | null;
  imageUrl: string | null;
  prices: Price[];
}

function formatPrice(cents: number | null, currency: string): string {
  if (cents === null) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

interface EditPriceExisting {
  kind: "existing";
  priceId: string;
  printSize: string;
  gelatoProductUid: string;
  unitAmount: number | null;
  currency: string;
  archived: boolean;
}

interface EditPriceNew {
  kind: "new";
  printSize: string;
  gelatoProductUid: string;
  amountInCents: number;
}

type EditPrice = EditPriceExisting | EditPriceNew;

interface EditState {
  productId: string;
  name: string;
  imageUrl: string;
  prices: EditPrice[];
}

export default function ProductList({ refreshKey }: { refreshKey?: number }) {
  const products = useSignal<Product[]>([]);
  const loading = useSignal(true);
  const error = useSignal("");
  const deleting = useSignal<string | null>(null);
  const editing = useSignal<EditState | null>(null);
  const saving = useSignal(false);

  async function fetchProducts() {
    loading.value = true;
    error.value = "";
    try {
      const res = await fetch("/api/products");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load products");
      products.value = json;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Unknown error";
    } finally {
      loading.value = false;
    }
  }

  async function handleDelete(product: Product) {
    if (!confirm(`Delete "${product.name}"? This will archive it in Stripe and remove the image from Bunny.`)) {
      return;
    }
    deleting.value = product.id;
    try {
      const res = await fetch(`/api/products?id=${product.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      products.value = products.value.filter((p) => p.id !== product.id);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Delete failed";
    } finally {
      deleting.value = null;
    }
  }

  function startEdit(product: Product) {
    editing.value = {
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl ?? "",
      prices: product.prices.map((p) => ({
        kind: "existing" as const,
        priceId: p.id,
        printSize: p.printSize ?? "",
        gelatoProductUid: p.gelatoProductUid ?? "",
        unitAmount: p.unitAmount,
        currency: p.currency,
        archived: false,
      })),
    };
  }

  function cancelEdit() {
    editing.value = null;
  }

  function updateEditProduct(field: "name" | "imageUrl", value: string) {
    if (!editing.value) return;
    editing.value = { ...editing.value, [field]: value };
  }

  function updateExistingPrice(index: number, field: "printSize" | "gelatoProductUid", value: string) {
    if (!editing.value) return;
    editing.value = {
      ...editing.value,
      prices: editing.value.prices.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      ),
    };
  }

  function toggleArchive(index: number) {
    if (!editing.value) return;
    const price = editing.value.prices[index];
    if (price.kind !== "existing") return;
    editing.value = {
      ...editing.value,
      prices: editing.value.prices.map((p, i) =>
        i === index && p.kind === "existing"
          ? { ...p, archived: !p.archived }
          : p
      ),
    };
  }

  function updateNewPrice(index: number, field: keyof EditPriceNew, raw: string) {
    if (!editing.value) return;
    editing.value = {
      ...editing.value,
      prices: editing.value.prices.map((p, i) => {
        if (i !== index || p.kind !== "new") return p;
        if (field === "amountInCents") {
          const cents = Math.round(parseFloat(raw) * 100);
          if (isNaN(cents) || cents < 0) return p;
          return { ...p, amountInCents: cents };
        }
        return { ...p, [field]: raw };
      }),
    };
  }

  function addNewPrice() {
    if (!editing.value) return;
    editing.value = {
      ...editing.value,
      prices: [
        ...editing.value.prices,
        { kind: "new" as const, printSize: "", gelatoProductUid: "", amountInCents: 0 },
      ],
    };
  }

  function removeNewPrice(index: number) {
    if (!editing.value) return;
    editing.value = {
      ...editing.value,
      prices: editing.value.prices.filter((_, i) => i !== index),
    };
  }

  async function saveEdit() {
    if (!editing.value) return;
    const product = products.value.find((p) => p.id === editing.value!.productId);
    if (!product) return;

    saving.value = true;
    try {
      const metadataUpdates: { priceId: string; printSize: string; gelatoProductUid: string }[] = [];
      for (const p of editing.value.prices) {
        if (p.kind !== "existing" || p.archived) continue;
        const orig = product.prices.find((op) => op.id === p.priceId);
        if (!orig) continue;
        if ((orig.printSize ?? "") !== p.printSize || (orig.gelatoProductUid ?? "") !== p.gelatoProductUid) {
          metadataUpdates.push({ priceId: p.priceId, printSize: p.printSize, gelatoProductUid: p.gelatoProductUid });
        }
      }

      const archiveIds = editing.value.prices
        .filter((p) => p.kind === "existing" && p.archived)
        .map((p) => (p as EditPriceExisting).priceId);

      const newPrices = editing.value.prices
        .filter((p) => p.kind === "new" && p.printSize.trim())
        .map((p) => {
          const np = p as EditPriceNew;
          return { amountInCents: np.amountInCents, printSize: np.printSize, gelatoProductUid: np.gelatoProductUid };
        });

      const productMeta: Record<string, string> = {};
      if (editing.value.name !== product.name) productMeta.name = editing.value.name;
      if (editing.value.imageUrl !== (product.imageUrl ?? "")) productMeta.imageUrl = editing.value.imageUrl;

      const res = await fetch(`/api/products?id=${product.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          product: Object.keys(productMeta).length ? productMeta : undefined,
          metadataUpdates: metadataUpdates.length ? metadataUpdates : undefined,
          archivePriceIds: archiveIds.length ? archiveIds : undefined,
          newPrices: newPrices.length ? newPrices : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");

      await fetchProducts();
      editing.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Update failed";
    } finally {
      saving.value = false;
    }
  }

  useEffect(() => { fetchProducts(); }, []);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) fetchProducts();
  }, [refreshKey]);

  if (loading.value) {
    return <div class="status loading">Loading products...</div>;
  }

  if (error.value) {
    return (
      <div class="status error">
        {error.value}
        <button type="button" class="btn-link" onClick={fetchProducts}>Retry</button>
      </div>
    );
  }

  if (products.value.length === 0) {
    return <p class="empty-state">No products yet. Upload a photo above to create one.</p>;
  }

  return (
    <div class="product-grid">
      {products.value.map((product) => {
        const isEditing = editing.value?.productId === product.id;

        return (
          <div key={product.id} class="product-card">
            {product.image && (
              <img src={product.image} alt={product.name} class="product-image" />
            )}
            <div class="product-info">
              {isEditing ? (
                <div class="edit-section">
                  <div class="edit-field">
                    <label>Name</label>
                    <input
                      type="text"
                      value={editing.value!.name}
                      onInput={(e) => updateEditProduct("name", (e.target as HTMLInputElement).value)}
                    />
                  </div>
                  <div class="edit-field">
                    <label>Image URL</label>
                    <input
                      type="text"
                      value={editing.value!.imageUrl}
                      placeholder="https://cdn.pleasant.photography/..."
                      onInput={(e) => updateEditProduct("imageUrl", (e.target as HTMLInputElement).value)}
                    />
                  </div>

                  <div class="edit-variants">
                    <div class="variant-header-edit">
                      <span>Size</span>
                      <span>Price</span>
                      <span>Gelato UID</span>
                      <span />
                    </div>
                    {editing.value!.prices.map((ep, i) => {
                      if (ep.kind === "existing") {
                        return (
                          <div key={ep.priceId} class={`variant-row-edit ${ep.archived ? "archived" : ""}`}>
                            <input
                              type="text"
                              value={ep.printSize}
                              disabled={ep.archived}
                              onInput={(e) => updateExistingPrice(i, "printSize", (e.target as HTMLInputElement).value)}
                            />
                            <span class="price-readonly">
                              {formatPrice(ep.unitAmount, ep.currency)}
                            </span>
                            <input
                              type="text"
                              value={ep.gelatoProductUid}
                              disabled={ep.archived}
                              placeholder="poster_..."
                              onInput={(e) => updateExistingPrice(i, "gelatoProductUid", (e.target as HTMLInputElement).value)}
                            />
                            <button
                              type="button"
                              class={ep.archived ? "btn-unarchive" : "btn-archive"}
                              onClick={() => toggleArchive(i)}
                              title={ep.archived ? "Restore" : "Archive"}
                            >
                              {ep.archived ? "↩" : "✕"}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div key={`new-${i}`} class="variant-row-edit variant-row-new">
                          <input
                            type="text"
                            value={ep.printSize}
                            placeholder="8x10"
                            onInput={(e) => updateNewPrice(i, "printSize", (e.target as HTMLInputElement).value)}
                          />
                          <div class="price-input-wrapper">
                            <span class="price-prefix">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={(ep.amountInCents / 100).toFixed(2)}
                              onInput={(e) => updateNewPrice(i, "amountInCents", (e.target as HTMLInputElement).value)}
                              class="price-input"
                            />
                          </div>
                          <input
                            type="text"
                            value={ep.gelatoProductUid}
                            placeholder="poster_..."
                            onInput={(e) => updateNewPrice(i, "gelatoProductUid", (e.target as HTMLInputElement).value)}
                          />
                          <button
                            type="button"
                            class="btn-remove-variant"
                            onClick={() => removeNewPrice(i)}
                            title="Remove"
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })}
                    <button type="button" class="btn-add-variant" onClick={addNewPrice}>
                      + Add Price
                    </button>
                  </div>

                  <div class="product-actions">
                    <button type="button" class="btn-save" disabled={saving.value} onClick={saveEdit}>
                      {saving.value ? "Saving..." : "Save"}
                    </button>
                    <button type="button" class="btn-cancel" onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 class="product-name">{product.name}</h3>
                  <div class="product-prices">
                    {product.prices.map((price) => (
                      <span key={price.id} class="price-tag">
                        {price.printSize ?? "—"}: {formatPrice(price.unitAmount, price.currency)}
                      </span>
                    ))}
                  </div>
                  <div class="product-actions">
                    <button type="button" class="btn-edit" onClick={() => startEdit(product)}>Edit</button>
                    <button
                      type="button"
                      class="btn-delete"
                      disabled={deleting.value === product.id}
                      onClick={() => handleDelete(product)}
                    >
                      {deleting.value === product.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
