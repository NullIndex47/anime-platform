import { useEffect, useState } from "react";
import { requireClient } from "../auth/session";
import {
  loadPersistentCatalog,
  type PublicFilters,
  type PublicAnime,
} from "../services/persistent-catalog";

export function usePublicCatalog(filters: PublicFilters, page = 0) {
  const key = JSON.stringify([filters, page]);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    key: string;
    items: PublicAnime[];
    hasMore: boolean;
    loading: boolean;
    error: string;
  }>({ key: "", items: [], hasMore: false, loading: true, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, items: [], hasMore: false, loading: true, error: "" });
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() =>
          loadPersistentCatalog(
            requireClient(),
            filters,
            page,
            AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          ),
        )
        .then((result) => {
          if (!controller.signal.aborted)
            setState({ key, ...result, loading: false, error: "" });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setState({
              key,
              items: [],
              hasMore: false,
              loading: false,
              error:
                "No se pudo cargar el catálogo. Comprueba la conexión o reintenta.",
            });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, retry]);
  // Never render a previous route/filter result while a new request starts.
  return {
    ...(state.key === key
      ? state
      : { items: [], hasMore: false, loading: true, error: "" }),
    retry: () => setRetry((v) => v + 1),
  };
}
