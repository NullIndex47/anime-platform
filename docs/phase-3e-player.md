# FASE 3E · Reproducción y servidores

Ruta pública estable: `/episodio/<UUID>`. La ficha enlaza cada episodio publicado a su reproductor. Cambiar números o títulos no rompe la URL. Se incluyen servidores, navegación anterior/siguiente dentro de la temporada, lista paginada de episodios, errores y estado sin fuentes. No hay ficheros de vídeo en los assets de producción, proxy, descarga ni retransmisión.

## Migración manual después de revisar la PR

Archivo exacto: [`supabase/migrations/20261024220000_episode_sources.sql`](../supabase/migrations/20261024220000_episode_sources.sql).

1. Revisar y respaldar la base de datos. Comprobar que están aplicadas las migraciones previas, incluida `20261023181000_anime_covers.sql`. Probar primero en un proyecto Supabase de staging, con el mismo historial de migraciones y una cuenta administradora de prueba.
2. En Supabase SQL Editor, abrir una consulta nueva, pegar **el archivo completo** y ejecutarlo una sola vez. Incluye `begin`/`commit`, permisos y recarga del esquema de PostgREST. No ejecutar fragmentos sueltos ni editar migraciones anteriores. Si falla, hacer `rollback` en esa sesión y revisar el error antes de reintentar.
3. Registrar su versión en vuestro proceso habitual de migraciones. Esta PR no ejecuta `supabase db push` ni SQL remoto.
4. Probar el frontend de esta rama contra staging. La firma de `yoru_save_episode` cambia y desaparecen columnas antiguas: coordinar el cambio de SQL y aplicación en la futura publicación aprobada. El administrador de la versión 3D no es compatible con la nueva firma. No aplicar esta migración a la base compartida de producción para probar una Preview de rama mientras 3D siga sirviendo su administración.
5. En `/admin`, abrir un episodio existente: revisar las fuentes migradas, sustituir referencias antiguas por URLs compatibles y activarlas solo si se dispone de permiso de uso. Guardar conserva el ID y devuelve el episodio a borrador; volver a publicarlo explícitamente. Publicar también la temporada y la ficha si procede. Nada migrado se activa automáticamente.
6. Comprobar ficha → episodio, recarga directa y cambio de servidor. Retirar la temporada o ficha y confirmar que la URL de episodio ya no muestra contenido.

Comprobaciones de solo lectura en SQL Editor, con el rol de mantenimiento:

```sql
-- Debe coincidir con el número de episodios anteriores, sin borrar IDs ni referencias.
select count(*) from public.catalog_episodes;
select count(*) from yoru_private.episode_legacy_archive;
-- Las referencias heredadas se conservan aquí y sus fuentes empiezan inactivas.
select episode_id, name, active from yoru_private.episode_sources order by episode_id, priority;
-- Solo campos públicos necesarios para reproducir.
select * from public.public_episode_sources limit 20;
select id, playback_available from public.public_anime limit 20;
```

`episode_legacy_archive` conserva las referencias administrativas originales y los valores antiguos para revisión y recuperación manual; no tiene permisos REST ni funciones públicas de lectura. `authorized`, `authorization_reference`, `playback_reference`, `available` y `published_at` se retiran de `catalog_episodes`, RPC, tipos y formularios. Las pruebas de migraciones históricas siguen verificando sus antiguos contratos sin modificar esos archivos SQL.

La migración es transaccional; un fallo revierte la operación completa. Después de aplicarla no se debe desplegar el frontend 3D como rollback aislado: el contrato cambió. Para recuperación, respaldar primero y restaurar conjuntamente aplicación y base, o preparar una migración compensatoria revisada utilizando el archivo privado. No se incluye un rollback destructivo automático.

## Proveedores y seguridad

Lista cerrada y revisable, sin comodines ni HTML introducido por el administrador:

| Tipo | Origen y ruta admitidos |
| --- | --- |
| Iframe | `https://www.youtube-nocookie.com/embed/<ID de 11 caracteres>` |
| Iframe | `https://player.vimeo.com/video/<ID numérico>` |
| HTML5 | `https://media.w3.org/2010/05/<ruta>.mp4` o `.webm` |
| HTML5 | `https://archive.org/download/<ruta>.mp4` o `.webm` |

Se rechazan HTTP, credenciales, puertos explícitos, parámetros, fragmentos, espacios, barras invertidas, codificación porcentual, rutas `..`, otros orígenes y formatos que el vídeo nativo no admite. Un origen permitido no demuestra derechos de reproducción: el administrador debe revisar el permiso del contenido. Las URLs de reproducción activas son necesariamente visibles al espectador; no deben contener secretos ni referencias de licencia.

Para ampliar proveedores: actualizar `playbackProviders` en `src/services/playback.ts`, añadir **otra migración** para `yoru_private.valid_playback_url` y ampliar las pruebas de paridad SQL/TypeScript. Evaluar los permisos mínimos de sandbox que necesita el proveedor; no retirar sus protecciones para saltar restricciones. No se incluye HLS/DASH ni dependencias de reproducción adicionales.

