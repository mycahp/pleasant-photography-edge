import type { Context } from "fresh";
import { loadDefaultVariants } from "@shared/types.ts";

export const handler = {
  async GET(_ctx: Context) {
    try {
      const variants = await loadDefaultVariants();
      return new Response(JSON.stringify(variants), {
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      console.error("load-variants error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to load variant defaults" }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  },
};
