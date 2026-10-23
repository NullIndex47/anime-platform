import { requireClient } from "../auth/session";
import { CatalogError, databaseError } from "./catalog-admin";
export const COVER_BUCKET = "yoru-covers";
export const MAX_COVER_BYTES = 2 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export async function validateCover(file: File) {
  if (!extensions[file.type] || !file.size || file.size > MAX_COVER_BYTES)
    throw new CatalogError(
      "Selecciona una imagen JPEG, PNG o WebP de hasta 2 MiB.",
    );
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const valid =
    file.type === "image/jpeg"
      ? b[0] === 255 && b[1] === 216 && b[2] === 255
      : file.type === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
        : String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  if (!valid)
    throw new CatalogError(
      "El contenido no corresponde al tipo de imagen indicado.",
    );
  return extensions[file.type];
}
export async function cleanupCovers() {
  const client = requireClient();
  const { data, error } = await client.rpc("yoru_cover_cleanup");
  databaseError(error);
  for (const path of (data || []) as string[]) {
    const result = await client.storage.from(COVER_BUCKET).remove([path]);
    if (result.error)
      throw new CatalogError(
        "Quedan imágenes pendientes de limpieza. Reintenta la limpieza.",
      );
    const forgotten = await client.rpc("yoru_forget_cover", { p_path: path });
    databaseError(forgotten.error);
  }
}
export async function changeCover(
  animeId: string,
  expected: string | null,
  file: File | null,
) {
  const client = requireClient();
  let path: string | null = null;
  if (file) {
    const extension = await validateCover(file);
    const reserved = await client.rpc("yoru_reserve_cover", {
      p_anime_id: animeId,
      p_extension: extension,
    });
    databaseError(reserved.error);
    path = reserved.data;
    if (!path) throw new CatalogError("No se pudo reservar la portada.");
    const upload = await client.storage
      .from(COVER_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
        cacheControl: "60",
      });
    if (upload.error)
      throw new CatalogError(
        "No se pudo subir la portada. Puedes reintentar; la reserva se limpiará después.",
      );
  }
  const saved = await client.rpc("yoru_set_cover", {
    p_anime_id: animeId,
    p_path: path,
    p_expected: expected,
  });
  databaseError(saved.error);
}
