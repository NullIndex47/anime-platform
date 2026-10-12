# FASE 3A · catálogo persistente y administración segura

## Entrega y límites

La rama `feat/yoru-phase-3a-anime-catalog` parte de `main` con 2A y 2B. Solo se añade `supabase/migrations/20261012010000_anime_catalog.sql`; las migraciones anteriores se mantienen intactas. No hay ejecución remota de SQL, fusión ni despliegue manual.

`/admin` y `/admin/animes` requieren pertenencia comprobada en PostgreSQL. Búsqueda explícita (8 resultados, sin paginación de AniList), previsualización, importación individual como borrador, edición local y eliminación. La importación del Worker recibe únicamente el ID y recupera la ficha; no acepta datos de publicación del cliente. Todos los campos ausentes quedan desconocidos/null, incluidos episodios totales. La sinopsis se presenta como texto, nunca como HTML. No se solicitan ni almacenan listas de usuarios, personajes, relaciones, vídeos o enlaces externos.

Las tablas separan `catalog_anime`, `catalog_origins`, `catalog_publication` y una estructura futura `catalog_episodes` vacía. No existe operación de publicación ni de creación de episodios en 3A. Una consulta pública requiere estado publicado y al menos un episodio con fecha pasada, disponible, autorizado y referencia de reproducción. El número total de episodios de AniList no acredita disponibilidad. Retirar el último episodio disponible oculta inmediatamente la ficha, incluso por REST directo. Tampoco se exponen públicamente imágenes de origen en esta fase.

El catálogo y reproductor actuales permanecen como demo identificada. `/demo/admin` es la antigua maqueta pública, con fixtures exclusivamente ficticias y acciones deshabilitadas. `persistent-catalog.ts` prepara consultas paginadas y filtros de los datos reales, sin mezclarlos con fixtures ni recurrir a la demo ante un fallo. La adopción en las páginas públicas y la reproducción persistente quedan para una fase con episodios autorizados. No conectar IDs reales al reproductor demo.

## Revisión oficial de AniList · 12 de octubre de 2026

Fuentes oficiales:

