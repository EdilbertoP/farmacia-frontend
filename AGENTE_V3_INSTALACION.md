# Farmacia La Salud — Agente V3

Esta versión amplía el chatbot de consultas a un agente que prepara y ejecuta operaciones de los módulos existentes, con validación, permisos, revisión humana, transacciones e historial. Se conserva `gemini-3.5-flash-lite`.

## Instalación en tu proyecto actual

1. Descomprime el ZIP. Sube **el contenido de `farmacia-frontend-main`** a la raíz del repositorio conectado a Vercel, respetando las carpetas. Incluye `package.json` y `package-lock.json`; hay una dependencia de desarrollo para pruebas PostgreSQL.
2. En Supabase → SQL Editor ejecuta **`supabase/IA_INSTALACION_COMPLETA.sql`**. Este archivo contiene los scripts de IA anteriores y la ampliación V3. No necesitas ejecutar además los individuales. Puede ejecutarse de nuevo sin borrar propuestas o informes.
3. Conserva tus variables de Supabase y configura en Vercel:

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Tu URL actual de Supabase. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Tu clave pública actual. |
| `GEMINI_API_KEY` | Tu clave real, exclusivamente del servidor. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |

4. Realiza un nuevo despliegue. Inicia sesión y abre **Asistente IA → Conexión y uso de IA → Comprobar conexión**.
5. Prueba con una cuenta administradora y otra vendedora. La lista de preguntas rápidas y acciones depende de las capacidades devueltas por el backend.

No se requieren nuevas claves de servicio de Supabase ni credenciales PostgreSQL en el modelo. Esta entrega no ha ejecutado SQL ni desplegado cambios en tu cuenta.

### Requisitos del esquema que ya utiliza tu aplicación

La ampliación se basa en los campos presentes en el ZIP y en estas interfaces originales:

- `productos`: id numérico, código, nombre, descripción, categoría, precio, stock, mínimo, requiere receta y activo.
- `categorias`: id y nombre.
- `pedidos` y `pedido_detalle`: id, estado, total, fecha y detalles con producto, cantidad, precio y subtotal.
- `rol_actual()`: identidad/rol derivado de la sesión autenticada.
- `app_registrar_movimiento(p_producto_id, p_tipo, p_cantidad, p_motivo)`.
- `app_registrar_pedido(p_cliente_nombre, p_items)`.
- `app_anular_pedido(p_pedido_id, p_motivo)`.
- Las vistas de inventario y demanda que ya usa el proyecto.

El código SQL llama los procedimientos comerciales existentes; no reimplementa el descuento de stock ni su anulación. Usa identificadores/cantidades enteras, textos y detalles JSONB. Si tu backend tiene otras firmas o nombres de columnas, el equipo de backend debe adaptar estas llamadas. Cuando la firma no existe, la confirmación falla sin aplicar parcialmente el negocio. No se proporcionó la definición original de esos procedimientos ni acceso a tu base; la prueba SQL incluida utiliza un esquema de referencia compatible con los campos del proyecto.

## Qué cambia en la interacción

Ejemplo: **“Cambia el precio del producto ALC-01 a Q22.00”.**

1. Gemini extrae la intención y el cambio; el backend identifica el producto real y comprueba la herramienta permitida.
2. El chat muestra un **borrador editable**, todavía sin aplicar.
3. Pulsa **Validar y preparar propuesta**. PostgreSQL valida los datos y guarda una propuesta pendiente de revisión, con una instantánea del registro.
4. Revisa **Cambios propuestos** y los valores anteriores. Puedes corregir el formulario.
5. Si editas, debes pulsar **Actualizar vista previa**. Se genera una nueva revisión y se desmarca la confirmación anterior.
6. Marca **Revisé los datos y confirmo esta versión exacta**.
7. Pulsa **Confirmar operación**. El backend vuelve a comprobar permisos, revisión, caducidad, datos y existencias, bloquea los registros y ejecuta la transacción.
8. El chat solo comunica éxito tras leer el resultado confirmado por PostgreSQL. Añade un mensaje de estado verificado a la conversación para conservarlo al recargar; los detalles y la versión actual se consultan en Historial del agente. Las pantallas convencionales abiertas se actualizan mediante un evento de datos actualizados.

Las propuestas pendientes caducan a los 20 minutos. Un registro modificado desde otra pantalla provoca un conflicto: debe actualizarse la vista previa y aprobarse su nueva versión. Una propuesta ejecutada devuelve su resultado previo si se confirma de nuevo; no repite el movimiento ni el pedido.

Si falla la respuesta de red al confirmar, el panel consulta el estado de **la misma propuesta**. Si no logra conocerlo, bloquea el reintento y ofrece **Consultar estado**. No prepares una propuesta nueva para sustituir una operación cuyo resultado todavía es incierto.

