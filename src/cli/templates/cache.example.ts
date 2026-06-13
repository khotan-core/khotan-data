import { cache } from "./cache";

export const cin7ProductsSnapshotCache = cache({
  name: "cin7-products-snapshot",
  scope: {
    plug: "cin7",
    resource: "products",
    flow: "cin7-to-pollinate-products-relay",
  },
  ttl: "6h",
});
