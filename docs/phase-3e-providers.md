# FASE 3E · Proveedores de reproducción

Trabajo en la rama `feat/yoru-phase-3e-player` y PR #11. Revisión ampliada el **25 de octubre de 2026**. Sin SQL remoto, fusión ni despliegue de Production.

## Estado actual

| Proveedor | Estado en YORU | Alcance |
| --- | --- | --- |
| YouTube | Disponible, conservado | `https://www.youtube-nocookie.com/embed/<11 caracteres>`. [Privacidad mejorada](https://support.google.com/youtube/answer/171780). |
| Vimeo | Disponible, conservado | `https://player.vimeo.com/video/<número>`. [Documentación](https://developer.vimeo.com/player/sdk/basics). |
| HTML5 | Disponible, conservado | MP4/WebM autorizado en `media.w3.org/2010/05/` y `archive.org/download/`. Mismos orígenes y formatos. |
| Uqload | Disponible con formato restringido, conservado | Solo la URL completa de «Embed Code» descrita debajo. Su reproducción externa real sigue sin certificarse desde este entorno. |
| Streamtape | **Desactivado** | Enlaces e IDs conservados. Sin reproducción pública, prueba privada ni nuevas activaciones. |
| Netu | **Pendiente** | Existe un iframe alternativo documentado; faltan confirmar su vigencia y probarlo con contenido autorizado bajo sandbox. |
| StreamWish | **Pendiente** | Falta un contrato actual verificable de dominio y URL de inserción, y una prueba autorizada bajo sandbox. |
| EarnVids | **Pendiente** | Falta confirmar el origen y formato actuales de iframe, y una prueba autorizada bajo sandbox. |

«Disponible» indica que la aplicación reconoce el formato y permite montarlo bajo el aislamiento de YORU; no garantiza que cualquier contenido remoto reproduzca. **No se ha habilitado ninguno de los tres pendientes en esta revisión.** No se inventan patrones, se ejecutan sus cargadores ni se aceptan dominios arbitrarios.

En Uqload se mantiene exactamente la variante completa observada en el campo de inserción del origen oficial:

```text
https://uqload.vc/e/<12 minúsculas o dígitos>?strm<N>.uqload.vc/i/<2 dígitos>/<5 dígitos>/<12 minúsculas o dígitos>
```

El [sitio oficial](https://uqload.vc/) indica dónde obtener el código; su [API](https://uqload.vc/api.html) describe la gestión del servicio. No se permiten query libre, `autoplay`, `redirect`, fragmentos, otros dominios, rutas `embed-…html` ni enlaces públicos `…html`. No se altera su parámetro ni se amplían sus permisos.

## Investigación de los pendientes

Fuentes primarias consultadas mediante navegación web; esta lectura **no equivale a cargar ni reproducir sus iframes**. No se reprodujeron vídeos comerciales indexados ni se incorporaron sus enlaces, títulos o códigos al catálogo o pruebas.

### Netu

- Se revisaron el [sitio de Netu](https://netu.ac/) y su [documentación de API](https://netu.ac/view_page.php?pid=10).
- La API publica dos opciones: `embed_code`, que incluye un cargador JavaScript, y `embed_code_non_secured`, que muestra un iframe con origen `https://baiduccdn.com` y ruta `/player/embed_player.php`, con parámetros `vid` y `autoplay=no`.
- El formato alternativo sí tiene evidencia primaria. Su nombre no demuestra por sí solo una vulnerabilidad. Sin embargo, no se pudo abrir su origen con la herramienta de investigación ni confirmar que siga siendo el iframe vigente para una cuenta actual. La documentación no establece los permisos mínimos de sandbox.
- **Falta:** URL de iframe emitida actualmente para un vídeo propio/autorizado, confirmación del servicio sobre el dominio/ruta y reproducción con `allow-scripts allow-same-origin`, fullscreen/PiP, sin popups ni navegación superior. No basta reutilizar el ID ficticio de la documentación.
- No se ejecuta JavaScript del proveedor dentro de YORU ni se copian los ejemplos de API que deshabilitan la verificación TLS. No se incorpora una integración cuyo funcionamiento seguro todavía no se ha verificado.

### StreamWish

- Se revisaron el [sitio](https://streamwish.com/), la [API](https://streamwish.com/api.html), su variante en [api.streamwish.com](https://api.streamwish.com/api.html) y las [FAQ](https://streamwish.com/faq).
- Las páginas consultadas aparecen también con la marca StreamHG. Se contrastaron el [sitio de StreamHG](https://streamhg.com/), su [API](https://streamhg.com/api.html) y [FAQ](https://streamhg.com/faq). Esta observación no autoriza todos sus dominios como orígenes de vídeo.
- La documentación accesible describe gestión, enlaces de archivos y enlaces directos; no establece un formato actual de iframe ni conversiones seguras desde un enlace público. Los ejemplos genéricos de otros hosts de la API no constituyen una lista de orígenes oficiales de inserción.
- Las FAQ prohíben hotlinking. No se usa la API de enlaces directos como sustituto del iframe, ni se solicitan claves o se extraen manifiestos.
- **Falta:** URL oficial de inserción emitida por la cuenta para un vídeo autorizado, confirmación del dominio y formato vigentes y prueba en el sandbox actual. No se asumen `/e/<ID>`, `/embed/<ID>` ni espejos encontrados en listas de terceros.

### EarnVids

- Se revisaron el [sitio](https://earnvids.com/), las [FAQ](https://earnvids.com/faq), la [API del dominio principal](https://earnvids.com/api.html) y la [documentación enlazada en earnvidsapi.com](https://earnvidsapi.com/api.html).
- Documentan archivos, subidas y acceso directo, pero no un contrato de URL de iframe. Los campos genéricos de enlaces de la API y los dominios alternativos observados en páginas indexadas de desarrollo no prueban un origen actual estable de reproducción.
- Las FAQ prohíben hotlinking. El acceso directo por API requiere credenciales y parámetros adicionales; no se implementa como atajo al reproductor oficial.
- **Falta:** iframe emitido actualmente para contenido autorizado, evidencia del servicio sobre su origen/ruta y una comprobación de reproducción con los permisos restringidos de YORU. No se inventa una conversión desde `/file/…` a `/embed/…`.

Para cerrar cada pendiente se necesita esa evidencia, acceso de red permitido al reproductor/CDN y pruebas reales en escritorio/móvil. Si exige popups, navegación superior, insertar JS en YORU o mecanismos incompatibles con el sandbox, permanecerá pendiente. No se ha demostrado que los tres sean incompatibles: **su compatibilidad aún no está verificada**.

## Streamtape desactivado y conservación de datos

La [cuenta de Streamtape en WJunction](https://www.wjunction.com/threads/streamtape-com-new-partner-program-rates-reliable-and-profitable-1080p-api-subtitles-anti-adblock-fast-support.245974/) relacionó el mensaje «Client blocked!» con atributos sandbox (respuesta #18, 20 de abril de 2020). No especifica qué permisos resolverían el caso actual. La [API accesible del espejo del servicio](https://strtape.tech/api) describe `/e/<ID>` y control mediante Player.js, sin garantizar una integración anti-popups. No se afirma que añadir un permiso concreto lo solucione.

La investigación anterior recibió un enlace de prueba autorizado, que supera la validación de formato, pero su conexión desde el ejecutor fue rechazada por el proxy antes de llegar al proveedor (CONNECT 403). Eso **no reproduce** el error de Streamtape. No se desactiva el sandbox ni se intenta eludir ninguna restricción para investigarlo.

Comportamiento actual:

- El selector presenta **Streamtape · Desactivado** y no permite elegirlo para un servidor nuevo. Pegar un enlace suyo lo reconoce, lo conserva como inactivo y deshabilita la activación y la prueba privada.
- Los registros existentes conservan ID, URL, nombre, prioridad y marca `active`, sin cambios automáticos. El editor muestra **Proveedor desactivado** incluso si la marca histórica era activa. Se pueden renombrar, reordenar, guardar sin cambios, sustituir por otro proveedor, desmarcar o eliminar explícitamente como antes.
- La marca activa anterior no habilita reproducción. Si se desmarca, no puede volver a activarse mientras el proveedor siga desactivado. Cambiar su URL no permite conservar una nueva fuente activa de ese proveedor.
- La validación del formulario reconoce una fuente activa anterior por su ID/tipo/URL sin modificar, usando la instantánea cargada del editor. La base de datos comprueba de nuevo el registro real; el cliente no puede autorizar una activación por sí mismo.
- El reproductor público filtra proveedores desactivados incluso ante una respuesta antigua de la API. El componente iframe y la prueba privada también rechazan su montaje. Un episodio con solo Streamtape muestra el estado no disponible y mantiene la navegación.
- Con el SQL nuevo, `public_episode_sources` deja de devolver Streamtape y `public_episodes.playback_available` lo excluye. `public_anime` hereda esa disponibilidad. Los demás servidores, las condiciones de publicación y la revisión de reportes existentes se conservan.

El formato canónico reconocido sigue siendo `https://streamtape.com/e/<ID alfanumérico>`. La conversión local documentada de `/v/<ID>` (opcionalmente un nombre ASCII) a `/e/<ID>` se conserva solo para almacenar/editar enlaces inactivos. No hay consultas de red ni conversiones nuevas. No se aceptan parámetros ni dominios espejo.

## SQL manual, incremental y separado

La migración **nueva de esta revisión** es:

[`20261025233000_playback_provider_status.sql`](../supabase/migrations/20261025233000_playback_provider_status.sql).

1. Revisar la PR #11 y las migraciones ya aplicadas en el proyecto correcto. `20261024220000_episode_sources.sql` está aplicada y **no debe repetirse**.
2. Si todavía no se aplicó [`20261025230000_playback_providers.sql`](../supabase/migrations/20261025230000_playback_providers.sql), revisarla y ejecutarla completa primero. Si ya está aplicada, omitirla. Este archivo anterior permanece intacto.
3. Ejecutar manualmente el archivo nuevo `20261025233000_playback_provider_status.sql` **completo**, incluidos `begin` y `commit`. No está diseñado para volver a ejecutarse sobre sí mismo.
4. Si falla, ejecutar `rollback` en esa sesión y revisar el error antes de continuar. Ninguna instrucción del repositorio se conecta ni aplica este SQL remotamente.
5. En Preview, revisar un registro Streamtape existente, guardar sin alterar su enlace y verificar que se conservan sus datos. Comprobar que no se ofrece reproducción y que otros servidores siguen funcionando. Usar solo episodios propios/autorizados.

El archivo crea una tabla privada de política con una única anulación (Streamtape desactivado), RLS forzada y sin permisos para clientes. Un trigger impide inserciones activas, reactivaciones y sustituciones activas del proveedor bloqueado; permite el upsert de un registro activo previo cuyo episodio/tipo/URL no cambian. Sustituye las dos vistas públicas conservando sus columnas, grants y condiciones de publicación. No actualiza ni elimina episodios, fuentes o reportes; no reemplaza los RPC ni las columnas de 3D y no modifica RLS existente.

`valid_playback_url` conserva su semántica de **formato almacenado** y los mismos patrones TypeScript: estrechar el CHECK histórico invalidaría fuentes activas existentes. `enabledPlaybackUrl` y la política SQL determinan **disponibilidad**, con pruebas de paridad independientes para ambos contratos.

Antes de aplicar este SQL, el frontend nuevo ya bloquea la reproducción y las nuevas activaciones desde sus formularios. La API antigua puede seguir devolviendo Streamtape y anunciar disponibilidad, y un cliente antiguo puede guardar activaciones: **la protección de servidor y la disponibilidad pública coherente requieren aplicar el SQL nuevo**.

No es necesario eliminar datos para volver a habilitar Streamtape en el futuro. Requiere evidencia de compatibilidad real, cambiar su `status` en el registro TypeScript y otra migración incremental que cambie `enabled` en la política privada, con pruebas de paridad y aislamiento. No se expone un control de dominios o permisos arbitrarios al cliente.

## Aislamiento y administración

`playback-providers.ts` concentra nombre, estado, formato, ayuda, conversión local y permisos por proveedor. `safePlaybackUrl` valida sintaxis; `enabledPlaybackUrl` exige también estado disponible. `playback.ts` reexporta el registro y centraliza validación/normalización. El selector infiere iframe/HTML5 y no exige IDs técnicos ni HTML. Se mantienen nombre, orden, hasta 20 fuentes, activación, eliminación, prueba privada y «Guardar y crear siguiente».

`SandboxedPlayerFrame` sigue siendo el único componente que monta iframes, compartido por público y prueba privada. No recibe HTML ni atributos del administrador. Un proveedor desconocido, desactivado o sin política no monta iframe.

| Proveedor disponible | Sandbox | Permisos |
| --- | --- | --- |
| YouTube y Vimeo | `allow-scripts allow-same-origin allow-presentation` | Fullscreen, PiP y encrypted-media, conservados. |
| Uqload | `allow-scripts allow-same-origin` | Fullscreen y PiP, conservados. |

Se conserva `referrerPolicy="strict-origin-when-cross-origin"`. Ninguno recibe `allow-popups`, `allow-popups-to-escape-sandbox`, `allow-top-navigation`, su variante por activación, formularios ni descargas. El iframe se crea tras pulsar Reproducir o Probar servidor; el anterior se desmonta al cambiar.

El sandbox no elimina anuncios ni impide todas las redirecciones dentro del propio iframe. No se lee/modifica su DOM remoto ni se inyectan scripts. `onLoad` solo indica carga del documento, no reproducción confirmada. El origen permitido tampoco acredita derechos sobre un vídeo.

## Comprobaciones y capturas

```sh
npm test
npm run build
npm run test:e2e -- --workers=2
npm run test:e2e:worker -- tests/player.spec.ts tests/player-polish.spec.ts tests/player-providers.spec.ts tests/transition.spec.ts tests/catalog-admin.spec.ts --grep 'Worker API|public detail|three servers|private episode|admin manages|signed-in|long episode|report session|compact editor|admin report rows|pending session|real 3D bundle|simulated provider|provider selector|unverified and malicious|disabled Streamtape|only disabled Streamtape' --workers=2
```

La suite PGlite local verifica paridad de formato/disponibilidad SQL–TypeScript, URLs incorrectas y maliciosas, conservación exacta de registros/reportes/contratos de funciones/grants/RLS, upsert de fuentes existentes, rechazo de nuevas activaciones/reemplazos/reactivaciones, publicación en los tres niveles y disponibilidad pública. La regresión de reportes y la de frontend 3D usan el esquema ampliado con la nueva política.

Playwright intercepta las respuestas de reproductores y utiliza el WebM original de YORU: **son pruebas simuladas de proveedores**. Verifica vídeo en avance, fullscreen, cambio YouTube/Vimeo/Uqload/HTML5, carga tras clic, desmontaje, navegación/recarga directa, administración, guardado por Enter, datos Streamtape conservados y ninguna petición de reproducción a Streamtape aunque llegue en una respuesta antigua. Comprueba escritorio/móvil y anchos 320/390/768/1024/1440.

La fixture intenta ventanas por `window.open`, pestañas `_blank`, navegación superior automática y por clic, y enlaces `_top`. Se exige que no aparezcan páginas o peticiones de escape, que YORU conserve su URL y que el vídeo siga reproduciéndose. No se presentan estas pruebas como reproducción real de Netu, StreamWish o EarnVids.

Capturas con datos sintéticos, sin contenido privado:

| Vista | Escritorio | Móvil |
| --- | --- | --- |
| Estado de Streamtape y pendientes | [Abrir](player/providers-status-desktop.png) | [Abrir](player/providers-status-mobile.png) |
| Controles con Uqload disponible | [Abrir](player/providers-controls-desktop.png) | [Abrir](player/providers-controls-mobile.png) |
| Iframe simulado con vídeo original | [Abrir](player/providers-player-desktop.png) | [Abrir](player/providers-player-mobile.png) |

Resultados finales de esta revisión: **66 pruebas unitarias/SQL correctas**, **146 E2E correctas** en la suite completa Vite (2 casos exclusivos de Worker omitidos), **40 E2E correctas con Worker local**, sin omisiones, y build TypeScript/Vite correcto. Se sincronizó una prueba anterior para esperar la navegación completa antes de editar una ficha. No se cambió la lógica de catálogo o portadas. Permanece el aviso previo del bundle principal de más de 500 kB; no se añadieron dependencias.

**Verificación externa real:** ninguno de los tres pendientes se ha reproducido desde este entorno. No se dispone de vídeos autorizados alojados en ellos y la política de red del ejecutor no permite sus dominios. Consultar documentación con la herramienta web no resuelve esa limitación del navegador de pruebas. Uqload conserva su integración anterior sin presentarla como certificación de reproducción remota. No se añadieron dependencias ni vídeos a los assets de producción.
