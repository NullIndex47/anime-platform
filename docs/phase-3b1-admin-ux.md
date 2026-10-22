# FASE 3B.1 · Un panel cómodo para gestionar YORU

`/admin` y `/admin/animes` abren **Mis animes**. La selección de un anime sustituye la lista por sus temporadas; la selección de una temporada sustituye esas filas por sus episodios. Los breadcrumbs identifican el anime y la temporada, y los botones permiten volver a temporadas o animes. La selección es local: recargar vuelve a Mis animes, como en FASE 3B.

La interfaz conserva el fondo oscuro, verde y ámbar de YORU. El contenido principal usa 16 px, los botones tienen al menos 44 px de altura y las acciones se agrupan con iconos: gestionar, editar y eliminar. Las confirmaciones de borrado siguen indicando las eliminaciones en cascada. Los formularios tienen un espacio separado, con dos columnas en escritorio y una en móvil, y enfocan su primer campo.

La tabla de animes se presenta como tarjetas en móvil, con títulos completos, estado y origen. Las temporadas y episodios tienen tarjetas espaciosas. El estado preparado sigue siendo privado; guardar utiliza los mismos servicios y RPC de FASE 3B.

## AniList

**Importar desde AniList** tiene su propia sección en `/admin/importar`, protegida por la misma comprobación de administrador. Con la integración desactivada aparece **Pendiente de autorización** sin formulario de búsqueda ni campos obligatorios. Ante un fallo al comprobar el proveedor se puede reintentar en esa sección y seguir usando la gestión local. La búsqueda, previsualización e importación existentes se conservan para cuando el propietario autorice la integración. Esta fase no la activa.

## Capturas comparativas

Capturas locales con Supabase simulado, datos de prueba y zoom al 100 %. Las comparativas muestran la misma ficha importada y editada, antes y después del rediseño. No representan una comprobación contra Supabase o Cloudflare remotos.

| Vista | Antes | Después |
| --- | --- | --- |
| Escritorio, 1440 px | [Antes](admin-ux/before-desktop.png) | [Después](admin-ux/after-desktop.png) |
| Móvil, 390 px | [Antes](admin-ux/before-mobile.png) | [Después](admin-ux/after-mobile.png) |

También se incluyen [temporadas en escritorio](admin-ux/seasons-desktop.png), [temporadas en móvil](admin-ux/seasons-mobile.png), [episodios en escritorio](admin-ux/episodes-desktop.png) y [episodios en móvil](admin-ux/episodes-mobile.png), con títulos largos para revisar la adaptación.

## Validación

- `npm test`: **48 pruebas aprobadas**, incluidos servicios y PostgreSQL/PGlite local, conservación de datos, permisos, RLS y bloqueo de publicación.
- `npm run build`: TypeScript y Vite; persiste el aviso no bloqueante del bundle de más de 500 kB.
- `npm run test:e2e -- --workers=2 --timeout=60000`: autenticación, navegación administrativa, CRUD privado, AniList simulado, perfiles y player demo. La ejecución completa inicial terminó con **71 aprobadas, 3 fallidas y 2 omitidas**: dos fallos buscaban el encabezado antiguo y el tercero detectó `white-space: nowrap` heredado con títulos largos. Tras actualizar el encabezado esperado y permitir el ajuste de texto, se repitieron las suites afectadas con `npm run test:e2e -- tests/admin-navigation.spec.ts tests/catalog-admin.spec.ts tests/episode-management.spec.ts --workers=2 --timeout=60000`: **22 aprobadas y 2 omitidas**. Las nuevas pruebas también verifican que el foco permanece en la vista al cerrar formularios y que los botones no se superponen. En conjunto quedan **74 casos frontend validados en ejecuciones separadas**, no una ejecución conjunta nueva de toda la suite.
- Las **2 pruebas omitidas** corresponden al Worker y se ejecutaron después contra Wrangler local: **2 aprobadas**, POST anónimo a `/api/admin/anilist` devuelve HTTP 401 y JSON. Comando: `npm run test:e2e:worker -- tests/catalog-admin.spec.ts --grep 'Worker API rejects anonymous direct imports' --workers=1`, con `XDG_CONFIG_HOME`, `WRANGLER_LOG_PATH` y `WRANGLER_SEND_METRICS=false` fijados solo para ese proceso en `work/`. Total: **76 casos E2E validados en ejecuciones separadas**. No acredita configuración ni operaciones autenticadas remotas.
- Las nuevas comprobaciones responsive recorren 320, 390, 768, 1024 y 1440 px, con títulos largos, formularios, separación de vistas, altura mínima de botones, controles dentro del viewport y ausencia de desbordamiento horizontal.
- `git diff --check` y revisión del alcance: sin cambios en migraciones, tablas, RLS, servicios de catálogo/episodios, Worker ni comandos de despliegue.

## Preview y alcance

Para permitir Google OAuth en el Preview de esta rama, se añade únicamente `https://feat-yoru-admin-ux-improvements-anime-platform.cuentagaming1304.workers.dev` a la lista exacta de orígenes del frontend. Se conservan Production y los Preview anteriores, PKCE y rechazo de dominios similares, HTTP y puertos alternativos. Las pruebas verifican ese origen exacto y su callback.

Si el propietario quiere iniciar sesión en ese Preview, debe añadir manualmente `https://feat-yoru-admin-ux-improvements-anime-platform.cuentagaming1304.workers.dev/auth/callback` a **Supabase → Authentication → URL Configuration → Redirect URLs**, si falta. No cambiar Site URL, usar comodines ni alterar Production. Si Cloudflare genera otro origen, comprobarlo antes de autorizarlo. Esta PR no modifica la configuración remota de OAuth.

Comprobar en Preview con la cuenta administradora: crear/editar un borrador, añadir/editar temporadas y episodios, cancelar/aceptar las confirmaciones, volver entre niveles y recargar para revisar persistencia. Probar escritorio, tablet y móvil con zoom al 100 %. El catálogo público continúa en demo.

No se ejecuta SQL remoto, no se publica contenido y no se despliega Production manualmente. No se añaden dependencias o servicios. La PR se entrega sin fusionar. Para revertir la interfaz basta restaurar el frontend anterior; no hay cambios de esquema ni pasos de recuperación de datos.
