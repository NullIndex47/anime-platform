# YORU · anime-platform

Primera fase de una plataforma de anime original. React + Vite + TypeScript, Tailwind CSS 4 y React Router 7. Interfaz en español, tema oscuro con acentos ámbar y paisajes SVG creados para este proyecto.

## Ejecutar

Requisitos: Node.js 22.12 o superior y npm.

```bash
npm ci
npm run dev
```

Abre la dirección que muestre Vite (normalmente `http://localhost:5173`). No hacen falta cuentas, claves ni variables de entorno. `npm ci` utiliza el `package-lock.json` incluido.

```bash
npm run test     # Pruebas de catálogo, publicación y rutas
npm run build    # Comprobación estricta de TypeScript y compilación en dist/
npm run preview  # Servir el resultado de producción, normalmente en el puerto 4173
```

## Implementado

- **Inicio:** portada con cuatro destacados seleccionables, buscador, episodios recientes, selección de animes, clasificación demo y enlaces por género.
- **Catálogo:** búsqueda que ignora acentos y mayúsculas; filtros combinables de género, año, estado y formato; orden por valoración, año o título; estado sin resultados y reinicio de filtros. Los filtros están en la URL para compartir búsquedas.
- **Ficha:** ilustración original, sinopsis, géneros, información del estudio ficticio, estado, valoración demo y episodios con orden ascendente/descendente. Solo se muestran fichas con al menos un episodio disponible; las fichas sin publicar muestran el estado 404.
- **Episodio:** vídeo HTML5 con controles nativos, clip original local, servidores preparados y navegación entre episodios y ficha. El primer/último episodio desactiva la navegación que no corresponde.
- **Acceso/registro:** formularios de vista previa, campos etiquetados, control de visibilidad de contraseña y botones de envío deshabilitados.
- **Administración:** resumen y secciones de animes, episodios, comentarios, usuarios y ajustes. Las tablas conservan también los títulos sin publicar y solo enlazan a fichas públicas disponibles; crear, editar y moderar están deshabilitados.
- **Comentarios:** secciones separadas en ficha y episodio, datos de ejemplo y control funcional para revelar u ocultar spoilers. La publicación está deshabilitada.
- **Responsive:** escritorio, tablet y móvil, menú móvil, tablas desplazables, enfoque de teclado visible, enlace para saltar al contenido, textos alternativos y soporte de movimiento reducido.
- **Errores:** página 404 para rutas, animes, episodios y módulos inexistentes; estado de error con reintento del vídeo local.

## Rutas para probar

| Ruta                                                       | Qué comprobar                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `/`                                                        | Cambia destacados con los puntos y las flechas; usa el buscador |
| `/catalogo`                                                | Combina filtros y cambia el orden; restablece filtros           |
| `/catalogo?genre=Fantas%C3%ADa&year=2026`                  | Filtros inicializados desde la URL                              |
| `/anime/el-viaje-de-aoi`                                   | Información, episodios y comentarios de ficha                   |
| `/anime/el-viaje-de-aoi/episodio/1`                        | Reproduce el clip, avanza de episodio y revela un spoiler       |
| `/anime/jardin-de-invierno`                                | Estado 404: anime todavía no publicado                          |
| `/iniciar-sesion` y `/registro`                            | Formularios pendientes y mostrar/ocultar contraseña             |
| `/admin` y `/admin/animes`                                 | Resumen y estructura de gestión demo                            |
| `/anime/no-existe` y `/anime/el-viaje-de-aoi/episodio/999` | Estado 404                                                      |

Prueba también a 390 px y 1440 px de ancho. En móvil, abre el menú para buscar o navegar. Para comprobar el estado vacío del catálogo, combina el año 2024 con el estado «En emisión».

## Estructura

