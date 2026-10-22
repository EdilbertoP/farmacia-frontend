# Asistente IA de Farmacia La Salud

## Activación de esta versión

1. Sube el contenido de la carpeta del ZIP a la raíz de tu repositorio de GitHub, respetando las rutas. No subas el ZIP como archivo ni agregues una carpeta exterior extra.
2. En Supabase → SQL Editor ejecuta **la versión actualizada de `supabase/IA_GEMINI.sql`**. Es idempotente: conserva los informes existentes y agrega `ia_estado_uso()` para el indicador de consultas disponibles.
3. Conserva tus dos variables públicas de Supabase en Vercel. Configura:

| Nombre | Valor |
| --- | --- |
| `GEMINI_API_KEY` | Tu clave real de Google AI Studio, solo en Vercel. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |

4. Aplica las variables a Production y Preview y realiza un nuevo despliegue con el código actualizado.
5. Inicia sesión. Verás **Asistente IA** en la esquina inferior derecha de las páginas de gestión.

Si no defines `GEMINI_MODEL`, el servidor utiliza `gemini-3.5-flash-lite`. Respeta cualquier otro modelo que configures explícitamente; no cambia de modelo ni de modalidad de cobro automáticamente. Los espacios exteriores y el prefijo `models/` se normalizan. Las claves vacías, de ejemplo, con comillas o espacios internos se rechazan antes de consultar Google.

## Interfaz

El botón **Asistente IA** abre un panel con:

- Cuatro preguntas rápidas: existencias, stock bajo, más vendidos y resumen del negocio.
- Campo para escribir con tus propias palabras. Enter envía; Shift+Enter agrega otra línea.
- Respuestas con cantidades verificadas, tablas desplazables, origen de datos y fecha de consulta.
- Opciones para elegir una presentación cuando el nombre es ambiguo.
- Producto en contexto, cuando abres el chat desde **Productos → Consultar IA**. Se actualiza al consultar un único producto y se limpia cuando la respuesta incluye varios, para evitar referencias ambiguas.
- Nueva conversación, cierre con Escape y navegación por teclado dentro del panel.
- Sección **Conexión y uso de IA** con el modelo y el saldo del límite local.

El panel se adapta a móvil y escritorio. En la pantalla de login no aparece. Las conversaciones de este asistente se conservan como texto en la sesión de la pestaña del navegador, separadas por usuario; se eliminan al cerrar sesión o con Nueva conversación. Después de recargar se conserva el texto y el contexto, pero las tarjetas de elección y las tablas de respuestas anteriores no se reconstruyen. Las respuestas antiguas mantienen su fecha y una nueva consulta vuelve a leer la base. No se crea un historial de chat en Supabase.

## Preguntas que entiende

Gemini extrae una petición estructurada: intención, nombres o códigos, referencia al contexto, período y horizonte. El servidor valida esos campos y ejecuta únicamente consultas programadas. El modelo no recibe acceso SQL, credenciales de Supabase ni herramientas para modificar datos.

| Pregunta | Comportamiento esperado |
| --- | --- |
| ¿Cuántas unidades hay de jabón líquido? | Busca el producto y muestra stock y precio actuales. |
| ¿Cuántos jabones quedan? | Tolera plural y tildes; pide elegir si hay varios jabones. |
| Existencias de PAR-500 | Busca por código. |
| ¿Cuánto cuesta paracetamol 500mg? | Busca esa presentación y muestra precio y existencias. |
| ¿Cuánto paracetamol hay? | Si existen varias presentaciones, presenta opciones. |
| ¿Cuántas unidades hay de este producto? | Usa el producto seleccionado o el último producto identificado; sin contexto pide nombre o código. |
| ¿Y de esos productos? | Usa la lista de la última respuesta; no elige uno arbitrariamente. |
| Stock de jabón y alcohol | Busca ambos; si alguno es ambiguo pide aclaración y conserva el resto de la petición. |
| ¿Qué productos están bajo el mínimo? | Lista los activos con stock menor o igual al mínimo. |
| ¿Cuáles están agotados? | Lista los activos con stock cero. |
| Los 5 más vendidos este mes | Ordena por unidades vendidas durante el mes actual. |
| ¿Cuánto vendimos ayer? | Totales de pedidos no anulados de ayer en Guatemala. |
| Ventas de jabón en los últimos 7 días | Unidades e ingresos del producto para ese período. |
| ¿Para cuántos días alcanza el jabón? | Cobertura orientativa usando ventas de 30 días. |
| Estima demanda de jabón para 14 días | Proyección matemática con explicación de sus límites. |
| Dame un resumen del negocio | Referencias activas, unidades actuales, stock bajo, agotados y ventas del período. |