## Corrección del alta por lenguaje natural (V3.1)

Se corrigió el caso en que Gemini devolvía `intencion=propuesta` sin `operacion` y el chat repetía «Indica qué deseas crear o modificar». El extractor tiene ejemplos explícitos y, si omite la operación, se recupera una única vez con un esquema específico. La recuperación sigue sin guardar y vuelve a pasar por los permisos y validadores del servidor. Un alta nueva no busca el nombre en el catálogo ni hereda el producto seleccionado.

Prueba con **«crea un producto llamado Gasas esteriles con 30 unidades»**. Con permiso `producto.crear` debe aparecer un borrador con el nombre, los campos pendientes y un aviso de las 30 unidades. Completa código, categoría, precio, mínimo y receta; valida, revisa y confirma el alta. El stock del producto se crea en cero. Después solicita **«Registra una entrada de 30 unidades de [código], motivo inventario inicial»** y revisa/confirma esa segunda operación. No se aplica una entrada automáticamente ni se inventa su motivo.

Esta corrección solo cambia código, pruebas y esta guía: actualiza el repositorio y despliega en Vercel. Si ya instalaste V3, no necesitas repetir la migración SQL ni cambiar las variables. El rol vendedor predeterminado no puede crear productos: prueba el alta con el administrador o con un rol al que se haya concedido explícitamente esa herramienta.

Verificación local: 44 pruebas automatizadas, incluyendo los cuatro ejemplos reportados, permisos insuficientes, confirmación de texto sin ejecución, rechazo de herramientas desconocidas y recuperación sin reservar una segunda tarea. Pruebas de extracción con respuestas de Gemini simuladas; no se usó una clave real ni se modificaron las cuentas de Supabase/Vercel.

## Operaciones del agente

| Módulo | Funciones disponibles |
| --- | --- |
| Productos | Crear, consultar, editar campos permitidos y desactivar. El precio requiere permiso adicional. |
| Categorías | Consultar, crear, renombrar y eliminar cuando no tenga productos asociados. |
| Inventario | Consultar, buscar por categoría/cantidad y registrar entradas o ajustes por conteo físico mediante el procedimiento existente. |
| Pedidos | Preparar artículos y cantidades, consultar pedidos permitidos, confirmar con precios oficiales y anular mediante la transición existente. |
| Clasificación | Sugerir categoría real y descripción; revisión antes de guardar. |
| Descripciones | Seleccionar fragmentos de información registrada o suministrada y organizarlos en una descripción conservadora. Se rechazan fragmentos que no aparecen en la fuente. |
| Análisis | Comparar períodos, agrupar ventas por categoría, observar variaciones y preparar informes. |
| Demanda | Promedio móvil definido y evaluado; distingue estimación de ventas registradas. |
| Reposición | Cantidades orientativas editables, con criterios y datos base conservados; aprobarlas guarda la propuesta, no una compra ni una entrada. |
| Historial | Propuestas propias, versiones, aprobaciones, rechazos, fallos y resultados reales. Auditoría global para usuarios con permiso. |
| Exportación | CSV de inventario actual o de un análisis propio previamente aprobado, si el usuario tiene permiso. |

Un producto nuevo comienza con stock cero: las existencias reales se registran después mediante una entrada. El agente no inventa código, precio, receta, stock mínimo o datos de lote para completar un alta. Los campos obligatorios faltantes se completan en el formulario.

Un ajuste significa **establecer el conteo físico final**, no restar una cantidad. Las peticiones de restar o retirar unidades no se convierten silenciosamente en ajustes. Usa el pedido o indica explícitamente el conteo final.

La eliminación de productos es **lógica**, conservando relaciones e historia. Los pedidos se anulan, no se borran físicamente. No hay herramienta genérica para borrar tablas o cambiar usuarios/roles.

## Ejemplos para probar

Usa los nombres/códigos que existan en tu base; los siguientes son ilustrativos.

