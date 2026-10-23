# FASE 3D · catálogo manual, portadas y episodios públicos

Partida: `main` en `7d1ce47`, PR #9 fusionada. Se reutilizan la autenticación Google, perfiles, autorización administrativa, creación/edición/publicación de fichas, búsqueda y CRUD de temporadas/episodios. No se crean fichas remotas ni se elimina YORU Test. No se ejecuta SQL remoto.

## Preparación de Supabase por el propietario

1. Comprobar que las migraciones existentes hasta `20261022190000_public_catalog.sql` ya están aplicadas. Conservar datos, IDs, permisos y administradores. Hacer copia de seguridad según el procedimiento del proyecto. No repetir migraciones antiguas.
2. Revisar y aplicar **una vez**, en orden y como propietario `postgres`, las migraciones nuevas:
   - `20261023180000_public_seasons_episodes.sql`: añade `published=false` en temporadas y episodios, RPC administrativas y vistas públicas. Los registros existentes permanecen privados en estos niveles. Los estados de publicación de fichas no cambian. Se conserva la firma de `yoru_save_episode`; guardar cualquier episodio lo devuelve a borrador, incluso si sus datos no cambian.
   - `20261023181000_anime_covers.sql`: crea el bucket privado `yoru-covers`, reserva/asociación de objetos, cola de limpieza, políticas de Storage y `cover_path` en la proyección pública. No altera imágenes de AniList ni permisos de proveedor. El indicador público de reproducción queda a `false` hasta implementar el reproductor real.
3. Cada migración es transaccional, incremental y no idempotente. Si `yoru-covers` ya existiera, revisar la colisión antes de aplicar: no hacerlo público ni sobrescribir un bucket ajeno. Las vistas/funciones con elevación deliberada deben pertenecer al propietario con acceso a las tablas; no reasignarlas a roles del navegador. Mantener el esquema privado fuera de los esquemas expuestos por la API.
4. Supabase Storage debe estar habilitado. En Storage, comprobar que el bucket es **privado**, máximo **2097152 bytes**, y permite solo `image/jpeg`, `image/png`, `image/webp`. Las políticas se crean en `storage.objects`. Incluyen guardas restrictivas para este bucket: una política permisiva amplia de otro bucket no habilita lecturas/escrituras aquí, y las guardas no cambian el acceso a los otros buckets. Revisar las políticas preexistentes y no retirar estas guardas. No cambiar RLS ni propietario de las tablas internas de Storage.
5. Verificar que PostgREST ve las nuevas vistas/RPC; esperar su recarga de esquema si fuera necesario. Conservar las variables públicas de Supabase y las claves privadas fuera del frontend. No se necesita `service_role`, conversión de imágenes, cron ni almacenamiento de vídeos.

La migración no altera Google OAuth ni perfiles. El bucket funciona con el plan gratuito sin transformaciones de pago; el consumo de almacenamiento y transferencia depende de las cuotas de la cuenta. Se recomienda optimizar cada portada a unos cientos de KiB y vigilar las cuotas en Supabase.

## Publicación y confidencialidad

- La ficha publicada se muestra aunque no tenga temporadas o episodios. Publicar cada nivel es una operación independiente que vuelve a exigir administración en PostgreSQL.
- Las vistas públicas verifican la ficha publicada y la autorización de su origen, además de la temporada y el episodio publicados. No hay excepción pública para administradores. Los borradores solo se leen por el CRUD privado.
- Retirar una temporada oculta sus episodios, conservando sus estados individuales para poder revisarlos y volver a publicarla. Editar una temporada ya publicada actualiza su número/nombre públicamente; retirarla antes de editar si se desea revisar en privado. Guardar un episodio lo devuelve siempre a borrador. Publicar metadatos no habilita reproducción.
- `public_episodes` solo expone UUIDs, número, título, descripción y `playback_available=false`. No expone `playback_reference`, `authorization_reference`, marcas de autorización ni URLs privadas.
- Temporadas y episodios públicos se consultan bajo demanda en páginas de 24 elementos (+1 para detectar siguiente). No se descarga todo el catálogo para buscar o filtrar.

## Portadas y limpieza de objetos

