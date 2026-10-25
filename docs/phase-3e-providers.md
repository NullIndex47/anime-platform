# FASE 3E · Proveedores de reproducción

Ampliación preparada en la **PR #11**, rama `feat/yoru-phase-3e-player`. Investigación del 25 de octubre de 2026. No se ha ejecutado SQL remoto, fusionado ni desplegado Production.

## Estado y evidencia

«Habilitado» significa que YORU reconoce y valida ese formato y permite montarlo bajo el aislamiento existente. La reproducción remota del contenido concreto depende del proveedor. Las comprobaciones de navegación web siguientes verifican documentación y formatos; **no son pruebas de reproducción externa real**.

| Proveedor | Estado | Formato admitido / evidencia primaria |
| --- | --- | --- |
| YouTube | Se conserva | `https://www.youtube-nocookie.com/embed/<11 caracteres>`; [inserción con privacidad mejorada](https://support.google.com/youtube/answer/171780). |
| Vimeo | Se conserva | `https://player.vimeo.com/video/<número>`; [documentación del reproductor](https://developer.vimeo.com/player/sdk/basics). |
| HTML5 | Se conserva | MP4/WebM en `media.w3.org/2010/05/` o `archive.org/download/`. No se amplían sus orígenes. |
| Streamtape | Habilitado por formato | Solo `https://streamtape.com/e/<ID alfanumérico>`. La [API de Streamtape disponible en su sitio espejo](https://strtape.tech/api) publica ese iframe en «Dynamic Subtitles» y enlaces `/v/<ID>/<nombre>` en «Show running converts». El dominio canónico `/api` no pudo abrirse en la herramienta de investigación. **El espejo se consultó como documentación; no se permite como origen de reproducción.** |
| Uqload | Habilitado con formato restringido | Solo la URL completa emitida en «Embed Code»: `https://uqload.vc/e/<12 minúsculas o dígitos>?strm<N>.uqload.vc/i/<2 dígitos>/<5 dígitos>/<12 minúsculas o dígitos>`. El [sitio oficial](https://uqload.vc/) describe dónde obtenerla; el campo de inserción de páginas públicas indexadas del mismo origen permite observar este formato. No se reprodujeron sus vídeos ni se incorporaron sus enlaces o títulos al catálogo, pruebas o capturas. La [API oficial](https://uqload.vc/api.html) confirma el servicio y limita los enlaces directos a cuentas/condiciones concretas; no se utiliza para obtener vídeo. |
| Netu | **Pendiente** | La [API enlazada desde Netu](https://netu.ac/view_page.php?pid=10) devuelve un cargador JavaScript en `embed_code` y un iframe alternativo en `embed_code_non_secured`. No se ejecuta el cargador ni se habilitan sus dominios alternativos sin verificar su vigencia y un reproductor autorizado bajo sandbox. El nombre del campo por sí solo no demuestra que el iframe sea inseguro. |
| StreamWish | **Pendiente** | Se consultaron el [sitio oficial](https://streamwish.com/), la [API](https://streamwish.com/api.html) y las [FAQ](https://streamwish.com/faq). Documentan el servicio y la gestión de ficheros, pero no un contrato verificable de inserción/dominios. No se asume `/e/<ID>` ni se añaden espejos de listas de terceros. |
| EarnVids | **Pendiente** | Se consultaron el [sitio oficial](https://earnvids.com/), la [API enlazada por el servicio](https://earnvidsapi.com/api.html) y las [FAQ](https://earnvids.com/faq). No documentan el formato de inserción. Los dominios alternativos observados en páginas de desarrollo no bastan para habilitarlos en producción. |

En Uqload se admite **únicamente** la variante completa anterior, con el parámetro de ruta que emite el servicio. No se permite una query libre, `autoplay`, `redirect`, fragmentos, otros dominios, rutas antiguas `embed-…html`, ni enlaces públicos `…html`. No se elimina ni inventa el parámetro de su URL. Si la cuenta del administrador emite otra variante, queda pendiente de revisión específica.

En Streamtape se acepta también como **entrada del editor** `https://streamtape.com/v/<ID>` y la variante con un único nombre de fichero ASCII. Se toma solo su ID y se genera `/e/<ID>`, sin consultas de red. La conversión se muestra al salir del campo y se repite antes de guardar, incluido Enter. La base de datos y el reproductor solo aceptan el resultado canónico `/e/…`. No se aceptan parámetros de miniaturas, subtítulos externos ni dominios espejo. Los demás proveedores requieren directamente la URL de inserción o vídeo admitida; no se inventan conversiones.

Para cerrar cada pendiente se necesita una URL de inserción proporcionada por el servicio para contenido propio/autorizado, evidencia primaria del dominio y formato, y una comprobación en el sandbox actual. Un proveedor que exija popups, navegación superior o JavaScript dentro de la página de YORU seguirá pendiente.

## Administración

- El selector **Proveedor** sustituye el tipo técnico. Pegar una URL reconocida selecciona el proveedor y asigna iframe/HTML5 automáticamente. No se introducen IDs de proveedor ni HTML.
- Se conservan nombre, hasta 20 fuentes, estado, orden, eliminación, prueba privada y «Guardar y crear siguiente».
- Abrir o reordenar fuentes existentes conserva URLs e IDs. Los enlaces heredados no reconocidos aparecen como «Enlace pendiente de revisión», permanecen editables e inactivos y no se reproducen.
- Cambiar explícitamente el proveedor vacía el enlace del borrador si pertenece a otro proveedor, para introducir el nuevo. Cancelar conserva lo guardado. Pegar un enlace válido de otro proveedor también lo reconoce automáticamente.
- Los proveedores pendientes aparecen deshabilitados; la ayuda plegable explica el motivo. Una URL no admitida no puede activarse ni probarse.
- «Probar servidor» usa la URL canónica en un iframe aislado o vídeo nativo, sin publicar ni guardar. Solo se contacta el proveedor al pulsar ese botón.

Capturas con datos sintéticos y vídeo original, respuestas de proveedor **simuladas**:

| Vista | Escritorio | Móvil |
| --- | --- | --- |
| Nuevos controles y proveedores pendientes | [Abrir](player/providers-controls-desktop.png) | [Abrir](player/providers-controls-mobile.png) |
| Iframe de prueba dentro de YORU | [Abrir](player/providers-player-desktop.png) | [Abrir](player/providers-player-mobile.png) |

## SQL que debe aplicarse manualmente

La migración `20261024220000_episode_sources.sql` **ya está aplicada y permanece intacta**. Para esta ampliación aplica únicamente el nuevo archivo completo:

[`supabase/migrations/20261025230000_playback_providers.sql`](../supabase/migrations/20261025230000_playback_providers.sql).

1. Revisa ese archivo en la PR #11 y confirma que el SQL Editor apunta al proyecto correcto, con la expansión 3E ya aplicada.
2. Copia **todo el archivo nuevo**, incluidos `begin` y `commit`, al SQL Editor y ejecútalo manualmente. No vuelvas a ejecutar la migración de fuentes anterior ni fragmentos de esta.
3. Si aparece un error, ejecuta `rollback` en esa sesión y revisa el error antes de continuar.
4. Después de aplicarlo, en la Preview abre un episodio de prueba privado y utiliza fuentes propias/autorizadas: prueba privada, guardado, recarga, activación y cambio de servidor. La rama requiere este SQL nuevo para guardar activos los formatos nuevos; los servidores antiguos siguen funcionando antes de aplicarlo.

El archivo solo hace `CREATE OR REPLACE` de `yoru_private.valid_playback_url(text,text)`. Conserva OID y permisos privados, y no modifica filas, vistas, RLS, reglas de publicación, reportes, columnas ni RPC de 3D. No autoactiva fuentes existentes. No contiene claves ni conexiones remotas.

No hace falta revertir la base para volver al frontend anterior. Ese frontend conservará los datos, pero solo reconocerá sus proveedores originales; mantén una fuente compatible si necesitas reproducir durante esa recuperación.

## Diseño y ampliaciones futuras

`src/services/playback-providers.ts` concentra cada proveedor: nombre, tipo, patrones de URL canónica, ayuda y conversión local opcional documentada. `src/services/playback.ts` reexporta `playbackProviders` y ofrece validación/normalización comunes al editor y al reproductor. No se añade una columna de proveedor: se deduce de la URL, por lo que no hay datos administrativos nuevos expuestos.

Para añadir otro proveedor: investigar su formato/origen, añadir una entrada al registro, crear **otra migración incremental** con su patrón y añadir ejemplos válidos/ataques y pruebas de navegador. Las pruebas exigen igualdad literal de las listas de patrones y ejecutan los mismos casos en PostgreSQL y TypeScript. Nunca se reescribe una migración aplicada.

`SandboxedPlayerFrame` es el único componente que monta iframes, compartido por la página pública y la prueba privada. Su política procede del registro de código, nunca de campos administrativos ni de HTML del proveedor. Una URL no reconocida o un proveedor sin política no monta ningún iframe.

| Proveedor | Sandbox | Permisos del reproductor |
| --- | --- | --- |
| YouTube y Vimeo | `allow-scripts allow-same-origin allow-presentation` (capacidades existentes) | Fullscreen, PiP y encrypted-media, conservados para sus reproductores actuales. |
| Streamtape y Uqload | `allow-scripts allow-same-origin` | Fullscreen y PiP. Sin Presentation API ni encrypted-media. |

Todos conservan `referrerPolicy="strict-origin-when-cross-origin"`. **Ninguno** recibe `allow-popups`, `allow-popups-to-escape-sandbox`, `allow-top-navigation` ni su variante `by-user-activation`; tampoco permisos de formularios o descargas. El navegador bloquea ventanas abiertas por script, enlaces a pestañas nuevas y navegación superior automática o después de un clic. Si una fuente no reproduce con esta política, se mantiene inactiva o pendiente; no se elevan sus permisos para forzarla.

El sandbox no garantiza eliminar anuncios, enlaces ni redirecciones **dentro del propio iframe**, ni errores o restricciones internas del proveedor. No se intenta leer/modificar el DOM de un reproductor externo, interceptar sus anuncios, inyectar scripts ni sortear la política del navegador. El visitante puede cambiar a otra fuente o reportar el problema. La URL aprobada tampoco garantiza derechos sobre el contenido; estos deben revisarse antes de publicarlo.

## Comprobaciones

```sh
npm test
npm run build
npm run test:e2e -- --workers=2
npm run test:e2e:worker -- tests/player.spec.ts tests/player-polish.spec.ts tests/player-providers.spec.ts tests/transition.spec.ts tests/catalog-admin.spec.ts --grep 'Worker API|public detail|three servers|private episode|admin manages|signed-in|long episode|report session|compact editor|admin report rows|pending session|real 3D bundle|simulated provider|provider selector|unverified/malicious' --workers=2
```

Resultados finales: **64 pruebas unitarias/SQL correctas**, **142 E2E correctas** en la suite completa Vite (2 casos exclusivos de Worker omitidos) y build TypeScript/Vite correcto. **36 E2E correctas con Worker local**, sin omisiones. No se añadieron dependencias; permanece el aviso existente del bundle principal y no hay vídeos en `dist`.

La suite SQL usa PGlite local: paridad por tipo y proveedor ante orígenes falsos, credenciales, puertos, HTTP, codificación, parámetros no previstos, fragmentos, HTML y rutas maliciosas; conservación exacta de filas, OID, grants, RLS, vistas y RPC; CRUD y publicación de los tres niveles. Se ejecuta también la regresión de reportes y compatibilidad con 3D sobre el esquema con ambas migraciones 3E.

Playwright intercepta las URLs antes de cualquier petición externa y responde con el WebM original de YORU y un documento iframe controlado. Comprueba tiempo de reproducción y fullscreen dentro del iframe, clic antes de cargar, desmontaje, cambio entre YouTube/Vimeo/Streamtape/Uqload/HTML5, navegación, recarga, formularios, guardado por Enter, conservación de fuentes y anchos 320/390/768/1024/1440. El vídeo no se incorpora a los assets publicados.

La fixture intenta `window.open`, un enlace `target="_blank"`, navegación superior por script al cargar y tras un clic, y un enlace `target="_top"`. El test comprueba el bloqueo de esos intentos, que no aparecen otras páginas, que YORU conserva su URL, que no sale ninguna petición al destino de prueba y que el vídeo sigue reproduciéndose. Se ejecuta en los cuatro proveedores iframe, escritorio/móvil y también en las pruebas privadas de Streamtape/Uqload. Una prueba unitaria exige la política cerrada exacta de cada proveedor y deniega URLs desconocidas. Estas son comprobaciones del navegador con una fixture propia, no de anuncios ni vídeos remotos reales.

**Reproducción externa real:** no verificada para los proveedores nuevos desde este entorno. No se dispone de un vídeo propio/autorizado alojado en ellos y la política de red del ejecutor no admite esos dominios. La consulta de documentación mediante navegación web sí se realizó; no se presenta como reproducción. Antes de activar una fuente, comprobarla con «Probar servidor» en la Preview, en escritorio y móvil, conservando el aislamiento. Si falla por anuncios, región, cookies, restricciones de dominio o permisos, usar otra fuente y mantener esa inactiva. `onLoad` del iframe solo indica que cargó su documento; no confirma reproducción ni permite observar todos sus errores internos.
