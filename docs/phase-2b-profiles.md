# FASE 2B: perfiles reales en Supabase

## Modelo y alcance

Cada perfil contiene solo `id` (UUID de `auth.users`), `username` y una clave derivada `username_key`. No se copian el correo, el nombre, la foto, contraseñas, roles ni metadatos de Google. El avatar es un icono local predeterminado; no hay almacenamiento ni subida de archivos.

Los nombres conservan su presentación, pero la restricción PostgreSQL `profiles_username_unique` aplica UNIQUE a `lower(username COLLATE "C")`. Así `Sakura_7` y `SAKURA_7` compiten por el mismo nombre, incluso con escrituras simultáneas. No hay una comprobación previa que pueda prometer disponibilidad antes de guardar.

Se admiten 3–20 caracteres ASCII A–Z, a–z, 0–9 y `_`, sin espacios ni normalización silenciosa. La misma lista de nombres reservados se valida en SQL y en el cliente: admin, administrator, administrador, support, soporte, yoru, moderator, moderador, mod, root, system, sistema, staff, official, oficial, help, api y null, en cualquier combinación de mayúsculas.

RLS permite leer únicamente identidad pública a visitantes y usuarios autenticados. INSERT exige que `id = auth.uid()`; UPDATE exige ser propietario antes y después de modificar. Los permisos de columna permiten actualizar solo `username`, nunca el UUID ni la clave generada. No se concede DELETE a clientes. El FK elimina un perfil si se elimina su usuario de Auth; esta fase no implementa borrado de usuarios.

La autenticación Google de FASE 2A no cambia. El callback existente sigue llevando a `/cuenta`; allí se consulta Supabase y se muestra `/bienvenida` si falta el perfil. `/cuenta` y `/mi-perfil` muestran Mi perfil. Una sesión existente sin perfil también pasa por bienvenida al abrir su cuenta. Un perfil válido evita repetir la bienvenida. Los errores al leer no se interpretan como ausencia del perfil.

El catálogo sigue abierto, incluso desde el enlace de bienvenida. No se han modificado catálogo, episodios ni reproductor, ni activado comentarios, favoritos o administración.

## Aplicación controlada de la migración

Esta entrega no ejecuta SQL remoto, no despliega manualmente y no añade aplicación automática de migraciones.

1. Comprueba que estás en el proyecto Supabase correcto. Guarda una copia de seguridad conforme a tu procedimiento habitual y revisa la migración antes de ejecutarla.
2. En SQL Editor, ejecuta esta consulta de solo lectura:

   ```sql
   select to_regclass('public.profiles') as existing_profiles;
   ```

3. Si devuelve una tabla existente, **detente** y revisa su definición y políticas. La migración no sustituye ni elimina una tabla existente. No uses DROP TABLE para resolver el conflicto.
4. Si devuelve NULL, copia completo `supabase/migrations/20261011210000_profiles.sql` y ejecútalo una vez en SQL Editor. Incluye BEGIN/COMMIT: si alguna instrucción falla, no quedan cambios parciales. Si tu editor mantiene la transacción fallida abierta, ejecuta ROLLBACK antes de reintentar.
5. Registra el nombre y la fecha de la migración en tu registro de cambios. Si utilizas Supabase CLI con historial de migraciones, aplícala en un entorno de ensayo con `supabase migration up --local` y después mediante tu procedimiento revisado habitual. No ejecutes un `db push` indiscriminado con otras migraciones pendientes.
6. Comprueba mediante consultas de solo lectura:

   ```sql
   select column_name, data_type, is_generated
   from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
   order by ordinal_position;

   select relrowsecurity, relforcerowsecurity
   from pg_class where oid = 'public.profiles'::regclass;

   select conname, contype, pg_get_constraintdef(oid)
   from pg_constraint where conrelid = 'public.profiles'::regclass;

   select policyname, roles, cmd, qual, with_check
   from pg_policies where schemaname = 'public' and tablename = 'profiles';

   select grantee, column_name, privilege_type
   from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'profiles'
     and grantee in ('anon', 'authenticated')
   order by grantee, column_name, privilege_type;
   ```

Esperado: RLS y FORCE RLS true; UNIQUE sobre username_key; CHECK de formato y reservados; políticas de lectura pública y escritura propia; INSERT sobre id/username y UPDATE solo sobre username para authenticated. La tabla no contiene columnas privadas.

La migración es reproducible sobre un proyecto sin esta tabla; deliberadamente no es un script para ejecutar repetidamente ni utiliza IF NOT EXISTS que pueda ocultar un esquema incompatible.

## Usuarios ya registrados

