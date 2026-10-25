# FASE 3E · Reproductor y editor de episodios

Pulido limitado al reproductor público y al editor de episodios de `/admin`. Este cambio no modifica migraciones SQL, Google OAuth, publicación ni permisos. Si ya aplicaste la expansión compatible, no necesitas ejecutar SQL de nuevo por este pulido.

- **Reproductor:** botón central con icono y foco visible, servidor seleccionado, jerarquía anime/temporada/episodio, selector compacto, anterior/siguiente y lista lateral. Mantiene 16:9, consentimiento antes de conectar, desmontaje de vídeo/iframe y estados de carga/error/sin fuentes.
- **Reportes públicos:** `useAuth` controla sesión cargando, autenticada y anónima. El formulario autenticado no incluye el acceso redundante a Google. La caducidad, límites y retirada de una fuente tienen mensajes distintos. Se confirma el envío, se puede cerrar y el vídeo sigue reproduciéndose. Cerrar devuelve el foco al botón del reporte.
- **Servidores:** datos alineados, tarjetas plegables con nombre y estado, prueba privada, reordenación con iconos accesibles y eliminación con confirmación para fuentes configuradas. Un servidor no muestra reordenación. Con más de tres se abre inicialmente el primero y se ofrecen «Expandir todos» y «Contraer todos». La ayuda técnica queda desplegable.
- **Reportes administrativos:** filas con servidor, motivo, fecha, estado y acción; ocho por página y estado vacío. «Revisados ahora» conserva en memoria los revisados durante la sesión del editor. La resolución sí persiste mediante el RPC existente; al reabrir, el servidor continúa devolviendo solo pendientes. Se mantienen su límite de 100 por carga y la opción de actualizar para obtener los siguientes.

## Validación

- Pruebas unitarias/SQL: **54 correctas**.
- Suite completa Vite: **136 E2E correctas**, 2 casos exclusivos de Worker omitidos.
- Selección con Worker local: **30 E2E correctas**, sin omisiones.
- Build TypeScript/Vite correcto. Sin dependencias nuevas. Se mantiene el aviso existente de tamaño del bundle principal.
- Anchos 320, 390, 768, 1024 y 1440 px; teclado y formularios con 1, 3, 10 y 20 servidores. Sesión renovándose, entrada/salida, caducidad, límite, envío/revisión, activación, orden, eliminación confirmada, cambios pendientes y «Guardar y crear siguiente».
- También se conserva la prueba con el frontend real de 3D y PostgreSQL local expandido. Los proveedores de las pruebas responden con el clip gráfico original; no se utiliza el respaldo privado ni datos del Supabase real en las capturas.

## Capturas nuevas

| Vista | Escritorio | Móvil |
| --- | --- | --- |
| Reproductor | [Ver](player/player-desktop.png) | [Ver](player/player-mobile.png) |
| Editor, tres servidores | [Ver](player/sources-desktop.png) | [Ver](player/sources-mobile.png) |
| Editor, veinte servidores | [Ver](player/editor-many-desktop.png) | [Ver](player/editor-many-mobile.png) |
| Reporte con sesión | [Ver](player/report-signed-in-desktop.png) | [Ver](player/report-signed-in-mobile.png) |
| Reporte sin sesión | [Ver](player/report-guest-desktop.png) | [Ver](player/report-guest-mobile.png) |
| Administración de reportes | [Ver](player/admin-reports-desktop.png) | [Ver](player/admin-reports-mobile.png) |

Sin SQL remoto, fusión ni despliegue de Production.
