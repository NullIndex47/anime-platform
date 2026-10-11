# Moderación de nombres · segunda migración de FASE 2B

La primera migración `20261011210000_profiles.sql` ya está aplicada: **no se cambia ni se vuelve a ejecutar**. Esta entrega no ejecuta SQL remoto, no borra/recrea la tabla, no cambia perfiles automáticamente y no modifica Google OAuth, catálogo, episodios ni reproductor.

## Reglas y mensajes

La fuente de reglas es `src/data/username-moderation.json`, agrupada por insultos en español e inglés, contenido sexual explícito, odio/discriminación y suplantación de personal. Incluye variantes ortográficas concretas. El frontend usa esos datos y el SQL se genera desde la misma fuente, con comprobación automática para evitar diferencias.

El filtro considera palabras completas, segmentos entre guiones bajos y combinaciones de segmentos completos. Los tramos de letras individuales se reúnen antes de comparar: detecta una palabra dividida letra a letra sin buscar fragmentos arbitrarios dentro de una palabra normal. Admite mayúsculas, sustituciones comunes de dígitos por letras (incluidas las dos interpretaciones de 1), números decorativos al principio/final, repeticiones adicionales y adornos x/xx. No altera el nombre almacenado ni la clave de unicidad.

La comparación exige conservar como mínimo las repeticiones de la palabra original, evitando que al quitar letras se confundan nombres legítimos. No utiliza distancia de edición indiscriminada, búsquedas generales de subcadenas ni una lista de palabras mostrada al usuario. Nombres como Scunthorpe, Assassin, Canal_Arte, Computadora, Penelope, Niger, Fagot, Kike y Dick se prueban como permitidos. Yoru_Fan sigue permitido; los nombres que atribuyen una condición oficial o de personal se rechazan.

La lista es una política acotada, no un clasificador de intención ni una garantía contra todas las evasiones posibles. Puede haber ambigüedad en nombres completos o segmentos concretos, y nuevas expresiones deben añadirse con ejemplos legítimos que no deban bloquearse. No se deduce que un usuario pertenezca a un colectivo a partir de su nombre.

La interfaz valida al escribir y al guardar. El error de moderación es genérico: «Este nombre no cumple las normas de YORU. Elige otro nombre de usuario». Los errores PostgreSQL tampoco muestran palabras prohibidas ni detalles internos.

El formato de 3–20 caracteres ASCII, los reservados anteriores, UNIQUE sin distinguir mayúsculas, RLS y los permisos de columnas se conservan. Un CHECK adicional llama a una función SQL IMMUTABLE, SECURITY INVOKER y con search_path vacío. No lee tablas ni concede permisos administrativos; el usuario autenticado puede ejecutar la función pero no modificarla. Las peticiones REST directas no pueden saltarse el CHECK.

## Antes de aplicar: revisión de solo lectura

1. Confirma el proyecto de Supabase y conserva tu procedimiento habitual de copia de seguridad.
2. Abre **SQL Editor** y ejecuta completo `supabase/reviews/username_moderation.sql`. Es un SELECT: no crea funciones ni modifica tablas. Utiliza las mismas reglas de la segunda migración.
3. Si devuelve filas, revisa sus identidades públicas (UUID y username) en un contexto privado de operación. No publiques esa lista ni los términos encontrados.
4. **No ejecutes aún la segunda migración si hay filas pendientes.** Resuelve cada caso de forma deliberada, por ejemplo solicitando al titular que elija otro nombre desde Mi perfil. La aplicación no envía solicitudes a usuarios ni asigna nombres sustitutos automáticamente. Si detectas un falso positivo, ajusta las reglas, añade su prueba legítima y regenera los archivos antes de aprobar la migración.
5. Repite el SELECT hasta que no devuelva filas.

No he revisado los nombres del proyecto remoto: esta revisión corresponde a quien aplique la migración desde SQL Editor.

## Aplicación incremental desde SQL Editor

1. Con la revisión vacía, pega y ejecuta **solo** `supabase/migrations/20261011230000_username_moderation.sql`, completo, una vez.
2. La transacción bloquea temporalmente escrituras en profiles, crea la función y vuelve a revisar todos los nombres **antes** de añadir la restricción. Así no hay una ventana entre la revisión y la imposición en la que pueda entrar un nombre incompatible.
3. Si encuentra filas incompatibles, se aborta sin cambiar nombres ni imponer el CHECK. El error indica únicamente la cantidad, sin mostrar los nombres. Ejecuta `ROLLBACK;` si el editor deja la transacción abierta, y vuelve al SELECT de revisión. La función y cualquier DDL de esa transacción también se revierten.
4. Si todo es compatible, añade `profiles_username_moderation` y la valida dentro de la misma transacción. No usa NOT VALID como solución permanente ni deja filas antiguas exentas.
5. Si no obtiene el bloqueo en 5 segundos o una instrucción supera 60 segundos, falla sin dejar cambios parciales. Tras ROLLBACK, reintenta en una ventana adecuada; para tablas grandes revisa el procedimiento y el límite antes de ejecutarlo.
6. Registra la segunda migración como aplicada. No repitas la primera y no uses DROP TABLE, DELETE masivo ni renombrados automáticos para resolver conflictos. Una repetición accidental de esta migración falla y se revierte; no sustituye objetos ya existentes.

Verificación de solo lectura después de aplicarla:

```sql
select conname, convalidated, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.profiles'::regclass
order by conname;

select relrowsecurity, relforcerowsecurity
from pg_class where oid = 'public.profiles'::regclass;

select policyname, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'profiles';
```

Esperado: CHECK de moderación con convalidated = true, UNIQUE original y los CHECK anteriores presentes, RLS/FORCE RLS true y las tres políticas anteriores intactas. Ejecuta de nuevo el SELECT de revisión: debe estar vacío. Prueba en Preview el rechazo inmediato, un nombre legítimo, edición y persistencia. Para comprobar el servidor utiliza cuentas de ensayo y JWTs de usuario con REST; no service_role, no desactives RLS y no registres tokens.

## Ampliación y pruebas

Antes de aplicar esta segunda migración:

1. Edita las categorías de `src/data/username-moderation.json`; los términos son ASCII en minúsculas, sin expresiones regulares arbitrarias.
2. Añade casos prohibidos, variantes y nombres legítimos a `src/services/username-moderation.fixtures.ts`.
3. Ejecuta `npm run moderation:generate`. Genera la segunda migración y su SELECT de revisión.
4. Ejecuta `npm test`, `npm run build` y `npm run test:e2e:worker`. El test comprueba también que los archivos generados estén actualizados.

**Una vez aplicada la segunda migración, se congela también ese archivo.** Las ampliaciones posteriores deben generar una migración nueva que reemplace la función con las reglas nuevas, ejecute primero su auditoría bajo bloqueo y vuelva a validar el CHECK sobre todas las filas. No regeneres y reapliques una migración histórica. Un CHECK que llama a una función no vuelve a escanear filas automáticamente al cambiar la función; debe incluirse la revisión y una validación efectiva en la nueva migración.

Las pruebas locales ejecutan PostgreSQL mediante PGlite: verifican que la auditoría detecta filas antiguas, la transacción se revierte y conserva perfiles, se puede aplicar tras una corrección revisada, el CHECK queda validado, los INSERT/UPDATE directos rechazan variantes y los resultados coinciden con el frontend. También se comprueban RLS y UNIQUE originales. Los E2E usan respuestas REST controladas: verifican la experiencia inmediata, alta, edición, errores y recarga; no ejecutan SQL en Supabase.
