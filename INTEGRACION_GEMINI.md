> **Versión actual: V3.** La guía vigente es [AGENTE_V3_INSTALACION.md](AGENTE_V3_INSTALACION.md). Las restricciones antiguas de chatbot de solo lectura y períodos limitados se ampliaron en V3. Este documento se conserva como referencia de las funciones originales.

# Integración Gemini — Farmacia La Salud

Este proyecto incluye clasificación, informes y un chatbot. Para el chatbot y las nuevas validaciones consulta **[CHATBOT_IA.md](CHATBOT_IA.md)**.

Este proyecto ya incluye la integración. Para activarla en tu despliegue debes ejecutar el SQL incluido, configurar tu API key y subir estos cambios a tu repositorio conectado con Vercel.

## 1. Preparar Supabase

En tu proyecto de Supabase abre **SQL Editor → New query**, copia el contenido de `supabase/IA_GEMINI.sql` y pulsa **Run**. El script puede ejecutarse de nuevo.

Crea dos tablas nuevas y las funciones de control de uso:

- `ia_informes_demanda`: informes guardados después de la revisión humana. Cada usuario solo consulta sus propios informes. Conserva texto original, texto revisado, modelo y datos usados.
- `ia_uso_diario`: contador interno de intentos de consulta.
- `ia_reservar_consulta()`: máximo 30 intentos por usuario al día (zona horaria de Guatemala) y una consulta cada 10 segundos. El contador es persistente y se comparte entre instancias de Vercel. Los intentos fallidos ante Google también consumen este límite local.

No necesita una service role key. Se usa la sesión del usuario y los permisos existentes de Supabase. La nueva tabla no permite actualizar ni eliminar informes desde el cliente. La tabla `sugerencias_ia` que aparece en el inicio se deja intacta porque el ZIP no incluye su definición SQL; los informes se guardan en `ia_informes_demanda` y se consultan en Reportes.

La base debe conservar las estructuras que tu aplicación ya usa:

- `categorias`: `id`, `nombre`.
- `v_resumen_demanda`: `producto_id`, `producto`, `stock_actual`, `stock_minimo`, `vendidos_30_dias`.

La vista debe calcular ventas válidas de los últimos 30 días y excluir pedidos anulados. El ZIP no contiene su definición: compruébala en Supabase. No se recrean vistas ni se modifica tu esquema de productos/pedidos. Las políticas RLS existentes deben permitir al usuario consultar esas categorías y ese resumen. Revisa también que las vistas respeten los permisos que deseas para cada rol; el nuevo endpoint no eleva privilegios.

## 2. Obtener tu API key

1. Abre https://aistudio.google.com/api-keys e inicia sesión con tu cuenta de Google.
2. Crea o selecciona un proyecto y genera una API key para Gemini.
3. En Google AI Studio revisa los modelos y la cuota gratuita disponibles **para ese proyecto**.
4. Guarda la clave directamente en Vercel; no la agregues a archivos que subas a GitHub ni al navegador.

La API utiliza la cuota del proyecto de Google asociado a la clave. Los límites de tu cuenta de la aplicación Gemini y los de la API no son intercambiables. No se puede prometer una cantidad fija de consultas gratuitas: depende del modelo y la cuota que muestre Google. El código no activa facturación ni cambia a un modelo de pago cuando se agota la cuota; muestra un mensaje de error. Si tu proyecto ya tiene facturación habilitada, sus condiciones de cobro siguen aplicándose.

## 3. Configurar Vercel

En **tu proyecto → Settings → Environment Variables**:

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Conserva la URL de Supabase que ya utilizas. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Conserva la clave pública de Supabase que ya utilizas. |
| `GEMINI_API_KEY` | Tu clave de Google AI Studio. Solo servidor. |
| `GEMINI_MODEL` | Identificador del modelo de texto habilitado en tu proyecto, por ejemplo `gemini-3.5-flash-lite` si aparece disponible en tu cuota gratuita. |

Configura Production y también Preview si usarás despliegues de prueba. No antepongas `NEXT_PUBLIC_` a la clave Gemini. No hace falta instalar un SDK nuevo: se usa la API REST desde el servidor.

Sube el código modificado al repositorio conectado con Vercel. Si descomprimes este ZIP, copia **el contenido de `farmacia-frontend-main` en la raíz de tu repositorio**, conservando tu configuración de despliegue. Después realiza un nuevo despliegue (**Deployments → Redeploy**, o un commit que dispare el despliegue). Cambiar variables no modifica los despliegues que ya estaban construidos.

Para ejecutar localmente, copia `.env.example` a `.env.local`, coloca tus valores y ejecuta `npm ci` y `npm run dev`. La aplicación puede ejecutarse en tu equipo para desarrollo; el modelo siempre se consume en Google, no se instala localmente.

## 4. Clasificar un producto

1. Inicia sesión y abre **Productos**.
2. Agrega o edita un producto; escribe nombre y, de preferencia, descripción.
3. Pulsa **Sugerir categoría con IA**.
4. Lee la categoría y el motivo. Solo se aceptan categorías existentes en Supabase.
5. Pulsa **Confirmar categoría en el formulario** o **Descartar**.
6. Revisa el formulario y pulsa **Agregar** o **Guardar cambios** para persistirlo.

