# YORU · catálogo de anime

YORU permite crear fichas manuales en Supabase, publicarlas en Inicio y Explorar y organizar sus temporadas y episodios desde `/admin`. Google OAuth y los perfiles conservan su implementación existente. AniList sigue desactivado hasta obtener autorización.

La FASE 3E añade reproducción integrada de episodios publicados con múltiples servidores administrables, iframe oficial o vídeo HTML5 externo y reportes de problemas. No aloja vídeos en Cloudflare. Consulta la [transición compatible con 3D usando el Supabase actual](docs/phase-3e-transition.md) antes de aplicar el SQL de expansión. La FASE 3D incorporó portadas individuales y publicación independiente de temporadas y episodios, y retiró la demo.

## Preparar y probar

Node 22.12 o posterior:

```sh
npm ci
npm run dev
npm test
npm run test:e2e
npm run test:e2e:worker -- tests/catalog-admin.spec.ts --grep 'Worker API'
npm run build
```

Copiar `.env.example` a `.env.local` y configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Solo se usan claves públicas; nunca poner `service_role` ni otras claves privadas en `VITE_*`. Para pruebas del Worker, consultar `.dev.vars.example`. No añadir archivos de entorno al control de versiones.

Antes de usar los cambios sobre un Supabase existente, revisar las dos migraciones incrementales y la configuración de Storage/OAuth en la [guía de FASE 3D](docs/phase-3d-real-catalog.md). **El desarrollo no aplica SQL remoto.** No volver a ejecutar migraciones antiguas ni borrar registros de prueba persistentes.

## Rutas activas

| Ruta | Función |
| --- | --- |
| `/` | Portada y fichas publicadas |
| `/catalogo` | Búsqueda, filtros y paginación en PostgreSQL |
| `/anime/:uuid` | Ficha, portada y temporadas/episodios publicados |
| `/iniciar-sesion`, `/auth/callback` | Google OAuth con PKCE |
| `/cuenta`, `/bienvenida`, `/mi-perfil` | Perfil persistente de Supabase |
| `/admin`, `/admin/animes` | CRUD protegido y publicación de fichas |
| `/admin/importar` | Integración AniList desactivada hasta autorización |

Las rutas `/demo` y sus descendientes muestran la página de contenido inexistente. No hay botones de reproducción, comentarios, favoritos ni seguimiento que simulen operaciones.

## Datos y permisos

Las tablas administrativas conservan RLS y FORCE RLS. La pertenencia a administradores se comprueba en PostgreSQL mediante `yoru_private.administrators`, nunca mediante datos editables del perfil. Los visitantes usan las proyecciones `public_anime`, `public_seasons` y `public_episodes`, con columnas explícitas y controles de publicación de todos sus padres. Las referencias privadas de reproducción y permisos no forman parte de las respuestas públicas.

Publicar una ficha no publica temporadas ni episodios. Cada nivel tiene su control; retirar la ficha oculta también sus descendientes. Guardar un episodio vuelve a dejarlo en borrador. Los episodios publicados muestran sus datos y el estado «Reproducción no disponible».

Las portadas usan el bucket privado `yoru-covers`, objetos inmutables con UUID, límites de 2 MiB y tipos JPEG/PNG/WebP. La aplicación firma lecturas durante 60 segundos; Storage valida si el visitante puede leer el objeto. Las sustituciones, retiradas y eliminaciones tienen limpieza persistente y reintentable mediante la API de Storage. Ver sus límites y el procedimiento de mantenimiento en la guía.

## Preview y Production

Abrir una PR contra `main` activa el flujo existente de Cloudflare Builds. Mantener su comando de Preview `npm run deploy:preview` y las dos variables públicas de Supabase. No se añade otro proveedor de hosting ni un workflow alternativo. En esta entrega solo se utiliza el despliegue automático de Preview; no se fusiona la PR ni se despliega Production manualmente.

Referencias de operación: [runtime](docs/production-runtime.md), [perfiles](docs/phase-2b-profiles.md), [moderación](docs/username-moderation.md). Las guías de fases 3A, 3B y 3C describen el historial; sus instrucciones de demostración quedan sustituidas por la FASE 3D.