No hay backfill, trigger sobre auth.users ni nombres asignados a partir del correo o Google. Los usuarios existentes conservan su sesión y datos Auth. La primera vez que abran Mi perfil elegirán un nombre; hasta entonces no tienen fila en profiles y pueden explorar el catálogo. Las sesiones heredadas que la FASE 2A conserva reciben el mismo tratamiento.

No rellenes perfiles con usernames derivados de correos ni confíes en user_metadata para reservar nombres o decidir permisos. Un usuario puede editar esos metadatos.

## Verificación real

1. Aplica primero la migración en un proyecto de ensayo. Usa las variables públicas existentes de `.env.example` apuntando a ese proyecto; nunca una service_role o clave secreta en VITE_*.
2. Ejecuta `npm ci` y `npm run dev -- --port 5173`. Utiliza `http://localhost:5173`, una dirección que la FASE 2A ya autoriza. Mantén sus ajustes de Google y Supabase; si el proyecto de ensayo no está configurado, sigue la sección OAuth del README.
3. En un contexto de navegador limpio, entra con Google. Debe aparecer bienvenida con nombre vacío y avatar predeterminado. Prueba nombres cortos, caracteres no admitidos y ADMIN: deben rechazarse.
4. Guarda un nombre válido. Comprueba que hay una fila con el UUID correcto en Table Editor y que no hay datos privados. Recarga y cierra/vuelve a abrir sesión: Mi perfil conserva el nombre y no repite bienvenida.
5. Cambia el nombre en Mi perfil; recarga y confirma el nuevo valor en Supabase. Cambia únicamente su combinación de mayúsculas: debe funcionar para el mismo usuario.
6. Usa otra cuenta Google en otro contexto. Intenta reservar el mismo nombre con distinta capitalización: debe mostrarse ocupado, conservando el formulario y el perfil anterior si lo hay. Puedes enviar el mismo nombre desde ambos contextos a la vez: solo una escritura debe ganar.
7. Comprueba RLS con llamadas REST autenticadas con el JWT de cada usuario de ensayo: un INSERT con el UUID ajeno falla; un PATCH del username ajeno no modifica filas; un PATCH de id y un DELETE están denegados. Usa solo cuentas de ensayo, evita registrar JWTs y no uses service_role, que omite RLS. Puedes inspeccionar la petición legítima de guardado en Network y reproducirla cambiando únicamente id en su filtro o cuerpo.
8. En DevTools, bloquea temporalmente las peticiones a `/rest/v1/profiles`: la carga muestra error con Reintentar y un guardado fallido no anuncia éxito. Desbloquea y reintenta. No debe aparecer contenido interno del error de Supabase.
9. Sin sesión, abre catálogo, ficha y episodio; la navegación pública continúa funcionando. Comprueba Mi perfil y bienvenida en móvil y escritorio.

La nueva rama no se añade a la lista de dominios OAuth: no intentes verificar Google en una URL de preview de FASE 2B. Usa localhost o el dominio de producción ya autorizado cuando este cambio llegue allí por el proceso habitual. No se modifica la allowlist ni se solicita desplegar esta PR.

## Pruebas automatizadas y sus límites

- `npm test`: pruebas existentes, validación, errores, contrato REST y ejecución de la migración con **PostgreSQL real en WASM (PGlite)**. Se prueban RLS bajo roles anon/authenticated, modificación ajena, UUID inmutable, DELETE denegado, columnas públicas, reservados, FK, UNIQUE y persistencia tras reiniciar el motor. Dos escrituras enviadas simultáneamente comprueban que una gana; PGlite serializa su conexión, así que no sustituye una prueba de dos conexiones remotas concurrentes.
- `npm run test:e2e`: navegador en móvil y escritorio, Google/callback existentes, bienvenida, persistencia tras recarga, edición, errores, privacidad, accesibilidad y catálogo público.
- `npm run test:e2e:worker`: la misma suite contra la compilación servida por Wrangler en local, sin desplegar. Si el entorno restringe escritura en el directorio de configuración, usa `XDG_CONFIG_HOME=$PWD/work/config npm run test:e2e:worker`.
- `npm run build`: TypeScript y compilación de producción.

Los E2E interceptan Auth y REST de Supabase con fixtures de servidor por prueba: comprueban el flujo y que se lee/escribe REST, sin contactar el proyecto remoto. No simulan perfiles en localStorage. Solo se usa localStorage para la sesión Auth existente, como hace el SDK Supabase. La verificación real de Google y Supabase queda cubierta por los pasos manuales anteriores y debe hacerse antes de publicar.