Los ejemplos requieren que esos productos existan y sean visibles para tu usuario. El chatbot utiliza Gemini para interpretar la petición; no se basa únicamente en una lista de frases exactas. La normalización posterior admite tildes, plurales frecuentes y unidades como `500mg`/`500 mg`. Una coincidencia aproximada por errores de escritura siempre pide confirmación, incluso si solo encontró un candidato.

La interpretación puede fallar: las respuestas identifican los productos y el período utilizados para que puedas revisarlos. Si una pregunta tiene más de cinco productos, un período no admitido, una fecha personalizada o una comparación de períodos, debes concretarla. Para demanda elige 7, 14 o 30 días. Para ventas se admiten hoy, ayer, mes actual y los últimos 7, 30 o 90 días, incluyendo hoy. Las fechas se calculan en America/Guatemala.

## Datos, cálculos y confirmaciones

**Existencias:** tabla `productos`, solo activos que permita consultar la sesión actual. Incluye nombre, código, precio, stock y mínimo. No se leen registros de usuarios, clientes ni auditoría.

**Ventas:** `pedidos` y su relación `pedido_detalle`, con las columnas que tu aplicación ya usa. Se excluye `estado = 'anulado'`; se suman cantidades y subtotales. Se comprueba que el detalle visible coincida con el total del pedido; si falta información no se sustituye por cero. Los totales incluyen todos los pedidos accesibles del período; el ranking solo muestra productos activos accesibles.

**Demanda:** vista `v_resumen_demanda`. Proyección = techo(ventas de 30 días / 30 × horizonte). Cobertura = parte entera(stock / promedio diario). Sin ventas, se indican datos insuficientes. No considera estacionalidad, ventas perdidas por falta de stock ni variaciones futuras.

El chat genera las cifras y sus textos de respuesta desde resultados del servidor. Gemini extrae la petición; no inventa los números de la respuesta. Los informes redactados con Gemini de la pantalla Reportes conservan su flujo independiente de revisión y guardado.

El chat es de consulta. Para alta, edición, movimientos y pedidos dirige al vendedor a las pantallas correspondientes. Los informes siguen guardándose únicamente después de revisar y confirmar. Ni una instrucción del modelo ni una petición en el chat pueden ejecutar una escritura comercial.

## Configuración y prueba real de Gemini

Abre el panel → **Conexión y uso de IA → Comprobar conexión**.

- Ver la configuración con formato correcto no demuestra que Google acepte la clave.
- Comprobar conexión envía una petición real al modelo y valida una respuesta JSON. Solo entonces indica que la conexión fue verificada.
- La prueba gasta una consulta del límite local y utiliza la cuota de Gemini de tu proyecto.
- No se imprime ni se devuelve la API key al navegador.
- La comprobación no garantiza que la cuota esté disponible en consultas futuras.

El código distingue configuración faltante, clave inválida, permisos/restricciones, modelo no disponible, cuota de Google, tiempo agotado, servicio temporalmente ocupado, contenido bloqueado y respuesta inválida. Ofrece mensajes para corregir la configuración o reintentar. No hace reintentos automáticos ni utiliza otro modelo sin tu configuración.