1. En la edición de una ficha existente, seleccionar una imagen propia o autorizada y confirmar el permiso de publicación. El navegador comprueba tipo, tamaño y firma inicial del archivo. Storage vuelve a limitar tipo MIME/tamaño en el servidor; las operaciones requieren administrador. La comprobación de firma del navegador es ayuda de validación, no una barrera frente a un administrador que use directamente la API.
2. La RPC reserva una ruta aleatoria asociada al anime. Storage solo permite insertar rutas reservadas y vigentes. No se admiten sobrescrituras/upserts ni operaciones UPDATE. Después de subir, otra RPC verifica que el objeto existe y asocia la portada, comprobando el valor anterior para evitar perder cambios entre dos sesiones. Ante conflicto, recargar la ficha.
3. La lectura usa URLs firmadas de 60 segundos. Las tarjetas diferidas solicitan la firma al acercarse a la pantalla; si la imagen falla (por ejemplo, tras caducar una firma en segundo plano), se firma una vez más antes de usar la imagen provisional. Un visitante solo puede obtener una nueva firma para la portada actual de una ficha pública; los administradores pueden previsualizar borradores. Al retirar una ficha, una firma ya emitida puede seguir funcionando hasta caducar; una imagen descargada o almacenada en caché no puede retirarse del dispositivo del visitante. Los datos del catálogo se vuelven a consultar y no tienen caché persistente.
4. Sustituir/retirar una portada o eliminar un anime conserva una tarea de limpieza. La aplicación elimina archivos por la API de Storage y después borra la tarea si el objeto ya no existe. **No borrar filas de `storage.objects` por SQL:** eso dejaría el archivo físico sin gestionar. Los borrados SQL directos solo se simulan en las pruebas locales de políticas.
5. Una subida interrumpida o una asociación fallida conserva una reserva con vencimiento de una hora. No se borra mientras podría estar en uso. Abrir de nuevo un editor de portada o pulsar **Reintentar limpieza** procesa hasta 100 tareas vencidas por intento; sustituciones y retiradas también lo hacen. Repetir para un volumen mayor. Un fallo de red deja la tarea registrada para reintentar, sin ocultarlo tras un mensaje de éxito total. No hay un proceso automático en segundo plano: si nadie vuelve a administrar portadas, las tareas pendientes siguen ocupando espacio hasta ese mantenimiento. No hay archivos sin registro de seguimiento creados por este flujo.
6. Tras eliminar una ficha se intenta limpiar inmediatamente. Si fallara, abrir el editor de otra ficha y reintentar la limpieza. La cola sobrevive a la eliminación del anime. Las políticas impiden borrar una portada que siga asociada.

Las tarjetas, la portada de Inicio, los resultados de búsqueda y la ficha utilizan la portada individual. Si no existe o falla la lectura, muestran la ilustración provisional original de YORU. No hay solicitudes de imágenes a proveedores externos no autorizados.

## Preview y OAuth

