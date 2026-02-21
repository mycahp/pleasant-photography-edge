export interface VariantDefault {
  printSize: string;
  defaultPriceInCents: number;
  gelatoProductUid: string;
}

export interface Variant {
  printSize: string;
  priceInCents: number;
  gelatoProductUid: string;
}

export async function loadDefaultVariants(): Promise<VariantDefault[]> {
  const url = new URL("./variants.json", import.meta.url);
  const text = await Deno.readTextFile(url);
  return JSON.parse(text) as VariantDefault[];
}

export function defaultsToVariants(defaults: VariantDefault[]): Variant[] {
  return defaults.map((d) => ({
    printSize: d.printSize,
    priceInCents: d.defaultPriceInCents,
    gelatoProductUid: d.gelatoProductUid,
  }));
}