Los límites locales se comparten entre clasificación, informes, interpretación de chat y pruebas de conexión: **30 intentos por usuario y día, con 10 segundos entre llamadas al modelo**. El reinicio diario usa la fecha de Guatemala. Los fallos ante Google también cuentan. Elegir una opción de una aclaración pendiente no requiere otra interpretación con Gemini ni consume otra consulta local. Los límites de Google se aplican adicionalmente.

## Contexto y controles

El contexto de conversación se firma en el servidor con HMAC, se vincula al usuario y caduca después de una hora sin renovación. No se confía en identificadores de productos que haya inventado el modelo: se resuelven contra la base y se verifican nuevamente en cada consulta. Un contexto alterado, de otro usuario o vencido requiere empezar una nueva conversación.

Las peticiones exigen sesión verificada y origen de la misma aplicación. Los cuerpos y mensajes tienen límites de tamaño; solo se aceptan intenciones y parámetros permitidos. Las consultas se ejecutan con la sesión del usuario, sin service role key, conservando los permisos de Supabase. Confirma que las políticas de tu base y las vistas permiten exactamente la información que deseas exponer a cada rol.

Las tablas se leen por páginas para evitar tomar los primeros 1000 registros como si fueran el conjunto completo. Se admiten hasta 5000 productos activos y 5000 pedidos por período. Si el resultado es mayor o incompleto, se informa y se pide reducir el período o ampliar la implementación; no se presenta un total parcial como completo. El número de filas mostrado por respuesta se limita a 20 y las opciones de una aclaración a 8.

La pregunta y los últimos seis mensajes de contexto (hasta 1200 caracteres por mensaje) se envían a Gemini para interpretación. Los resultados antiguos son contexto conversacional, no evidencia de cifras actuales. Evita escribir claves o datos personales en las preguntas. No se envían pedidos individuales a Gemini; sus totales se calculan en el servidor.

El asistente rechaza órdenes para modificar datos, compartir secretos o ejecutar SQL y redirige las preguntas médicas a un profesional. Las barreras de seguridad no dependen únicamente de que el modelo cumpla las instrucciones: el servidor solo ofrece consultas de lectura y valida la salida.

## Pruebas

```bash
npm ci
npm run build
npx tsc --noEmit
node --test tests/ia.test.cjs tests/chat.test.cjs
npx eslint components lib/ia utils/consultar-ia.ts app/api/ia app/layout.tsx
```

Las pruebas usan datos y respuestas de Gemini simulados; no consumen tu cuota ni prueban tu cuenta real. Cubren las funciones anteriores, referencias sin producto, plurales/tildes, coincidencias ambiguas y aproximadas, varios productos, contexto firmado y caducado, datos incompletos, paginación, pedidos anulados, zona horaria, límites, diagnóstico y errores seguros de Google.

Prueba manual al desplegar:

1. Comprueba la conexión real desde el chat.
2. En Productos, pulsa Consultar IA en un producto y envía la pregunta prellenada. Compara la cifra con su stock real.
3. Quita el producto del contexto e inicia Nueva conversación. Pregunta por «este producto»: debe pedir aclaración.
4. Consulta un nombre con varias presentaciones y elige una; debe usar esa presentación exacta.
5. Consulta dos productos y comprueba ambos resultados. Repite con uno ambiguo.
6. Pregunta por productos agotados y por stock bajo; compara con Inventario.
7. Consulta ventas de ayer o este mes y compara pedidos no anulados.
8. Pide eliminar un producto: debe rechazar la operación y no cambiar la base.
9. Navega a otra sección y vuelve a abrir el botón; el texto de la conversación continúa en la misma pestaña.
10. Revisa el panel desde móvil y cierra con Escape desde un teclado.

La conexión real y las políticas de tu cuenta deben verificarse después de ejecutar el SQL y desplegar. Esta entrega no modifica tu cuenta de Google, Supabase ni Vercel.
