# Runtime permanente de Production

El Worker puede responder 405 a GET `/api/admin/anilist` y carecer todavía de bindings Supabase. La limitación del dashboard para añadir variables a un Worker identificado como static assets no se resuelve desde React: la siguiente publicación debe incluir explícitamente los bindings Runtime.

## Cambio único en Cloudflare Builds

En el Worker existente **anime-platform**, configuración de la rama de Production (`main`):

1. Mantener disponibles las variables públicas `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en el job de Builds. Deben ser la URL y la clave `sb_publishable_*` del mismo proyecto usado por Google OAuth/frontend. No introducir valores reales en Git, ejemplos compartidos ni capturas.
2. Cambiar únicamente el **Deploy command de Production** de `npx wrangler deploy` (o equivalente directo) a **`npm run deploy`**.
3. Conservar el Build command actual `npm run build`. `npm run deploy` también compila para preservar su uso local anterior; en Builds habrá una segunda compilación, sin cambios de configuración ni coste adicional de servicios.
4. **No cambiar Preview:** conservar `npm run deploy:preview`, sus variables y su configuración. No cambiar el nombre del Worker, rutas ni dominio público.
5. Cuando se revise y fusione esta corrección personalmente, dejar que el flujo automático de `main` haga la publicación. No ejecutar un despliegue manual para validar esta PR.

Si Production ya tenía `npm run deploy` como comando, no hace falta cambiar el dashboard: la nueva implementación del script entra con el próximo build automático. No usar `production:dry-run` como Deploy command, porque no publica.

## Qué hace el comando

`npm run deploy` compila y ejecuta `scripts/deploy-production.ts`. Este script reutiliza la validación pública existente de Preview y mapea explícitamente:

```text
vars.SUPABASE_URL ← VITE_SUPABASE_URL
vars.SUPABASE_PUBLISHABLE_KEY ← VITE_SUPABASE_PUBLISHABLE_KEY
vars.ANILIST_ENABLED ← "false" (siempre)
```

Las `VITE_*` continúan siendo variables de Build que Vite incrusta en el bundle público. El script proporciona además los bindings Runtime que el Worker lee en `env`. Las variables de Build no se convierten por sí solas en Runtime: el mapeo se realiza de nuevo en **cada publicación**, por lo que no depende de añadir variables manualmente al dashboard. Ante datos ausentes, una URL insegura o una clave que no sea `sb_publishable_*`, el comando falla antes de iniciar Wrangler. No admite service_role, claves `sb_secret_*`, JWT legacy ni overrides de comando/entorno.

La configuración se genera en `work/production-runtime-*`, excluido de Git, con directorio privado y JSON 0600. Se mantienen el nombre del Worker, sus rutas, entrypoint, assets, `/api/*` y demás opciones; solo se añaden los bindings al nivel superior. El bloque `previews` se conserva intacto. Las rutas locales se resuelven a absolutas para que la ubicación temporal no cambie qué archivos se publican. Se ejecuta el Wrangler fijado por `npm ci` mediante **`deploy --config <archivo temporal>`**, sin otro Worker, `--env`, Preview ni cambios de URL.

No se pasan claves en argumentos `--var` ni se imprimen las variables. Se consume stdout/stderr de Wrangler sin retransmitirlo, dado que puede mostrar bindings plaintext. Los logs privados y el JSON temporal se eliminan al terminar, incluso con errores o excepciones. Builds recibe solo éxito o un error genérico. No activar dumps del entorno, `set -x` ni compartir los archivos generados; los valores públicos se mantienen igualmente fuera de Git y de la salida de logs. Los secretos Cloudflare que el job ya recibe se conservan en el entorno sin leerlos ni imprimirlos.

`ANILIST_ENABLED=false` no depende del valor de otra variable del job. Las autorizaciones PostgreSQL, Google OAuth, perfiles, catálogo, RLS y código del Worker no cambian. Configurar Runtime no concede roles ni habilita metadatos.

## Validación sin publicación

```bash
npm ci
npm test
npm run build
npm run production:dry-run
```

El último comando requiere las dos variables públicas `VITE_SUPABASE_*` en el entorno. Para pruebas locales usar valores ficticios o un mecanismo privado de carga; no pegar claves reales en comandos registrados. Igual que Preview, el script no carga `.env.local` automáticamente.

`production:dry-run` utiliza el mismo generador y `wrangler deploy --dry-run --config <temporal>`; nunca ejecuta el deploy normal ni publica. Los tests inyectan un runner simulado para comprobar ambos comandos, permisos del archivo, limpieza y rechazo previo de entradas inválidas. El dry-run real de esta entrega utiliza solo valores ficticios. Las pruebas verifican también la respuesta del Worker con el Runtime generado: admin → 200 `{enabled:false,images:false}`, usuario normal → 403.

## Comprobación tras el build automático de main

Con tu cuenta administradora y el rol existente, abrir la misma URL pública `/admin`. POST `/api/admin/anilist` con `{action:"status"}` debe responder 200 y mostrar «Integración desactivada: pendiente de autorización de AniList». Si devuelve «Administración no configurada», revisar que el job utiliza `npm run deploy` y recibe ambas `VITE_*`, sin volver a un `wrangler deploy` directo. GET seguirá respondiendo 405: es normal y no verifica los bindings.

Comprobar Google OAuth, persistencia de sesión y perfiles. Confirmar que una cuenta normal sigue sin operaciones administrativas y que Preview funciona igual que antes. No compartir Authorization ni tokens en logs. La configuración/resultado remoto queda pendiente de ese build automático y de la prueba personal: esta PR no ejecuta SQL, publica, fusiona ni modifica la PR #5 ya fusionada.

Verificación de esta PR: 42 pruebas unitarias/PostgreSQL aprobadas, build TypeScript/Vite correcto y dry-runs reales de Production y Preview con valores ficticios. Ninguna publicación remota ni SQL ejecutado. Vite mantiene el aviso no bloqueante de tamaño de bundle.
