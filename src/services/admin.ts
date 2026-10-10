import { anime } from "../data/anime";

// Demo-only internal queries; real authorization is deferred to the backend.
export const adminCatalogService = {
  list: () => anime,
  find: (id: string | undefined) => anime.find((item) => item.id === id),
};