Crear la PR en `feat/yoru-phase-3d-real-catalog`. Cloudflare Builds debe ejecutar el flujo de Preview existente; no invocar un despliegue manual ni fusionar la PR. Sus variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` se mantienen; el wrapper conserva `ANILIST_ENABLED=false`.

El callback exacto previsto, añadido a la allowlist del frontend, es:

```text
https://feat-yoru-phase-3d-real-catalog-anime-platform.cuentagaming1304.workers.dev/auth/callback
```

Antes del acceso real, el propietario debe confirmar el origen que devuelve Cloudflare y añadir este callback exacto en Supabase Authentication → URL Configuration → Redirect URLs. No cambiar Site URL de Production ni añadir comodines. Mantener la configuración Google/Supabase existente. Si el origen real difiere del previsto, revisar la allowlist explícitamente; no aceptar cualquier dominio por patrón.

## Prueba manual desde administración

1. Acceder a Preview con Google como administrador. Abrir **Mis animes → Nuevo anime**. Introducir manualmente, por ejemplo, 86 EIGHTY-SIX o Solo Leveling, sus títulos alternativos, sinopsis propia, géneros, año, estudio, formato, estado y episodios totales. No inventar puntuación. Guardar borrador y recargar; editar debe recuperar los datos.
2. **Editar → Portada individual**: probar un archivo inválido y uno superior a 2 MiB, después una portada autorizada válida. Guardar, recargar y comprobar que conserva la imagen. Sustituirla y verificar que la anterior se limpia; retirarla debe restaurar el placeholder. Si falta alguna migración, mostrar error y corregir la preparación antes de continuar.
3. Publicar la ficha, primero cancelando y luego aceptando la confirmación. En ventana privada, comprobar Inicio, Explorar, búsqueda por título alternativo, filtros y ficha. No deben aparecer episodios por publicar la ficha.
4. Volver al panel. Crear dos temporadas y varios episodios con número, título y descripción. Editar y recargar. Publicar solo una temporada y solo un episodio suyo. La ventana privada debe mostrar únicamente ese contenido; el episodio debe indicar **Reproducción no disponible**, sin botón ficticio. Una temporada publicada puede estar vacía.
5. Retirar la temporada debe ocultar sus episodios. Guardar un episodio publicado, aunque sea sin cambios, lo devuelve a borrador; volver a publicarlo debe requerir una acción expresa. Publicar un episodio de una temporada privada no revela nada al público.
6. Retirar la ficha y recargar Inicio, búsqueda y enlace directo en ventana privada: debe desaparecer y el enlace mostrar contenido inexistente. Los datos permanecen en Supabase. Volver a publicarla conserva su UUID y los estados individuales de sus descendientes.
7. Con un usuario normal, comprobar perfil persistente y ausencia del panel. Un intento directo de RPC administrativa debe fallar; alterar `user_metadata` no otorga permisos. Verificar sesión Google tras recarga y cierre de sesión. No eliminar YORU Test ni otras fichas persistentes como parte de estas comprobaciones.
8. Abrir `/demo`, `/demo/catalogo`, `/demo/anime/el-viaje-de-aoi`, sus episodios y `/demo/admin/episodios`: muestran el estado de contenido inexistente. No hay enlaces demo en el footer ni menú. La SPA usa su página 404; el alojamiento estático puede devolver HTTP 200 para la shell.
9. Probar 320, 390, 768 y 1440 px, navegación móvil, teclado, búsqueda, carga, error/reintento y catálogo/temporadas vacíos. Comprobar en Network que no se consulta AniList ni se exponen referencias privadas.

## Reproducción: PR futura independiente

Esta entrega completa el catálogo y los metadatos públicos, y retira el reproductor ficticio. Las referencias existentes de reproducción y licencia se conservan privadas y no se abren, insertan ni validan como fuentes operativas. La siguiente PR deberá implementar:

- Una tabla `catalog_episode_sources` con varias fuentes por episodio: etiqueta, tipo (`video` o `embed`), URL HTTPS, proveedor, evidencia privada de derechos, autorización y estado activo. RLS/FORCE RLS y RPC administrativas con padres vinculados por FK.
- Validación en servidor y cliente con allowlist de proveedores/orígenes autorizados, sin credenciales, puertos arbitrarios, esquemas peligrosos ni hosts locales/privados. Una URL válida sintácticamente no prueba derechos ni permiso de inserción. Mantener evidencia fuera del DTO público y retirar fuentes inmediatamente al revocar sus derechos.
- Una proyección de fuentes que vuelva a exigir publicación vigente del anime, temporada y episodio, fuente activa/autorizada y permiso de inserción. Derivar disponibilidad de esas fuentes; nunca de la mera presencia de una referencia privada.
- Reproductor integrado con selección de fuentes, `<video>` para formatos compatibles o iframe limitado por proveedor, CSP y permisos/sandbox específicos, errores/ausencia de fuente y navegación accesible. No presentar CTA si no existe una fuente reproducible vigente.
- Vídeo servido por infraestructura externa autorizada. No alojarlo ni retransmitirlo desde Workers. Sin descargas de terceros ni mecanismos de evasión/republicación.
- Pruebas de revocación, URL maliciosa, publicación privada, proveedor sin permiso de embed y varios formatos/fuentes en móvil.

## Validación local y recuperación

Los E2E usan Supabase simulado para comprobar UI, llamadas reales del SDK, recarga y navegación. PostgreSQL/PGlite ejecuta las migraciones para comprobar permisos y contratos; Storage se representa con sus tablas/RLS mínimas. La transferencia de archivos y el OAuth real de Google requieren la comprobación manual sobre Preview configurada; los mocks no la acreditan.

Restaurar el código anterior permite recuperar la UI anterior sin eliminar tablas ni datos. No revertir la base de datos borrando tablas/bucket. Si se necesita una reversión SQL, preparar una migración compensatoria revisada, incluyendo dependencias de las vistas y limpieza de objetos por Storage API. Para ocultar contenido inmediatamente, retirar su publicación.

### Resultados de esta entrega

- `npm test`: 47 pruebas aprobadas, incluidas PostgreSQL/PGlite, RLS, perfiles, OAuth, contratos y Storage. Después de añadir las guardas restrictivas, las tres pruebas de base de datos de FASE 3D se repitieron y aprobaron.
- E2E frontend: 78 escenarios de escritorio/móvil validados entre la suite completa y la repetición dirigida de los casos de portadas afectados. La última ejecución dirigida de `tests/real-catalog.spec.ts` terminó con 8/8 aprobados. Las comprobaciones de Worker se omiten en el servidor Vite y se ejecutan por separado.
- Worker local: 2/2 pruebas HTTP aprobadas con Wrangler, comprobando rechazo anónimo de la API sin servir la SPA como respuesta.
- TypeScript/Vite: compilación correcta. Continúa el aviso no bloqueante del bundle principal de unos 533 kB; no se ha añadido un runtime de vídeo. CSS compilado reducido a unos 43 kB tras retirar los estilos de demo.
- Sin desbordamiento horizontal en la ficha a 320, 390, 768 y 1440 px; el panel existente también se comprueba a 1024 px. `git diff --check` correcto.

Estos resultados son locales. El estado de la Preview se obtiene del flujo automático de Cloudflare de la PR; no acreditan la aplicación de las migraciones ni una sesión Google real en el proyecto remoto.