| Petición | Qué revisar |
| --- | --- |
| Prepara el alta de Alcohol etílico 70 %, categoría Primeros auxilios, precio Q15.50 | Pide código, mínimo y requisito de receta si faltan; no los inventa. |
| Cambia el precio de ALC-01 a Q22.00 | Muestra antes/después y requiere validar y confirmar una revisión. |
| Desactiva ALC-01 | Conserva el producto histórico y cambia activo a falso tras confirmar. |
| Crea una categoría llamada Accesorios | Prepara una categoría; comprueba duplicados. |
| Renombra la categoría Accesorios a Accesorios de higiene | Permite seleccionar el registro y confirmar el nuevo nombre. |
| Elimina la categoría Accesorios de higiene | Solo si no tiene productos asociados. |
| Registra una entrada de 5 unidades de ALC-01, motivo compra recibida | Vista previa de stock final y registro mediante el procedimiento original. |
| Ajusta ALC-01 a un conteo físico de 8, motivo conteo verificado | Cantidad final, no incremento. |
| Prepara un pedido con 2 ALC-01 y 1 JAB-01 | Usa precios de la base, valida stock, muestra total; no descuenta hasta confirmar. |
| Anula el pedido 15, motivo devolución autorizada | Solo la transición de anulación habilitada por el negocio y el rol. |
| Productos de Primeros auxilios con menos de 10 unidades | Aplica ambos filtros a datos reales. |
| Productos de Cuidado personal con mayor stock | Ordena el catálogo filtrado. |
| Compara ventas de este mes con el mes anterior | Muestra fechas exactas y variaciones calculadas; base cero → porcentaje no calculable. |
| Ventas de la semana pasada | Período lunes a domingo de Guatemala. |
| Analiza las ventas por categoría del último trimestre | Resultados agregados por categorías reales. |
| Pronostica la demanda de ALC-01 para el próximo mes | Calcula las fechas del próximo mes y muestra método, suficiencia y MAE. |
| Prepara una propuesta de reposición | Prioriza cantidades calculadas; puedes editarlas y guardar la propuesta revisada. |
| Genera un informe de ventas de esta semana | Datos calculados separados de la interpretación y del formulario de aprobación. |
| Redacta una descripción de este producto sin inventar propiedades | Solo se admiten fragmentos presentes en los datos fuente. |
| Qué productos tienen lotes próximos a vencer | Informa que no hay módulo de lotes habilitado; no inventa fechas. |

## Permisos

La tabla **`ia_permisos`** es la configuración de autorización del agente, administrada por el propietario de la base. El navegador y Gemini no pueden modificarla. `rol_actual()` sigue siendo la fuente del rol autenticado.

Configuración inicial:

| Herramientas | Administrador | Vendedor |
| --- | --- | --- |
| Catálogo y existencias | Sí | Sí |
| Consulta de pedidos autorizados | Sí | Sí, con los permisos de datos existentes |
| Crear pedido confirmado | Sí | Sí |
| Cambiar productos, precios, categorías e inventario | Sí | No |
| Anular pedidos | Sí | No |
| Análisis globales de ventas | Sí | No por defecto |
| Guardar análisis revisados | Sí | Sí, si dispone de un resultado permitido |
| Exportar informes | Sí | No por defecto |
| Auditoría global | Sí | No |

Los permisos se pueden ampliar por herramienta editando la configuración desde una sesión administrativa de la base; no hay una herramienta conversacional para concederlos. La comprobación del cliente es de presentación; la del backend y la función SQL es obligatoria y se repite al confirmar. Un rol desconocido no obtiene permisos por omisión.

Las funciones SQL de modificación son una puerta de autorización explícita con `SECURITY DEFINER`, búsqueda de esquemas acotada y operaciones estáticas. No conceden acceso general a tablas ni aceptan SQL. Debe revisarlas el responsable del backend junto con los permisos y procedimientos existentes antes de usarlas en producción. Las consultas ordinarias siguen ejecutándose con la sesión del usuario y las políticas de datos de Supabase.

## Estadística, interpretaciones y limitaciones

Las fechas relativas usan **America/Guatemala**. Se admiten hoy, ayer, semana actual/anterior, mes actual/anterior, trimestre actual/anterior y últimos 7/30/90 días. Los últimos tres meses se muestran como ventana de 90 días; trimestre anterior es un trimestre calendario. Las comparaciones aclaran que el período actual puede estar incompleto.

El pronóstico nuevo usa **promedio móvil de cuatro semanas completas**, sobre hasta doce semanas previas. Por defecto consulta los últimos 90 días; si se indica un período histórico admitido, utiliza ese período y cierra las semanas completas en el final de dicha historia, sin inventar ceros después. Se muestra la antigüedad del final de la historia cuando no llega hasta hoy. Se exige que la primera venta observada tenga al menos ocho semanas y que haya ventas en al menos cuatro fechas distintas. Si no cumple, no se inventa una cantidad futura.

La evaluación calcula **MAE semanal** en cuatro predicciones sucesivas: cada predicción usa solo las cuatro semanas anteriores a la semana evaluada. No es un intervalo de confianza ni una garantía de exactitud futura. La proyección se escala al horizonte, incluido el número real de días del próximo mes.

La reposición sugerida es `max(0, pronóstico + mínimo - stock actual)`. Sin pronóstico suficiente solo se propone cubrir `max(0, mínimo - stock)`, identificándolo como alerta de mínimo y no como predicción. Se conserva la base calculada y, por separado, las cantidades propuestas editadas. Si cambió el stock usado para la reposición, se exige generar un nuevo análisis.

