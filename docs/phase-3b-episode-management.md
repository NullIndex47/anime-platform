# FASE 3B · gestión privada de animes, temporadas y episodios

`/admin` permite crear un anime local sin consultar APIs, editarlo, eliminarlo y organizar sus temporadas y episodios. La ficha manual se guarda en `catalog_anime`, con `catalog_publication.state='draft'` y sin `catalog_origins`. El panel conserva la búsqueda de AniList y su aviso de integración desactivada. El catálogo público y el player continúan usando exclusivamente la demo.

## Aplicar la migración manualmente en Supabase

Esta PR no aplica SQL al proyecto remoto ni modifica Production. La nueva interfaz necesita la migración antes de poder guardar temporadas o episodios.

1. Revisar `supabase/migrations/20261012020000_episode_management.sql` y guardar una copia/exportación de los datos actuales con las herramientas disponibles del proyecto. No contratar servicios nuevos.
2. Confirmar en el historial de Supabase que las migraciones anteriores de perfiles, moderación y FASE 3A ya están aplicadas. No reemplazarlas ni repetirlas.
3. En el SQL Editor del proyecto elegido por el propietario, ejecutar **una vez**, completo, el contenido de la nueva migración. Incluye `begin`/`commit`: un error revierte la operación; si la sesión queda en transacción abortada, ejecutar `rollback` antes de investigar/reintentar.
4. Confirmar que existe `catalog_seasons` y que `catalog_episodes` tiene `season_id`, `description` y `authorization_reference`. Cada anime con episodios anteriores debe tener la temporada 1. Se conservan IDs, números, títulos, referencias y campos de publicación anteriores.
5. Confirmar que `metadata_allowed=false` e `images_allowed=false` siguen así en `yoru_private.provider_permissions`. Esta migración no modifica permisos de proveedores ni concede administradores. Mantener el rol administrativo ya concedido por el propietario.
6. Si PostgREST tarda en descubrir los nuevos RPC, recargar su esquema con `notify pgrst, 'reload schema';` en el SQL Editor. El mensaje «Falta aplicar la migración de FASE 3B» también puede indicar una caché de esquema pendiente.

No hacer rollback borrando tablas: perdería temporadas y episodios nuevos. Ante problemas, conservar los datos, volver temporalmente al frontend anterior y preparar una migración correctiva. La interfaz 3A no depende de `season_id`; escrituras externas antiguas de episodios deberán adaptarse al nuevo campo obligatorio. La migración no es idempotente.

## Seguridad y modelo

- Solo la membresía comprobada por `yoru_is_admin()` permite leer el panel y ejecutar sus operaciones. Los RPC `SECURITY DEFINER` comprueban explícitamente el administrador y fijan `search_path=''`; solo `authenticated` tiene permiso para ejecutarlos. El usuario normal tampoco puede usar los RPC directamente.
- Las tablas conservan RLS/FORCE RLS y carecen de permisos de escritura directa para `anon` y `authenticated`, incluido un administrador. El frontend usa exclusivamente la clave pública y el token del usuario; no incorpora `service_role` ni nuevos servicios.
- Temporadas: unicidad `(anime_id,season_number)`. Episodios: unicidad `(season_id,episode_number)` y FK compuesta `(season_id,anime_id)` que impide mezclar animes. Editar/eliminar un episodio exige los tres IDs correctos; no mueve episodios entre temporadas.
- Todos los episodios y temporadas se leen solo por administradores, incluso si un registro anterior tenía campos de publicación. La política de episodios de 3A se restringe para que una consulta REST pública no pueda revelar `playback_reference`. La integración pública y una proyección segura de reproducción se revisarán en 3C. Los campos anteriores se preservan en la migración.
- Crear un episodio usa `available=false` y `published_at=null`. Cada edición vuelve a esos valores privados. No existe RPC para publicar ni se escribe el estado de publicación del anime. Los permisos y los botones no conceden publicación.
- Preparar un episodio requiere una referencia privada de fuente, la referencia de permiso/licencia y una confirmación explícita de autorización. Cambiar la fuente o licencia en el formulario desmarca la confirmación. Las referencias son texto privado: no se abren, no se descargan, no se validan mediante consultas externas y no se convierten en enlaces. La declaración del administrador no sustituye una verificación legal; antes de 3C habrá que revisar la fuente y diseñar la entrega segura.
- Eliminar anime advierte que borra todas sus temporadas/episodios. Eliminar temporada advierte que borra TODOS sus episodios; el RPC exige `p_confirm=true` cuando contiene episodios. La eliminación es en cascada y no se puede deshacer desde el panel.
- `ANILIST_ENABLED=false` sigue fijado en los scripts y configuración existentes. Esta PR no habilita metadatos ni imágenes ni modifica Worker, OAuth, perfiles, administradores, rutas públicas o comandos de despliegue. La única ampliación de OAuth es el origen exacto del nuevo Preview; no cambia el flujo PKCE ni la configuración remota.