```text
public/
  artwork/             Ilustraciones SVG originales
  media/               Clip WebM original de demostración
  .assetsignore        Excluye el archivo heredado de Pages del Worker
  _redirects           Regla heredada de Pages comentada, excluida del Worker
src/
  components/          Layout, tarjetas, comentarios, reproductor y avisos
  pages/               Inicio, catálogo, ficha, episodio, acceso, admin y 404
  types/               Modelos de anime, episodios, comentarios y servidores
  data/                Fixtures locales, sin llamadas externas
  services/            Catálogo público, catálogo interno de admin y comentarios
  main.tsx             Árbol de rutas
  styles.css           Tailwind y sistema visual responsive
wrangler.jsonc         Configuración de Cloudflare Workers Static Assets
```

Los servicios son el punto previsto para sustituir las fixtures por una integración futura. No existe cliente, SDK ni configuración activa de Supabase o AniList en esta fase.

## Regla de publicación

Un anime solo aparece en el catálogo público si tiene al menos un episodio publicado y disponible. En esta fase, `episodes` contiene únicamente los episodios demo publicados; una lista vacía representa un título todavía sin publicar. El estado «En emisión», una valoración o la marca de destacado no sustituyen esta regla.

`catalogService` aplica la regla a listados, búsqueda, destacados, clasificación de portada, últimos episodios, géneros y consultas de ficha. Una URL directa como `/anime/jardin-de-invierno` o `/anime/jardin-de-invierno/episodio/1` muestra el estado 404 existente, sin mostrar su ficha ni comentarios. Al tratarse de una SPA estática, este es un estado de la interfaz, no una respuesta HTTP 404 del servidor.

Los ocho títulos se conservan en `src/data/anime.ts`. `adminCatalogService` consulta el catálogo completo y `/admin/animes` mantiene «Jardín de invierno» sin enlazar a una ficha pública inexistente. El catálogo público contiene siete títulos. Cuando un título tenga su primer episodio disponible, aparecerá automáticamente; si deja de tener episodios, volverá a ocultarse.

Esta separación organiza las fixtures y no sustituye los permisos de un backend: el panel demo sigue siendo público y los datos ficticios forman parte del cliente. Cuando se incorporen borradores de episodios, la consulta del backend deberá distinguirlos explícitamente de los episodios publicados.

Para probarlo, busca «Jardín» en `/catalogo`: no habrá resultados. Abre su URL directa: se mostrará el estado 404. Comprueba `/admin/animes`: el título seguirá en la tabla.

## Contenido de demostración

Los ocho títulos, sus estudios, sinopsis, puntuaciones, fechas, episodios y comentarios son ficticios. Los paisajes SVG se han creado expresamente para esta interfaz. El vídeo de 12 segundos es una pieza gráfica original sin audio, servida desde `public/media/yoru-demo.webm`; todos los episodios reproducen el mismo clip. Las duraciones de las fichas pertenecen a los datos ficticios, no al clip de prueba.

Solo **Yoru Demo** tiene una fuente disponible. Los servidores 02 y 03 muestran «Disponible en una fase posterior» y no se pueden seleccionar. No hay embeds, enlaces a vídeos comerciales, recursos remotos ni seguimiento de terceros. Los formularios no envían ni persisten credenciales y los comentarios no se publican.

## Pendiente para fases posteriores

- Integración de Supabase: autenticación, base de datos, almacenamiento y permisos/RLS.
- Roles y protección real de administración. **El panel actual es una maqueta pública de solo lectura, no un panel protegido.**
- Creación, edición y eliminación de contenido; gestión de fuentes con derechos o autorización.
- Publicación y moderación persistente de comentarios, favoritos y cuentas de usuario.
- Integración opcional de AniList, validación de entradas de backend y paginación de catálogos grandes.
- Recuperación de contraseña, verificación de correo y políticas del servicio.
- Despliegue real y configuración de dominio.

## Cloudflare Workers Static Assets

El despliegue está preparado para **Cloudflare Workers Static Assets**. React, Vite, TypeScript y React Router se mantienen; esta fase no necesita código de Worker ni backend. Wrangler está incluido como dependencia de desarrollo y su versión queda fijada por `package-lock.json`.

