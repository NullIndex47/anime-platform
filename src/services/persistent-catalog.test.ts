import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyFilters,
  loadPersistentCatalog,
  loadPublicAnime,
  parsePublicFilters,
  publicColumns,
  PAGE_SIZE,
} from "./persistent-catalog";
test("public query is bounded, server filtered, and does not request private rows", async () => {
  const calls: unknown[] = [];
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      return {
        select: (columns: string) => {
          assert.equal(columns, publicColumns);
          return {
            abortSignal: async () => ({
              data: Array.from({ length: 25 }, (_, i) => ({ id: String(i) })),
              error: null,
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  const result = await loadPersistentCatalog(
    client,
    { ...emptyFilters, query: "aoi", genre: "Adventure" },
    2,
  );
  assert.equal(result.items.length, PAGE_SIZE);
  assert.equal(result.hasMore, true);
  assert.deepEqual(calls, [
    [
      "yoru_search_anime",
      {
        p_query: "aoi",
        p_genre: "Adventure",
        p_year: null,
        p_format: "",
        p_status: "",
        p_sort: "recent",
        p_offset: 48,
        p_limit: 25,
      },
    ],
  ]);
  assert.doesNotMatch(
    publicColumns,
    /reference|created_at|updated_at|origin|publication|catalog_episodes/,
  );
  await assert.rejects(loadPersistentCatalog(client, emptyFilters, -1));
});
test("public failures never fall back to demo and invalid UUIDs never query", async () => {
  const client = {
    rpc: () => ({
      select: () => ({
        abortSignal: async () => ({ data: null, error: { code: "offline" } }),
      }),
    }),
  } as unknown as SupabaseClient;
  await assert.rejects(loadPersistentCatalog(client), /No se pudo cargar/);
  assert.equal(
    await loadPublicAnime({} as SupabaseClient, "el-viaje-de-aoi"),
    null,
  );
});
test("URL filters preserve navigation and accept legacy emission links", () => {
  assert.deepEqual(
    parsePublicFilters(
      new URLSearchParams("status=En+emisi%C3%B3n&year=bad&sort=bad"),
    ),
    { ...emptyFilters, status: "RELEASING" },
  );
  assert.equal(
    parsePublicFilters(new URLSearchParams("q=" + "x".repeat(200))).query
      .length,
    100,
  );
});
