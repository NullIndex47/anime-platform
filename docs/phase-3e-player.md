# FASE 3E · Reproducción y servidores

Ruta pública estable: `/episodio/<UUID>`. La ficha enlaza cada episodio publicado a su reproductor. Cambiar números o títulos no rompe la URL. Se incluyen servidores, navegación anterior/siguiente dentro de la temporada, lista paginada de episodios, errores y estado sin fuentes. No hay ficheros de vídeo en los assets de producción, proxy, descarga ni retransmisión.

## Reproductor y edición

Ver [pulido visual, sesiones de reportes y capturas nuevas](phase-3e-visual-polish.md). Si ya aplicaste la expansión, estas mejoras de interfaz no requieren más SQL.

## Transición compatible con 3D

Seguir la [guía corta de transición](phase-3e-transition.md): usa el Supabase actual, un respaldo restaurado y verificado localmente, un solo SQL de expansión y recuperación volviendo al frontend 3D.

La migración aún no aplicada de esta PR se ha sustituido por una expansión. Conserva todas las columnas, datos y RPC de 3D. Los RPC de 3E son `yoru_save_episode_v2` y `yoru_admin_episodes_v2`; no dependen de campos antiguos. No hay archivo destructivo ni borrado físico en esta fase. La limpieza se pospone a otra migración tras cerrar la ventana de recuperación.

En el editor hay «Probar servidor»: reproduce para la sesión administradora sin guardar, activar ni publicar contenido. Permite validar vídeos propios/autorizados en una ficha de prueba privada dentro del mismo Supabase.

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
npm run test:e2e:worker -- tests/player.spec.ts tests/player-polish.spec.ts tests/transition.spec.ts tests/catalog-admin.spec.ts --grep 'Worker API|public detail|three servers|private episode|admin manages|signed-in|long episode|report session|compact editor|admin report rows|pending session|real 3D bundle' --workers=2
npm run build
```

Resultados locales del 25 de octubre de 2026, con expansión compatible:

- `npm test`: **54 correctas**.
- Suite completa Vite: **136 correctas**, 2 casos exclusivos de Worker omitidos.
- Selección de reproductor y API con Wrangler local: **30 correctas**, sin omisiones. Incluye reproducción real, entrada/salida de pantalla completa nativa, nombres largos y recarga directa con fallback SPA.
- `npm run build`: correcto; también se recompila al iniciar la suite Worker. Permanece el aviso de tamaño del bundle principal; no se añadieron dependencias de producción.
- Ningún vídeo en `dist/`. Sin cambios en migraciones anteriores, SQL remoto, fusión ni despliegue manual de Production.

Las pruebas SQL usan PostgreSQL local (PGlite), roles reales y el historial completo hasta 3E: conservación de episodios/IDs/referencias, fuentes migradas inactivas, CRUD atómico, rollback ante URL inválida, pertenencia entre episodios, privacidad, publicación/retirada, disponibilidad, límites de reportes y revocación de administrador. No se aplica SQL a Supabase remoto.

Playwright usa un vídeo WebM original de 4 segundos en `tests/fixtures`, fuera de los assets publicados. Verifica cuadros de vídeo y tiempo de reproducción, una/tres fuentes, desmontaje mientras reproduce, iframe, fallo y recuperación, episodio sin fuentes, 404 privado, navegación, recarga, edición/orden/activación/eliminación y anchos 320–1440. Las respuestas de Supabase y proveedores se controlan en el navegador; la autorización y privacidad se verifican además en PostgreSQL. El clip y las respuestas iframe no representan una reproducción remota real del proveedor.

Pendiente manual, siguiendo la guía y sin crear otro proyecto: comprobar las políticas en Supabase hospedado, Google OAuth real y reproducción remota autorizada con cada proveedor (restricciones por dominio, región, cookies, permisos, códec y disponibilidad dependen de él). No se afirma que un iframe permita detectar todos los fallos. La red del entorno de trabajo permite repositorios y paquetes, pero no los dominios de vídeo externos para esta comprobación.

Para una futura Preview con nombre de rama, registrar `https://feat-yoru-phase-3e-player-anime-platform.cuentagaming1304.workers.dev/auth/callback` en Supabase Authentication → URL Configuration → Redirect URLs. Este origen exacto queda admitido y probado en el cliente. No usar comodines. Los bindings públicos de Supabase y los flujos Google existentes se conservan. No se ha fusionado ni desplegado Production manualmente.

Capturas de las pruebas controladas:

- [Reproductor escritorio](player/player-desktop.png)
- [Reproductor móvil](player/player-mobile.png)
- [Fuentes escritorio](player/sources-desktop.png)
- [Fuentes móvil](player/sources-mobile.png)

- [Clip original reproduciéndose en escritorio](player/playing-desktop.png)
- [Clip original reproduciéndose en móvil](player/playing-mobile.png)