- [Condiciones API](https://docs.anilist.co/guide/terms-of-use), también [fuente mantenida por AniList](https://github.com/AniList/docs/blob/master/docs/guide/terms-of-use.md).
- [Límites](https://docs.anilist.co/guide/rate-limiting), también [fuente oficial](https://github.com/AniList/docs/blob/master/docs/guide/rate-limiting.md).
- [Disponibilidad y consideraciones](https://docs.anilist.co/guide/considerations).
- [Condiciones generales](https://anilist.co/terms).

Las condiciones API prohíben acumular datos masivamente, utilizar el servicio como respaldo/almacenamiento y usarlo en servicios competidores no complementarios, incluidos trackers. El uso no comercial es gratuito; el umbral comercial publicado es 150 USD mensuales y por encima exige licencia. Ser gratuito no exime las demás restricciones. La nomenclatura también está regulada.

**Decisión para YORU:** no dar por autorizado el catálogo persistente ni las funciones de seguimiento de la plataforma. El propietario debe consultar a `contact@anilist.co` sobre el caso concreto, retención selectiva, posibles funciones competidoras y uso de portadas/banners. No se ha enviado ningún mensaje. Conservar una referencia escrita a la autorización antes de habilitar la integración. La interfaz y los SQL permanecen preparados, pero las dos barreras de activación están cerradas.

Los endpoints de documentación y condiciones generales devolvieron 403 durante la revisión; se leyeron directamente las fuentes Markdown del repositorio oficial de AniList para las condiciones API y límites, además de contrastar los resultados indexados oficiales. No se verificó una licencia general de reutilización de imágenes: ni recibir una URL por GraphQL ni atribuirla acredita derechos sobre el arte. El uso de portadas/banners requiere aclaración independiente, también de sus titulares cuando corresponda. Hasta entonces `images_allowed=false`: no se retornan, guardan ni solicitan sus imágenes desde el navegador. Si se autoriza, solo se usan las URLs HTTPS del CDN de AniList, sin descarga, espejo ni rehosting; confirmar que ese hotlinking concreto está permitido. La ficha administrativa identifica AniList y enlaza al título original; esta atribución es una medida propia, no una afirmación de que satisfaga una licencia desconocida.

La documentación anuncia 90 solicitudes/minuto normalmente y **30/minuto durante degradación**, además de un límite de ráfagas. YORU reserva en PostgreSQL un máximo de 20/minuto y separa las llamadas 3 segundos, compartido entre isolates y administradores del proyecto. Se aplican `Retry-After`, `X-RateLimit-Reset` y agotamiento de `X-RateLimit-Remaining`. Las otras aplicaciones que compartan IP de salida pueden consumir límites de AniList: los 429 siguen siendo posibles. No se hacen peticiones de prueba reales a AniList en la suite.

Caché de metadatos en memoria: 5 minutos, máximo 100 búsquedas/fichas por isolate, sin almacenamiento persistente de resultados de búsqueda. Se comprueban autorización y permisos antes de cada acceso, incluidos hits. No hay sincronización, tareas programadas, scraping, crawler, importación por lotes ni navegación de páginas de AniList. Los reintentos son explícitos por el usuario; los 429 bloquean temporalmente los controles. No hay bucles de reintento automáticos que multipliquen el tráfico. Cambiar permisos impide nuevos accesos/importaciones; la limpieza de borradores ya importados y los permisos de retención tras revocación deben revisarse con el proveedor.

## 1. Aplicar únicamente el nuevo SQL, personalmente

Revisar y ejecutar **una sola vez**, mediante SQL Editor de Supabase como propietario:

`supabase/migrations/20261012010000_anime_catalog.sql`

Requiere el esquema habitual de Supabase (`auth.users`, `auth.uid()`, roles `anon` y `authenticated`), y las fases previas ya aplicadas. No repetir ni editar sus migraciones. La nueva migración es transaccional y no altera perfiles ni moderación. No añadir `yoru_private` a los esquemas expuestos por PostgREST.

Comprobar RLS habilitada y forzada en las cuatro tablas públicas. No otorgar DML ni nuevas políticas amplias a `anon`/`authenticated`. El diseño usa RPC de escritura con `SECURITY DEFINER`, `search_path=''`, nombres cualificados y comprobación interna del administrador. Las tablas públicas son de lectura por RLS; ni siquiera el administrador puede saltarse las operaciones revisadas con un INSERT/PATCH directo. Los permisos SQL y RLS también protegen peticiones que ignoren React.

## 2. Conceder el administrador de forma controlada

Primero inicia sesión normalmente con Google y completa tu perfil. Copia el UUID de tu cuenta desde Authentication → Users. Verifica que sea tu cuenta y no un ID proporcionado por otra persona. Sustituye el marcador UUID antes de ejecutar como propietario:

```sql
-- Solo SQL Editor del propietario; no ejecutar desde el cliente.
insert into yoru_private.administrators(user_id)
values ('UUID_REAL_DE_TU_CUENTA'::uuid)
on conflict (user_id) do nothing;

-- Comprobar concesión sin publicar datos privados.
select user_id, granted_at from yoru_private.administrators;
```

Revocación:

```sql
delete from yoru_private.administrators
where user_id = 'UUID_REAL_DE_TU_CUENTA'::uuid;
```

Los cambios tienen efecto en las siguientes operaciones, con la misma sesión. Un username `admin`, datos de perfil, `user_metadata`, localStorage o JWT inventado no conceden este rol. No hay endpoint de alta de administradores, trigger de autoasignación ni interfaz para conceder roles. Borrar una cuenta Auth elimina su membresía por FK. No conceder acceso a la tabla privada a usuarios ni exponer su esquema.

## 3. Variables y entorno local/Cloudflare

Frontend, durante la compilación Vite (las existentes):

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Worker, bindings independientes en Cloudflare (no `VITE_*`):

```dotenv
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
ANILIST_ENABLED=false
```

No se necesita service_role, secretos Google, token AniList ni claves privadas. El Worker propaga la sesión del usuario a PostgREST; Supabase valida el JWT y la función consulta membresía privada. No se confía en claims de rol editables. `/api/*` pasa siempre por el Worker y no por el fallback SPA. No hay CORS abierto ni autorización por cookies de este endpoint.

Para Wrangler local, copia `.dev.vars.example` a `.dev.vars` (excluido de Git) y sustituye únicamente valores públicos. Configura `.env.local` para Vite. Instalar y probar:

```bash
npm ci
npm test
npm run build
npm run test:e2e
npm run test:e2e:worker
# Validación local, sin publicar:
npx wrangler deploy --dry-run --outdir work/wrangler-dry-run
# Web + API local, puerto permitido para OAuth:
npx wrangler dev --local --port 5173
```

Vite puede utilizar la API mediante proxy `/api` a Wrangler en 8787, pero para una prueba completa se recomienda usar solo Wrangler en 5173. No se ejecutan migraciones ni se despliega desde las pruebas. Las pruebas de navegador usan Supabase y AniList simulados; las pruebas RLS ejecutan la migración contra PostgreSQL real en WASM (PGlite), sin conectarse a tu Supabase. No equivalen a una comprobación del proveedor ni de tu configuración remota.

En Workers Builds conservar la compilación y configurar también estos bindings de runtime para producción/Preview cuando se decida desplegar mediante el flujo habitual. No se configura despliegue automático nuevo ni se publica manualmente desde esta PR. Antes de subir la rama, revisar si el repositorio tiene automatización externa de Preview.

Para OAuth de esta rama, autorizar exactamente en Supabase Redirect URLs:

`https://feat-yoru-phase-3a-anime-catalog-anime-platform.cuentagaming1304.workers.dev/auth/callback`

La allowlist del cliente añade ese origen concreto y conserva los anteriores. Verificar la URL real de Preview; si Cloudflare usa otra, revisar y añadir el origen exacto en ambos lugares, sin comodines. No cambiar el callback Google → Supabase ni desactivar proveedores existentes.

## 4. Activación de AniList, solo después de resolver sus permisos

No activar con una declaración propia de cumplimiento. Guardar la respuesta/autorización y revisar que cubra YORU, retención selectiva y funciones competidoras. Entonces, personalmente como propietario:

```sql
update yoru_private.provider_permissions
set metadata_allowed = true,
    images_allowed = false,
    authorization_reference = 'REFERENCIA_REAL_A_LA_AUTORIZACION_REVISADA'
where provider = 'anilist';
```

Solo si el uso de imágenes está también resuelto, cambiar `images_allowed=true`. Mantenerlo falso si solo se autorizaron metadatos. Activar además `ANILIST_ENABLED=true` en el binding del Worker correspondiente. La base de datos bloquea importaciones directas mientras `metadata_allowed=false`, incluso si alguien modifica el bundle. No hay botón administrativo para cambiar estos permisos. No activar publicación de títulos.

Para cerrar la integración: `ANILIST_ENABLED=false` y, como propietario, `update yoru_private.provider_permissions set images_allowed=false, metadata_allowed=false where provider='anilist';`. La segunda barrera bloquea también RPC directos. Eliminar referencias ya importadas solo después de revisar obligaciones de conservación/borrado con el proveedor.

## 5. Prueba personal del proyecto real

1. Sin sesión, visitar `/admin`: debe mostrar acceso restringido. Navegar el catálogo demo y reproducir el clip original.
2. Con una cuenta normal, aunque `user_metadata.role='admin'`, comprobar acceso restringido. Probar RPC de importación/edición/borrado directamente y esperar 403/SQLSTATE 42501; el nombre del usuario no es un permiso.
3. Con tu membresía concedida, entrar en `/admin/animes`. Antes de autorización, la búsqueda debe estar deshabilitada y no debe salir ninguna solicitud a AniList.
4. Tras autorización y configuración doble, buscar un título, previsualizar, importar **uno** y confirmar `draft`, procedencia AniList y cero filas de episodios. Intentar importar de nuevo: 409 por duplicado y ninguna ficha huérfana.
5. Editar título/sinopsis/otros campos y recargar. La edición no modifica ID externo ni publicación. Eliminar un borrador elegido y confirmar borrado en cascada de su origen/estado.
6. Con cuenta normal y clave pública, intentar REST INSERT/PATCH/DELETE sobre las cuatro tablas: denegado. Intentar seleccionar borradores: sin filas. Insertar/publicar episodios por REST también debe denegarse, incluso como admin.
7. Con tu sesión, intentar cambiar `yoru_private.administrators`, el permiso del proveedor o una función: denegado/no expuesto. Revocar tu membresía mediante SQL del propietario y repetir las RPC con el token anterior: deben denegarse inmediatamente.
8. La ficha importada no debe aparecer en búsqueda pública, inicio ni URL `/anime/UUID`. No inventar episodios para probar publicación remota. Los casos de publicación y retirada están cubiertos localmente con fixtures de prueba.
9. Simular desconexión en DevTools y usar reintento. Probar resultados vacíos y 429 con mocks/localmente; no saturar AniList para provocar límites. Comprobar loading, espera y ausencia de importaciones repetidas automáticas.
10. Verificar Google OAuth, sesión persistente, perfiles, username único y moderación con usuarios reales. Las pruebas locales no acreditan la configuración remota.

Para peticiones directas, desde DevTools con tu sesión actual (no copiar tokens a issues/logs):

```js
// Usar el SDK existente desde el código de prueba local o la pestaña Network.
await supabase.rpc('yoru_is_admin');
await supabase.rpc('yoru_import_anilist', {
  p_external_id: 1, p_metadata: { title: 'Prueba de acceso rechazada', genres: [] },
  p_cover: null, p_banner: null
}); // Con cuenta normal debe ser 403; no concede permisos por el payload.
await supabase.from('catalog_publication').update({state:'published'})
  .eq('anime_id', 'UUID_DE_UN_BORRADOR'); // Denegado incluso para admin.
```

`supabase` no se publica como variable global de producción; estas llamadas son ejemplos para una prueba local usando `src/auth/session.ts`. Alternativamente repetir las solicitudes REST de Network con el token de una cuenta normal. No compartir Authorization, cookies ni tokens.

## Presupuesto y pendientes

Sin dependencias de pago, KV, Durable Objects, colas ni cron. Se utilizan Workers y Supabase existentes, sujetos a sus cuotas gratuitas; la función de presupuesto genera una pequeña operación DB por llamada externa. Catálogo admin limitado a 100 fichas recientes y búsqueda AniList a 8 resultados; paginación administrativa se deja para cuando haga falta.

Pendientes externos: autorización AniList/imagen, aplicación personal del SQL, concesión de admin, bindings y prueba real. Pendientes de producto: ingestión legal de episodios, publicación controlada, reproductor persistente y adopción del catálogo real en páginas públicas. La seguridad del rol y el catálogo de borradores sí están implementados; activar metadatos no habilita esos módulos futuros.

## Verificación realizada en esta entrega

- 38 pruebas unitarias/PostgreSQL aprobadas, incluidos RLS real, denegación directa de RPC/DML, revocación, duplicados y reserva concurrente del límite.
- 56 E2E originales con Vite aprobadas en escritorio/móvil: administración, Google OAuth y los tres Preview, perfiles, moderación y reproductor.
- 66 E2E con Wrangler local aprobadas en escritorio/móvil, incluyendo importación anónima por HTTP rechazada con 401 JSON, sin fallback SPA.
- Ocho E2E adicionales de navegación con Vite aprobadas: espera de permisos, rechazo de usuarios normales/errores, cambios de sesión y respuestas atrasadas.
- TypeScript, compilación y `wrangler deploy --dry-run` correctos. Vite conserva un aviso no bloqueante de tamaño de bundle (>500 kB).
- Migraciones de 2B idénticas a `main`; no se ejecutó SQL remoto ni se desplegó. Los fixtures de pruebas solo existen en pruebas locales.

La verificación acredita la implementación local. Quedan por realizar personalmente las comprobaciones de tu proyecto remoto y la autorización del proveedor descritas arriba.

## Navegación administrativa y configuración de Preview

El menú de usuario de escritorio y la navegación móvil incluyen «Panel de administración» únicamente tras una respuesta booleana `true` de `yoru_is_admin`. Mientras se comprueba, si la RPC falla o si cambia el usuario/token, el enlace permanece oculto. Cerrar sesión descarta la confirmación; respuestas antiguas no pueden habilitar el menú de otra cuenta. La RPC tiene timeout y se cancela al cambiar de sesión. No se usa `user_metadata`, username ni un rol persistido en el navegador. Este estado sirve para navegación; `/admin` vuelve a comprobar permisos y el Worker/RPC/RLS siguen autorizando cada operación.

### Build y Runtime son configuraciones distintas

| Variable | Dónde se configura | Quién la lee |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Workers Builds → Build variables, tanto producción como ramas no productivas | Vite al compilar; termina en el bundle público |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Workers Builds → Build variables | Vite al compilar; clave pública `sb_publishable_*` |
| `SUPABASE_URL` | Production: Settings → Variables & Secrets; Preview: wrapper desde Builds | `env.SUPABASE_URL` en el Worker |
| `SUPABASE_PUBLISHABLE_KEY` | Production: Settings → Variables & Secrets; Preview: wrapper desde Builds | `env.SUPABASE_PUBLISHABLE_KEY` en el Worker |
| `ANILIST_ENABLED` | Configuración Runtime; el repositorio fija `false` | Worker; sigue requiriendo autorización PostgreSQL |

Configurar solo las dos `VITE_*` permite el acceso Google y la RPC del menú, pero no configura `/api/admin/anilist`: una sesión válida obtendrá 503 «Administración no configurada» si faltan sus bindings Runtime. Añadir las dos `SUPABASE_*` como variables de Build tampoco las convierte en bindings Runtime. Usar la misma URL y clave pública para frontend y Worker de cada versión; no mezclar proyectos.

`wrangler.jsonc` activa `keep_vars:true` para conservar las variables Runtime administradas en el dashboard durante las siguientes publicaciones por Wrangler. No crea variables ausentes ni convierte variables de Build. Los nombres `SUPABASE_*` se dejan fuera del repositorio; no se incluyen claves reales ni placeholders que simulen una configuración válida. `ANILIST_ENABLED=false` continúa declarado explícitamente: conservar variables no autoriza al proveedor ni activa AniList. `.dev.vars.example` sirve solo como plantilla local; `.dev.vars` está excluido y no configura Cloudflare remoto.

Para la Preview de esta rama utilizar el procedimiento específico de Runtime Preview descrito abajo. `keep_vars` no sustituye `previews.vars`: las Previews creadas con `wrangler preview` no heredan las variables Runtime de Production.
La revisión aquí cubre el código/configuración del repositorio y el comportamiento local. No hay credenciales ni conexión de administración Cloudflare para leer los bindings de tu dashboard; no se ha verificado ni modificado su configuración remota.

Referencias oficiales: [Workers Builds: variables de compilación](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [Wrangler: `keep_vars` y variables no heredables](https://developers.cloudflare.com/workers/wrangler/configuration/), [URLs de versiones Preview](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/).


## Corrección Runtime para `wrangler preview`

La URL Preview puede servir `/api/*` correctamente y aun así devolver «Administración no configurada»: Production y Preview necesitan sus propios bindings. GET con respuesta 405 solo demuestra que se ejecuta el Worker, no que Supabase esté configurado. Las [condiciones de configuración oficiales de Previews](https://developers.cloudflare.com/workers/previews/configuration/) requieren `previews.vars` para variables; `assets` se mantiene en el nivel superior.

El repositorio declara explícitamente `previews.vars.ANILIST_ENABLED="false"`. `scripts/deploy-preview.ts` lee exclusivamente las dos variables públicas `VITE_SUPABASE_*` del entorno de Builds, valida HTTPS y el prefijo `sb_publishable_*` y genera un JSON temporal con:

```text
previews.vars.SUPABASE_URL ← VITE_SUPABASE_URL
previews.vars.SUPABASE_PUBLISHABLE_KEY ← VITE_SUPABASE_PUBLISHABLE_KEY
previews.vars.ANILIST_ENABLED ← "false" (siempre)
```

No convierte automáticamente cualquier variable de Build: realiza solo ese mapeo explícito para Preview. Ambas capas apuntan al mismo proyecto Supabase, por lo que la sesión del navegador es válida para el Worker. No busca credenciales de Production ni utiliza service_role, claves `sb_secret_*` o JWT legacy. Valores ausentes o inválidos detienen el proceso antes de invocar Wrangler.

### Cambio personal en Cloudflare Builds

En la configuración de ramas no productivas/Preview del Worker `anime-platform`:

- Conservar `npm run build` como Build command.
- Sustituir el comando de publicación Preview `npx wrangler preview` por **`npm run deploy:preview`**.
- Confirmar que ese job tiene disponibles `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`; las variables de Production de Builds pueden tener un ámbito distinto. Usar las mismas que el build de esa Preview.
- **No cambiar el comando de Production** (`npm run deploy` o el ya configurado), sus variables, secretos ni bindings. El script de Preview no se añade a `build` ni a `deploy`.

El wrapper ejecuta el Wrangler instalado por `npm ci`, versión fijada en el lockfile (4.149.0), con `preview --config <archivo temporal>`. Es el mismo comando Wrangler Preview ya utilizado, con su configuración explícita; no usa `versions upload`, `deploy` remoto ni `--env preview`. Dejar que el flujo automático existente de Builds cree la siguiente Preview. No se ha invocado una publicación remota durante esta corrección.

### Manejo de valores y logs

El archivo temporal vive en `work/preview-runtime-*` (excluido de Git), con directorio privado y archivo modo 0600. Se elimina al finalizar, también si Wrangler falla. El JSON conserva la configuración de assets y el Worker; solo añade valores al bloque Preview. Las rutas locales se resuelven a absolutas para que el archivo temporal no cambie el entrypoint ni los assets.

No se pasan claves como argumentos `--var`, no se imprimen las variables ni se guarda un JSON con valores reales en Git. El wrapper consume stdout/stderr de Wrangler sin retransmitirlos porque Wrangler puede mostrar bindings plaintext; sus logs privados temporales se eliminan junto al archivo. Builds recibe solo un mensaje de éxito o un error genérico. Si falla, revisar el estado de autenticación de Cloudflare, las dos variables públicas y la versión de Wrangler, sin activar dumps del entorno, `set -x` ni publicar el archivo generado. Consultar la URL Preview en Cloudflare; el wrapper no reproduce la salida cruda de Wrangler.

Los valores son públicos (ya están en el bundle React), pero se evitan igualmente en Git y logs. Los secretos de autenticación Cloudflare que el job ya recibe se conservan en el entorno, no se leen ni se imprimen. `ANILIST_ENABLED` está fijado a false incluso si el job contiene otra variable con valor true.

### Validación sin desplegar

```bash
npm ci
npm test
npm run build
npm run preview:dry-run
```

Para el último comando hacen falta las dos `VITE_SUPABASE_*` en el entorno del proceso. En local utilizar valores ficticios o un mecanismo de carga privado; no pegar claves reales en comandos que queden registrados. El script no carga `.env.local` automáticamente. `wrangler preview` 4.149.0 no admite `--dry-run`: el modo local genera una proyección de `previews.vars` y ejecuta **solo** `wrangler deploy --dry-run`, sin autenticar ni publicar. Comprueba la compilación y los bindings efectivos; no acredita una conexión remota. La ruta normal está probada para invocar exclusivamente `preview --config`.

Después del próximo build automático, con tu cuenta admin y la migración/rol ya aplicados: abrir `/admin`, comprobar POST `/api/admin/anilist` con `{action:"status"}` → 200 y `{enabled:false,images:false}`. Debe aparecer «Integración desactivada: pendiente de autorización de AniList». Una cuenta normal debe continuar recibiendo 403; sin sesión, 401. Si aparece 503, revisar que Builds usa el nuevo comando y tiene las dos variables públicas en el job de Preview. No basta con configurar las `VITE_*` y continuar ejecutando el comando Preview anterior sin el wrapper.

Las pruebas verifican mapeo de Runtime, rechazo de entradas inválidas, conservación de Production/enrutamiento, comandos exactos, privacidad y limpieza temporal, y respuesta del Worker con autorización admin e integración desactivada. Worker, rutas y SQL no cambian. La comprobación real en Cloudflare queda pendiente del siguiente job automático y de tu cuenta; no se ha ejecutado SQL remoto ni se ha desplegado manualmente.

Verificación de esta corrección: 38 pruebas unitarias/PostgreSQL aprobadas, build TypeScript/Vite correcto y `npm run preview:dry-run` ejecutado con valores ficticios mediante Wrangler real. Producción, Worker y migraciones sin cambios; los 66 E2E anteriores corresponden a la implementación de navegación ya verificada.