No hay historia completa de días sin stock, tiempos de proveedores, compras pendientes, estacionalidad ni lotes. Estas limitaciones se muestran en los resultados. Las cifras proceden del backend; la interpretación redactada por Gemini tiene una etiqueta independiente. Si falla la redacción secundaria, los resultados calculados se conservan y pueden revisarse. Las explicaciones con cifras nuevas o afirmaciones causales detectadas sin sustento se descartan.

La proyección sencilla de la pantalla Reportes anterior se conserva y está etiquetada con su fórmula de ritmo de 30 días. El pronóstico con evaluación se solicita en el agente con **pronóstico/demanda de los últimos tres meses**. No se presenta el LLM como un motor estadístico.

## Módulos condicionados y límites

Esta versión **no instala proveedores, clientes, compras, lotes, subcategorías, unidades de inventario variables ni Redis**, porque sus modelos y reglas no estaban en el proyecto recibido. La especificación condiciona esas funciones a que existan los módulos. El agente informa la ausencia cuando se solicitan proveedores o vencimientos; no simula una integración.

La clasificación operativa usa categorías reales y descripción. No guarda subcategorías, unidades, palabras clave o etiquetas en columnas inexistentes. Para ampliarlo, primero deben definirse sus catálogos, relaciones y reglas con el equipo de backend.

Las consultas críticas van a PostgreSQL. Como no se lee caché, esta versión no requiere invalidar Redis. Si se conecta Redis más adelante, se deberá agregar invalidación posterior al commit y un mecanismo de recuperación que no revierta una venta confirmada.

Continúan los límites de tamaño, las lecturas por páginas y el máximo de 5000 productos/pedidos por consulta de análisis. Los listados muestran hasta 20 filas y las coincidencias hasta ocho opciones. Se indican límites; no se declara un total parcial como completo. Fechas arbitrarias, comparaciones no contempladas y operaciones de módulos ausentes se aclaran o rechazan.

## Auditoría y funcionamiento sin IA

`ia_propuestas` conserva herramienta, datos, instantánea anterior, versión, estado, resultado, usuario y fechas. Los estados son **pendiente**, **ejecutada**, **rechazada** y **fallida**. Una propuesta generada o aprobada no se interpreta como una compra ni como existencias nuevas.

`ia_eventos` registra solicitudes, resultados, errores seguros, duración, consumo de tokens cuando Google lo devuelve, propuestas, revisiones, confirmaciones/rechazos y cambios ejecutados. El cambio de descripción también tiene un trigger de auditoría para los formularios convencionales. No se guardan conversaciones completas en esta tabla. El administrador debe establecer la política de retención acorde con el proyecto; no se borra auditoría automáticamente.

Los tokens se suman para los pasos que el proveedor informa. El límite local sigue siendo de 30 solicitudes/tareas por usuario y día y 10 segundos entre tareas; algunas tareas analíticas utilizan una llamada para interpretar y otra para redactar. Si Gemini omite la operación de una propuesta, se realiza como máximo una segunda extracción con esquema obligatorio; cuenta en los tokens del proveedor, pero no reserva otra tarea local. La cuota del proveedor se aplica a todas las llamadas, además del límite local. No se activa facturación ni se cambia de modelo automáticamente.

Las claves se mantienen en Vercel. Se rechazan patrones de API keys y JWT en los datos antes de enviarlos al modelo. Las preguntas, descripciones y textos externos se tratan como datos no confiables; la salida del modelo solo puede proponer herramientas y campos de una lista permitida.

Los endpoints de preparar/revisar/confirmar/consultar estado y exportar **no requieren Gemini**, por lo que se puede finalizar una propuesta ya revisada aunque el proveedor falle. Los formularios tradicionales y sus procedimientos originales siguen disponibles. Nunca se revierte una operación confirmada por un fallo posterior de IA.

## Validación realizada y prueba en tu cuenta

```bash
npm ci
npm run build
npm test
npx tsc --noEmit
```

Se incluyeron pruebas de entradas, ambigüedad, contexto firmado, roles, filtros, períodos, pronóstico, descripciones, claves y propuestas. La prueba PostgreSQL usa PGlite con un esquema de referencia: verifica instalación repetida, CRUD, confirmaciones duplicadas, versión antigua, conflictos, reversión de operaciones compuestas y auditoría. Las pruebas de Gemini usan respuestas simuladas y no consumen tu cuenta.

La interfaz se probó con datos simulados en escritorio y móvil, incluyendo edición que invalida la confirmación y recuperación de una respuesta perdida sin doble ejecución. La compatibilidad con tus procedimientos reales y las políticas de tu Supabase deben comprobarse después de instalar la migración. Empieza con registros de prueba para validar las operaciones del proyecto antes de usar datos operativos.

Consulta también **MATRIZ_REQUISITOS_V3.md** para relacionar los requisitos con los archivos y sus límites.