Pedir una sugerencia no modifica el producto. Confirmar la sugerencia únicamente rellena la categoría; el guardado normal sigue siendo necesario. Si cambias nombre o descripción, la sugerencia anterior deja de mostrarse. La IA no decide el requisito de receta, precio ni stock. Los mensajes de Gemini se tratan como texto, no como HTML.

## 5. Redactar una predicción de demanda

1. Abre **Reportes → Predicción de demanda con Gemini**.
2. Elige un producto y un horizonte de 7, 14 o 30 días.
3. Pulsa **Generar borrador con IA**.
4. Revisa el nombre, las ventas reales en 30 días, el stock y la estimación.
5. Lee y corrige el texto si lo necesitas.
6. Marca **Revisé el texto y los datos...** y pulsa **Guardar informe confirmado**.
7. Consulta los resultados en **Mis últimos informes confirmados**.

Sin confirmación no se guarda el informe. Generar o descartar un borrador no inserta informes. No crea pedidos ni cambia existencias.

### Método y límites

La estimación numérica se calcula en el servidor con los datos de Supabase:

`unidades estimadas = techo(vendidos_30_dias / 30 × horizonte_dias)`

Ejemplo ilustrativo: 15 unidades en 30 días → 4 unidades estimadas para 7 días. El modelo redacta la explicación con esa base; no se le pide inventar una predicción numérica. Si las ventas son cero, se muestra **datos insuficientes** en lugar de garantizar demanda cero. Si faltan datos o falla la consulta, se informa el error sin sustituirlos por datos ficticios.

Es una proyección sencilla del ritmo reciente, no un modelo estadístico entrenado. No permite afirmar tendencias, estacionalidad ni intervalos de confianza. Los días sin stock pueden haber ocultado demanda. La redacción de un modelo puede contener errores: el vendedor debe revisar las cifras y el texto antes de confirmar.

Se envían a Google únicamente el nombre y la descripción para clasificación, el catálogo de categorías, o los indicadores agregados del producto para demanda. El chatbot además envía tu pregunta y los últimos seis mensajes para interpretar la intención; evita escribir datos personales o claves. No consulta tablas de usuarios o clientes ni envía pedidos individuales a Gemini. El contador registra uso automáticamente; no representa un guardado comercial ni una confirmación del vendedor.

## 6. Verificación

Ejecuta:

```bash
npm ci
npm run build
npx tsc --noEmit
node --test tests/ia.test.cjs tests/chat.test.cjs
npx eslint components lib/ia utils/supabase/server.ts utils/consultar-ia.ts app/api/ia
```

Las pruebas automáticas usan respuestas simuladas; no consumen tokens. Cubren validación, cálculo, autenticación, origen, cuota, lectura de datos reales del servidor, rechazo de categorías inexistentes, respuesta incompleta y errores de Google. `npm run build` genera los tipos de Next.js antes del chequeo TypeScript.

Prueba manual tras desplegar:

- Sin sesión, una consulta de IA debe rechazarse.
- En Productos, descarta una categoría y comprueba que no cambia nada; confirma otra y verifica que no se persiste hasta pulsar Guardar.
- En Reportes, compara las cifras con `v_resumen_demanda` y confirma un informe; vuelve a abrir el historial para verlo.
- Descarta otro borrador y comprueba que no aparece en el historial.
- Edita el texto y observa que debes volver a marcar la confirmación.
- Usa un producto sin ventas y verifica el mensaje de datos insuficientes.
- Comprueba que una consulta no altera existencias ni genera un pedido.

No se ha utilizado tu API key, no se ejecutó SQL en tu cuenta y no se cambió tu despliegue de Vercel. La conexión de extremo a extremo requiere que completes los pasos 1 a 3.

## Errores frecuentes

| Mensaje | Acción |
| --- | --- |
| Falta configurar Gemini | Agrega ambas variables y vuelve a desplegar. |
| No se pudo verificar el límite de IA | Ejecuta el SQL incluido en el proyecto correcto y revisa permisos. |
| Google rechazó la API key | Comprueba clave, restricciones y proyecto asociado. |
| Modelo no disponible | Ajusta `GEMINI_MODEL` a un modelo de texto disponible en tu proyecto y vuelve a desplegar. |
| Gemini alcanzó su cuota | Espera y revisa límites en Google AI Studio. No hay reintentos automáticos. |
| Límite de IA local | Espera 10 segundos entre consultas; el límite diario es de 30 intentos por usuario. |
| Error en v_resumen_demanda | Revisa la vista, sus columnas y los permisos de tu usuario. |
| Error al guardar informe | Verifica `ia_informes_demanda`, el SQL y la sesión del usuario. |

Referencias oficiales: [API Gemini](https://ai.google.dev/api/generate-content), [salidas estructuradas](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [precios y cuota](https://ai.google.dev/gemini-api/docs/pricing), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
