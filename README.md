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
npm run test     # Pruebas del servicio local de catálogo
npm run build    # Comprobación estricta de TypeScript y compilación en dist/
npm run preview  # Servir el resultado de producción, normalmente en el puerto 4173
```

## Implementado

- **Inicio:** portada con cuatro destacados seleccionables, buscador, episodios recientes, selección de animes, clasificación demo y enlaces por género.
- **Catálogo:** búsqueda que ignora acentos y mayúsculas; filtros combinables de género, año, estado y formato; orden por valoración, año o título; estado sin resultados y reinicio de filtros. Los filtros están en la URL para compartir búsquedas.
- **Ficha:** ilustración original, sinopsis, géneros, información del estudio ficticio, estado, valoración demo y episodios con orden ascendente/descendente. Los títulos próximos muestran su estado sin episodios.
- **Episodio:** vídeo HTML5 con controles nativos, clip original local, servidores preparados y navegación entre episodios y ficha. El primer/último episodio desactiva la navegación que no corresponde.
- **Acceso/registro:** formularios de vista previa, campos etiquetados, control de visibilidad de contraseña y botones de envío deshabilitados.
- **Administración:** resumen y secciones de animes, episodios, comentarios, usuarios y ajustes. Las tablas permiten consultar las páginas demo; crear, editar y moderar están deshabilitados.
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
| `/anime/jardin-de-invierno`                                | Estado próximo sin episodios                                    |
| `/iniciar-sesion` y `/registro`                            | Formularios pendientes y mostrar/ocultar contraseña             |
| `/admin` y `/admin/animes`                                 | Resumen y estructura de gestión demo                            |
| `/anime/no-existe` y `/anime/el-viaje-de-aoi/episodio/999` | Estado 404                                                      |

Prueba también a 390 px y 1440 px de ancho. En móvil, abre el menú para buscar o navegar. Para comprobar el estado vacío del catálogo, combina el año 2024 con el estado «En emisión».

## Estructura

```text
public/
  artwork/             Ilustraciones SVG originales
  media/               Clip WebM original de demostración
  _redirects           Fallback SPA para Cloudflare Pages
src/
  components/          Layout, tarjetas, comentarios, reproductor y avisos
  pages/               Inicio, catálogo, ficha, episodio, acceso, admin y 404
  types/               Modelos de anime, episodios, comentarios y servidores
  data/                Fixtures locales, sin llamadas externas
  services/            Consulta y filtrado de catálogo; lectura de comentarios
  main.tsx             Árbol de rutas
  styles.css           Tailwind y sistema visual responsive
```

Los servicios son el punto previsto para sustituir las fixtures por una integración futura. No existe cliente, SDK ni configuración activa de Supabase o AniList en esta fase.

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

## Cloudflare Pages

Proyecto preparado para alojamiento estático con rutas SPA. Para desplegar posteriormente desde este repositorio:

- Preset: **Vite**.
- Directorio raíz: raíz de `anime-platform` (si es un monorepo, indica su carpeta).
- Comando de compilación: `npm run build`.
- Directorio de salida: `dist`.
- Versión de Node: 22.12+ (o 24 LTS).

Vite copia `public/_redirects` a `dist/_redirects`. La regla `/* /index.html 200` permite abrir o recargar directamente rutas como `/anime/el-viaje-de-aoi`. No se ha publicado el proyecto ni se han configurado servicios externos.

## Verificación de esta entrega

- `npm run build`: correcto (comprobación TypeScript y generación de `dist/`).
- `npm test`: seis pruebas correctas del catálogo.
- Chromium: búsqueda, filtros y reinicio, carrusel, orden de episodios, reproducción del clip local, navegación, spoilers, visibilidad de contraseña, administración y rutas 404 comprobados.
- Doce rutas comprobadas a 320, 390, 768, 1024 y 1440 px sin desbordamientos horizontales de página.
- 24 comprobaciones automatizadas con axe en móvil y escritorio sin incidencias detectadas; esto no sustituye una auditoría manual completa de accesibilidad.
- Error de carga del clip, reintento y último episodio comprobados.
- Recursos locales y `_redirects` presentes en `dist/`.

Las pruebas de navegador se hicieron localmente. El despliegue en Cloudflare Pages queda pendiente.