`wrangler.jsonc` configura:

```json
{
  "name": "anime-platform",
  "compatibility_date": "2026-10-10",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

Wrangler sirve los archivos de `dist/` y, cuando una ruta de navegación no corresponde a un archivo, entrega `index.html` para que React Router la resuelva. Esto permite abrir o recargar directamente `/catalogo`, `/anime/el-viaje-de-aoi` y `/anime/el-viaje-de-aoi/episodio/1`. Las rutas desconocidas y las fichas sin publicar siguen mostrando el estado 404 de la aplicación.

### Probar localmente con Workers

```bash
npm ci
npm run dev:worker
```

Este comando compila la aplicación y ejecuta `wrangler dev` localmente (normalmente en `http://localhost:8787`). No despliega ni requiere iniciar sesión en Cloudflare. Comprueba las rutas anteriores entrando directamente y recargándolas. `npm run dev` conserva el servidor Vite para el desarrollo habitual y `npm run preview` conserva la vista previa de Vite.

### Validar el despliegue sin publicar

```bash
npm run build
npx wrangler deploy --dry-run --outdir work/wrangler-dry-run
```

`--dry-run` valida y prepara el despliegue localmente, sin subirlo a Cloudflare.

### Desplegar cuando corresponda

Requiere una cuenta de Cloudflare con permisos para Workers. Desde la raíz de `anime-platform`:

```bash
npm ci
npx wrangler login
npm run deploy
```

`npm run deploy` compila y ejecuta `wrangler deploy` para el Worker **anime-platform**. Wrangler devuelve la dirección desplegada. Para CI, configura `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` como secretos del entorno, sin guardarlos en el repositorio.

Para conectar el repositorio mediante **Workers Builds**, selecciona la carpeta raíz de `anime-platform`, utiliza Node 24 LTS (`.nvmrc`), `npm run build` como comando de compilación y `npx wrangler deploy` como comando de despliegue. La carpeta de assets la declara `wrangler.jsonc`; no hace falta configurar un proyecto de Pages.

Vite copia `public/.assetsignore` a `dist/.assetsignore`. Ese archivo excluye `_redirects` del despliegue de Workers: la regla heredada de Pages se conserva como comentario en el proyecto para evitar que el servidor local de Wrangler la interprete, y el fallback SPA del Worker lo controla `assets.not_found_handling`. El estado local de Wrangler queda excluido por `.gitignore`.

No se ha desplegado el Worker ni se ha modificado la cuenta de Cloudflare.

## Verificación de esta entrega

- `npm run build`: correcto (comprobación TypeScript y generación de `dist/`).
- Wrangler 4.149.0: `wrangler deploy --dry-run` correcto, sin publicar.
- Chromium sobre `wrangler dev`: navegación directa y recarga de nueve rutas correctas, incluida la regla de publicación; CSS, JavaScript, SVG y WebM servidos correctamente, sin errores de ejecución.
- `npm test`: once pruebas del catálogo, la regla de publicación y las rutas públicas/administrativas. Cubren ocultación de títulos sin episodios, conservación interna y publicación al añadir el primer episodio.
- Chromium: búsqueda, filtros y reinicio, carrusel, orden de episodios, reproducción del clip local, navegación, spoilers, visibilidad de contraseña, administración y rutas 404 comprobados.
- Doce rutas comprobadas a 320, 390, 768, 1024 y 1440 px sin desbordamientos horizontales de página.
- 24 comprobaciones automatizadas con axe en móvil y escritorio sin incidencias detectadas; esto no sustituye una auditoría manual completa de accesibilidad.
- Error de carga del clip, reintento y último episodio comprobados.
- Recursos locales y `.assetsignore` presentes en `dist/`; el archivo heredado `_redirects` está excluido de los assets del Worker.

Las pruebas de navegador se hicieron localmente. El despliegue en Cloudflare Workers queda pendiente.
