import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface VariantDefault {
  printSize: string;
  defaultPriceInCents: number;
  gelatoProductUid: string;
}

interface VariantInput {
  printSize: string;
  priceInCents: number;
  gelatoProductUid: string;
}

interface Result {
  productId: string;
  priceIds: string[];
}

export default function UploadForm({ onCreated }: { onCreated?: () => void }) {
  const status = useSignal<"idle" | "loading" | "success" | "error">("idle");
  const message = useSignal("");
  const result = useSignal<Result | null>(null);
  const variants = useSignal<VariantInput[]>([]);
  const variantsLoading = useSignal(true);
  const photoDate = useSignal(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    fetch("/api/variants")
      .then((res) => res.json())
      .then((defaults: VariantDefault[]) => {
        variants.value = defaults.map((d) => ({
          printSize: d.printSize,
          priceInCents: d.defaultPriceInCents,
          gelatoProductUid: d.gelatoProductUid,
        }));
      })
      .catch(() => {
        message.value = "Failed to load variant defaults";
      })
      .finally(() => {
        variantsLoading.value = false;
      });
  }, []);

  function updateVariant(index: number, field: keyof VariantInput, raw: string) {
    variants.value = variants.value.map((v, i) => {
      if (i !== index) return v;
      if (field === "priceInCents") {
        const cents = Math.round(parseFloat(raw) * 100);
        if (isNaN(cents) || cents < 0) return v;
        return { ...v, priceInCents: cents };
      }
      return { ...v, [field]: raw };
    });
  }

  function addVariant() {
    variants.value = [
      ...variants.value,
      { printSize: "", priceInCents: 0, gelatoProductUid: "" },
    ];
  }

  function removeVariant(index: number) {
    variants.value = variants.value.filter((_, i) => i !== index);
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    const name = formData.get("name") as string;
    const file = formData.get("file") as File;

    if (!name || !file || file.size === 0) {
      status.value = "error";
      message.value = "Please provide a name and select a file.";
      return;
    }

    const valid = variants.value.filter((v) => v.printSize.trim());
    if (valid.length === 0) {
      status.value = "error";
      message.value = "Add at least one variant with a size name.";
      return;
    }

    status.value = "loading";
    message.value = "Uploading to Bunny and creating Stripe product...";

    try {
      const data = new FormData();
      data.append("name", name);
      data.append("file", file);
      data.append("variants", JSON.stringify(valid));
      data.append("photoDate", photoDate.value);

      const res = await fetch("/api/create-product", {
        method: "POST",
        body: data,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Request failed");
      }

      status.value = "success";
      message.value = `Product created: ${json.productId}`;
      result.value = json;
      form.reset();
      onCreated?.();
    } catch (err) {
      status.value = "error";
      message.value = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label for="name">Product Name</label>
      <input type="text" id="name" name="name" placeholder="Sunset at Big Sur" required />

      <label for="photoDate">Date of Photo</label>
      <input
        type="date"
        id="photoDate"
        name="photoDate"
        value={photoDate.value}
        onInput={(e) => { photoDate.value = (e.target as HTMLInputElement).value; }}
      />

      <label for="file">Photo File</label>
      <input type="file" id="file" name="file" accept="image/*" required />

      {variantsLoading.value ? (
        <p class="empty-state">Loading variants...</p>
      ) : (
        <fieldset class="variant-fieldset">
          <legend>Variants</legend>
          <div class="variant-header">
            <span>Size</span>
            <span>Price</span>
            <span>Gelato UID</span>
            <span />
          </div>
          {variants.value.map((v, i) => (
            <div key={i} class="variant-row-full">
              <input
                type="text"
                value={v.printSize}
                placeholder="8x10"
                onInput={(e) =>
                  updateVariant(i, "printSize", (e.target as HTMLInputElement).value)
                }
                class="variant-size-input"
              />
              <div class="price-input-wrapper">
                <span class="price-prefix">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(v.priceInCents / 100).toFixed(2)}
                  onInput={(e) =>
                    updateVariant(i, "priceInCents", (e.target as HTMLInputElement).value)
                  }
                  class="price-input"
                />
              </div>
              <input
                type="text"
                value={v.gelatoProductUid}
                placeholder="poster_8x10_..."
                onInput={(e) =>
                  updateVariant(i, "gelatoProductUid", (e.target as HTMLInputElement).value)
                }
                class="variant-uid-input"
              />
              <button
                type="button"
                class="btn-remove-variant"
                onClick={() => removeVariant(i)}
                title="Remove variant"
              >
                &times;
              </button>
            </div>
          ))}
          <button type="button" class="btn-add-variant" onClick={addVariant}>
            + Add Variant
          </button>
        </fieldset>
      )}

      <button type="submit" disabled={status.value === "loading" || variantsLoading.value}>
        {status.value === "loading" ? "Creating..." : "Upload & Create Product"}
      </button>

      {status.value !== "idle" && (
        <div class={`status ${status.value}`}>
          {message.value}
          {result.value && (
            <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem" }}>
              <li>Product: {result.value.productId}</li>
              {result.value.priceIds.map((id) => (
                <li key={id}>Price: {id}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