La tabla de fuentes está en `yoru_private`, sin acceso directo para `anon`/`authenticated` y con RLS forzado. Solo los RPC de administración, con comprobación de administrador en PostgreSQL, escriben y devuelven su DTO. El guardado de episodio y hasta 20 fuentes es atómico; valida pertenencia, conserva IDs, reordena y elimina fuentes ausentes. Las vistas públicas proyectan campos explícitos y filtran publicación efectiva de los tres niveles. `playback_available` depende de fuentes activas, sin campos heredados. No hay claves privilegiadas en cliente.

No se monta ningún `video` ni `iframe` antes de pulsar Reproducir. Al cambiar de fuente se desmonta el anterior y se pide reproducir de nuevo; HTML5 pausa, elimina su URL y libera recursos. Al cambiar de episodio se desmonta inmediatamente el reproductor. Los iframes tienen sandbox, pantalla completa y política de referencia; no permiten popups ni navegación de la ventana superior. Sus errores internos no siempre son observables: el selector sigue disponible y el usuario puede cambiar manualmente. Una carga del documento iframe no garantiza que el proveedor permita reproducir el contenido.

## Reportes

Cualquier visitante puede reproducir sin cuenta. Para enviar «Reportar problema» debe iniciar sesión con Google. Se guardan episodio/servidor por relación, motivo cerrado y fecha; no se solicita texto libre ni se almacena IP. Máximo 3 reportes por cuenta cada 10 minutos y uno por fuente cada 24 horas. Un bloqueo transaccional por cuenta impide carreras del límite. No se desactiva automáticamente ninguna fuente.

Dentro del editor de cada episodio, «Reportes de servidores» muestra hasta 100 pendientes y permite marcarlos revisados. La cuenta del reportante y las tablas internas no se exponen al visitante. Los reportes se eliminan al eliminar su fuente o su cuenta; resolverlos conserva las ventanas de limitación. Es una protección básica por cuenta, no un sistema antispam contra múltiples cuentas.

## Validación y límites

```sh
npm ci
npm test
npm run test:e2e -- --workers=2
npm run test:e2e:worker -- tests/player.spec.ts tests/catalog-admin.spec.ts --grep 'Worker API|public detail|three servers|private episode|admin manages|signed-in visitor|long episode' --workers=2
npm run build
```

Resultados locales del 24 de octubre de 2026:

- `npm test`: **51 correctas**.
- Suite completa Vite: **118 correctas**, 2 casos exclusivos de Worker omitidos.
- Selección de reproductor y API con Wrangler local: **14 correctas**, sin omisiones. Incluye reproducción real, entrada/salida de pantalla completa nativa, nombres largos y recarga directa con fallback SPA.
- `npm run build`: correcto; también se recompila al iniciar la suite Worker. Permanece el aviso de tamaño del bundle principal; no se añadieron dependencias de producción.
- Ningún vídeo en `dist/`. Sin cambios en migraciones anteriores, SQL remoto, fusión ni despliegue manual de Production.

Las pruebas SQL usan PostgreSQL local (PGlite), roles reales y el historial completo hasta 3E: conservación de episodios/IDs/referencias, fuentes migradas inactivas, CRUD atómico, rollback ante URL inválida, pertenencia entre episodios, privacidad, publicación/retirada, disponibilidad, límites de reportes y revocación de administrador. No se aplica SQL a Supabase remoto.

Playwright usa un vídeo WebM original de 4 segundos en `tests/fixtures`, fuera de los assets publicados. Verifica cuadros de vídeo y tiempo de reproducción, una/tres fuentes, desmontaje mientras reproduce, iframe, fallo y recuperación, episodio sin fuentes, 404 privado, navegación, recarga, edición/orden/activación/eliminación y anchos 320–1440. Las respuestas de Supabase y proveedores se controlan en el navegador; la autorización y privacidad se verifican además en PostgreSQL. El clip y las respuestas iframe no representan una reproducción remota real del proveedor.

Pendiente manual tras aplicar SQL **en staging**: comprobar las políticas en Supabase hospedado, Google OAuth real y reproducción remota autorizada con cada proveedor (restricciones por dominio, región, cookies, permisos, códec y disponibilidad dependen de él). No se afirma que un iframe permita detectar todos los fallos. La red del entorno de trabajo permite repositorios y paquetes, pero no los dominios de vídeo externos para esta comprobación.

Para una futura Preview con nombre de rama, registrar `https://feat-yoru-phase-3e-player-anime-platform.cuentagaming1304.workers.dev/auth/callback` en Supabase Authentication → URL Configuration → Redirect URLs. Este origen exacto queda admitido y probado en el cliente. No usar comodines. Los bindings públicos de Supabase y los flujos Google existentes se conservan. No se ha fusionado ni desplegado Production manualmente.

Capturas de las pruebas controladas:

- [Reproductor escritorio](player/player-desktop.png)
- [Reproductor móvil](player/player-mobile.png)
- [Fuentes escritorio](player/sources-desktop.png)
- [Fuentes móvil](player/sources-mobile.png)

- [Clip original reproduciéndose en escritorio](player/playing-desktop.png)
- [Clip original reproduciéndose en móvil](player/playing-mobile.png)
