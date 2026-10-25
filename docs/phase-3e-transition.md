# Pasar de 3D a 3E usando el Supabase actual

Todo se prepara en la [PR #11](https://github.com/NullIndex47/anime-platform/pull/11). No hace falta otro proyecto Supabase. No se ha ejecutado SQL remoto ni desplegado Production manualmente.

**Si ya aplicaste la expansión 3E:** no repitas los pasos de migración de esta guía. La ampliación de proveedores y la desactivación de Streamtape tienen [SQL incremental separado e instrucciones actuales](phase-3e-providers.md#sql-manual-incremental-y-separado); `20261024220000_episode_sources.sql` y `20261025230000_playback_providers.sql` permanecen intactos.

## Pasos

1. **Guardar un respaldo comprobado antes del SQL.** En tu copia de esta rama, con Node 22.12+ y `npm ci`, ejecuta `npm run --silent phase3e:backup -- --query`. Copia esa consulta de solo lectura al SQL Editor del Supabase actual. Guarda el JSON completo de la columna `backup` como `work/yoru-before-3e.json` y ejecuta:

   ```sh
   npm run phase3e:backup -- work/yoru-before-3e.json
   ```

   Continúa solo si aparece **«Respaldo restaurado y expansión comprobada en PostgreSQL local»**. Guarda el JSON, su SHA256 y el identificador de la versión 3D activa en Cloudflare → Deployments. El respaldo contiene metadatos y referencias privadas del catálogo; no incluye cuentas ni archivos de Storage, que esta migración no modifica. No lo subas a Git ni lo compartas. Evita editar el catálogo entre este respaldo y la comprobación del paso 3.

2. **Aplicar un solo archivo, una vez y tras aprobarlo:** [`20261024220000_episode_sources.sql`](../supabase/migrations/20261024220000_episode_sources.sql), completo, en SQL Editor del proyecto actual. Usa la última versión de esta PR: sustituye la propuesta destructiva anterior, todavía no aplicada. Si aquella propuesta ya se hubiera aplicado, detente: esta expansión espera la base 3D intacta. Si el editor muestra un error, ejecuta `rollback` en esa sesión y revísalo; no continúes ni reejecutes fragmentos.

3. **Comprobar la aplicación y 3D.** Ejecuta `select yoru_private.phase3e_status();`: debe devolver `"ok": true` y el mismo número de episodios que el respaldo. En Production, crea una ficha **«YORU TRANSICIÓN · PRUEBA PRIVADA»**, una temporada y un episodio privados. Edita, guarda y recarga desde el administrador 3D; confirma que las fichas públicas habituales siguen visibles. No pruebes sobre otras fichas ni publiques este contenido de prueba.

4. **Comprobar la Preview de 3E.** En Cloudflare Builds, confirma que la última compilación de esta rama está correcta y abre su Preview. Usa las mismas dos variables públicas Supabase que Production. Si falta, añade en Supabase → Authentication → Redirect URLs exactamente `https://feat-yoru-phase-3e-player-anime-platform.cuentagaming1304.workers.dev/auth/callback`. Inicia sesión en `/admin`, abre el episodio privado de prueba, añade varios servidores propios/autorizados, guarda y recarga. Usa **«Probar servidor»** para reproducir sin publicar nada. Un ejemplo permitido para la prueba manual es `https://media.w3.org/2010/05/sintel/trailer.mp4` (tráiler Sintel, Blender Foundation, CC BY 3.0). Comprueba también que Production 3D puede seguir editando ese episodio y que 3E conserva sus servidores.

5. **Fusionar personalmente la PR #11 solo cuando 3D y Preview estén correctas.** Deja que Cloudflare publique automáticamente desde `main`. Comprueba OAuth, catálogo y administración. En un episodio propio/autorizado que sí quieras publicar, publica ficha, temporada y episodio y verifica ficha → reproducción, cambio de servidor, anterior/siguiente, reporte y recarga en móvil/escritorio. Mantén privada la ficha de prueba anterior.

6. **Si falla el frontend nuevo:** en Cloudflare → Deployments vuelve a la versión 3D anotada en el paso 1. **No reviertas SQL ni restaures toda la base.** Las columnas, firma y permisos antiguos permanecen y los servidores nuevos siguen guardados. Guardar desde 3D devuelve ese episodio a borrador, igual que antes; no elimina sus servidores. La limpieza de columnas y RPC antiguos se hará en otra PR después de dar por terminada esta ventana de recuperación.

## Qué se ha comprobado automáticamente

- Restauración del respaldo en una base PostgreSQL local desechable, seguida de la expansión y comparación exacta de todos los metadatos respaldados, incluidos IDs, referencias privadas y rutas de portadas.
- Frontend **real** de la PR #10, compilado desde `4f668bc`, y frontend 3E contra el mismo PostgreSQL local expandido: guardar en 3D → gestionar fuentes en 3E → volver a 3D → regresar a 3E conservando fuentes. En móvil y escritorio, con reproducción privada de un clip original.
- Contratos y permisos de los RPC antiguos intactos; nuevos RPC `_v2` sin sobrecargas ambiguas. 3E no usa `authorized`, `authorization_reference`, `available`, `published_at` ni `playback_reference`.
- Las fuentes migradas empiezan inactivas. Publicación de los tres niveles, RLS y privacidad siguen siendo obligatorias. Ninguna fuente externa se monta antes de un clic de reproducción o «Probar servidor».

Las pruebas locales no sustituyen los pasos 3–5 en el servicio hospedado. El estado de compilación remoto de Cloudflare no está disponible mediante la conexión actual; debe confirmarse en su dashboard antes de fusionar. No se ha publicado una Preview manualmente para eludir esa comprobación.