## Comprobar Cloudflare Preview

1. Revisar la PR y dejar que el flujo existente construya su Preview, con `npm run deploy:preview` y los bindings públicos ya configurados. No cambiar el comando `npm run deploy` de Production.
2. Abrir la URL de Preview de esta rama en ordenador y móvil. El frontend añade únicamente el origen HTTPS exacto de esta rama a su lista de callbacks permitidos, conservando los anteriores. Si aún no está en Authentication → URL Configuration de Supabase, el propietario debe añadir manualmente `https://feat-yoru-phase-3b-episode-management-anime-platform.cuentagaming1304.workers.dev/auth/callback` a Redirect URLs, sin comodines amplios ni cambiar Site URL/Production. Acceder con Google y la cuenta administradora. Si Cloudflare proporciona una URL distinta, contrastarla y actualizar explícitamente ambas listas antes de iniciar OAuth.
3. En `/admin`, crear un anime local con título y campos opcionales. Recargar: debe persistir como «Borrador» y origen «Local».
4. Abrir «Temporadas y episodios», crear temporadas 1 y 2, editar nombres/números y comprobar el orden numérico. Crear un episodio 1 en cada una; repetirlo en la misma temporada debe dar un error comprensible.
5. Editar un episodio, añadir descripción y, únicamente si se dispone de derechos, su fuente y referencia de licencia; confirmar autorización. Debe indicar «Preparado · privado», nunca publicado. En Supabase comprobar `available=false`, `published_at=null` y que la publicación del anime sigue en `draft`.
6. Recargar y comprobar datos. Cancelar una eliminación para comprobar la confirmación; después eliminar un episodio y una temporada con episodios. Comprobar que no afecta a otro anime.
7. Con cuenta normal y sin sesión, `/admin` debe restringir el acceso. Consultas REST públicas a temporadas/episodios y borradores deben devolver cero filas; llamadas RPC de gestión deben ser denegadas. Nunca compartir tokens en capturas/logs.
8. Comprobar que AniList muestra «Integración desactivada», que no se consulta su API y que búsqueda, fichas y player públicos siguen en demo. Verificar Google OAuth, perfil y navegación existentes.

El Preview necesita el esquema 3B en el proyecto Supabase al que apunta. Si comparte base de datos con Production, aplicar la migración afecta a ese esquema compartido aunque el frontend público permanezca demo: la decisión y aplicación manual corresponden al propietario. No se ha probado contra Supabase remoto ni Cloudflare remoto desde esta entrega.

## Pruebas locales

```bash
npm ci
npm test
npm run build
npm run test:e2e
```

`episode-management-db.test.ts` ejecuta las migraciones reales en PostgreSQL local mediante PGlite: preservación de filas/referencias previas, CRUD, aislamiento de animes, duplicados, RLS/FORCE RLS, privilegios de tablas/RPC, acceso anónimo/normal/admin, revocación, fuentes pendientes y bloqueo de publicación. Las pruebas de navegador usan Supabase simulado para verificar formularios, persistencia tras recarga, errores, confirmaciones, preparación privada y layout responsive. Estas pruebas no acreditan la configuración del proyecto remoto; los pasos anteriores completan esa comprobación manual.

Coste: no se añaden servicios, vídeos, APIs, almacenamiento ni planes de pago.
