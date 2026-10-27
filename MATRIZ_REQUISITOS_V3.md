# Matriz de alcance y aceptación — Agente V3

La matriz corresponde al esquema disponible en el proyecto, no a módulos hipotéticos. «Implementado» significa que existe código y pruebas de referencia; la conexión con la cuenta y los procedimientos reales requiere la instalación y validación descritas en AGENTE_V3_INSTALACION.md.

| Requisito | Implementación y evidencia | Alcance/límite |
| --- | --- | --- |
| Interpretar lenguaje natural | `chat-domain.ts`, `chat-engine.ts`, esquema JSON y validador | Intenciones, referencias, productos, filtros y operaciones autorizadas; no SQL libre. |
| Fuente oficial PostgreSQL | `chat-data.ts`, `agente/herramientas.ts` | Sesión autenticada, lecturas paginadas, categorías/stock/precios reales. |
| Clasificación controlada | `app/api/ia/route.ts`, `ClasificacionIA.tsx` | Categoría existente y revisión; atributos de catálogos no implementados no se inventan. |
| Formulario editable | `ClasificacionIA.tsx`, `PropuestaCard.tsx` | Revisión antes de guardar; campos oficiales faltantes se completan por el usuario. |
| Descripciones comerciales | Acciones `describir`/`descripcion` | Método conservador de fragmentos de fuente; auditoría de descripción anterior/nueva. |
| Inventario inteligente | Filtros de categoría, stock y orden; movimientos | Entradas/ajustes mediante el procedimiento comercial; no actualización directa arbitraria de stock. |
| Ventas y comparaciones | `agente/herramientas.ts` | Sumas, categorías, períodos, variaciones; porcentajes no definidos con base cero. |
| Separar historia, cálculo e IA | Etiquetas, resultados estructurados e interpretación independiente | Las causas no se infieren como hechos; se mantienen advertencias y datos de origen. |
| Pronóstico evaluable | `agente/estadistica.ts` | Promedio móvil de 4 semanas; suficiencia y MAE en ventanas temporales. |
| Reposición | Pronóstico/mínimo/stock, cantidades editables | Aprobar guarda una propuesta, no una compra; no existe módulo de compras. |
| Informes en lenguaje natural | Intención `informe`, propuesta `analisis.guardar` | Revisión, aprobación, historial y exportación CSV autorizada. |
| Búsqueda y ambigüedad | Búsqueda por código/nombre, normalización y coincidencias | Varias presentaciones o coincidencias aproximadas exigen elección; hasta ocho opciones. |
| Preparación de pedidos | Herramienta `pedido.crear` | Precios oficiales, cantidades, disponibilidad, versión y confirmación; RPC comercial original. |
| CRUD productos | Crear/leer/actualizar/desactivar | Eliminación lógica; precio con permiso adicional; alta sin stock inventado. |
| CRUD categorías | Crear/leer/renombrar/eliminar | Rechaza eliminación si hay productos asociados. |
| Pedidos y estados | Consultar/crear/anular | Solo la transición de anulación existente; no borrado físico de la historia. |
| Clientes/proveedores/lotes | Capacidades declaradas deshabilitadas | Condicionados al modelo del proyecto. El agente informa la ausencia. |
| Usuarios/roles | Sin herramientas de administración conversacional | No puede elevar privilegios ni cambiar sus permisos. |
| Herramientas por sesión | `ia_permisos`, `ia_capacidades`, `exigir` | Lista distinta según rol; comprobación SQL repetida al confirmar. |
| Confirmación concreta | Propuesta UUID/revisión/caducidad/instantánea | Edición invalida aprobación; registro cambiado produce conflicto. |
| Transacciones e idempotencia | `ia_confirmar_propuesta`, locks y resultado persistente | Mismo UUID/revisión no ejecuta otra venta; rollback del bloque comercial ante error. |
| Duplicados/dependencias | Validación de código, categoría, productos repetidos y FK | Se conservan restricciones originales del esquema. |
| Auditoría y trazabilidad | `ia_eventos`, `ia_propuestas`, trigger de descripción | Antes/después, errores, duraciones y consumo disponible; sin retener toda la conversación. |
| API key y secretos | Módulos server-only y guardas de credenciales | Clave en entorno de Vercel; no se manda al modelo ni al cliente. |
| Disponibilidad y fallos | Mensajes, cuota, timeout, estado de propuesta | Funciones convencionales independientes; no se afirma éxito sin resultado SQL. |
| Caché Redis | Deshabilitada explícitamente | No hay conexión recibida. Las decisiones críticas van a PostgreSQL. |
| Exportación | `app/api/ia/exportar/route.ts` | CSV con permisos y protección contra fórmulas; no se añadió PDF/Excel nativo. |
| Validación y recuperación | Tests de lógica, API, PostgreSQL y revisión de UI | Cuenta Gemini y backend real no fueron accesibles durante las pruebas. |

Los campos opcionales de subcategoría, unidad variable, etiquetas/palabras clave, proveedores y lotes requieren ampliar primero el esquema y los procedimientos del negocio. La especificación los plantea como capacidades condicionadas o complementarias; esta versión no los simula ni promete operaciones contra tablas que no existen.
