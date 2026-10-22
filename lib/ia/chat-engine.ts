import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IAError } from "./domain";
import { generarJSON } from "./gemini";
import { reservarConsulta } from "./cuota";
import { ESQUEMA_PETICION, INSTRUCCION_CHAT, validarPeticion, buscarProductos, normalizar } from "./chat-domain";
import { leerContexto, firmarContexto, type ContextoChat } from "./chat-context";
import { cargarProductos, consultarDemanda, consultarVentas } from "./chat-data";
import type { HistorialChat, Peticion, ProductoChat, RespuestaChat, FilaChat } from "./chat-types";

export type EntradaChat = { mensaje: string; contexto?: string; producto_id?: number; eleccion_id?: number; historial: HistorialChat[] };
const AYUDA = "Puedo consultar existencias y precios, productos bajo mínimo o agotados, ventas, más vendidos y demanda estimada. Escribe el nombre o código; puedes preguntar por varios productos. Para ventas puedes usar hoy, ayer, este mes o los últimos 7, 30 o 90 días. Si dices «este producto», selecciona uno en Productos o indícalo en el chat.";
const numero = (v: number) => new Intl.NumberFormat("es-GT", { maximumFractionDigits: 2 }).format(v);
const moneda = (v: number) => `Q${v.toFixed(2)}`;
const filaProducto = (p: ProductoChat): FilaChat => ({ id: p.id, producto: p.nombre, codigo: p.codigo, stock: p.stock, minimo: p.stock_minimo, precio: p.precio });
const unico = (ids: number[]) => [...new Set(ids)];

export function bloqueoLocal(mensaje: string) {
  const s = normalizar(mensaje);
  if (/\b(api key|apikey|clave secreta|clave de gemini|contrasena|system prompt|sql|ignora (las |tus )?instrucciones)\b/.test(s) ||
    /\b(borra|borrar|elimina|eliminar|actualiza|actualizar|descuenta|descontar|registra|registrar|inserta|insertar)\b/.test(s) ||
    /\b(crea|crear|haz|hacer|genera|generar) (un |una |el |la )?(pedido|compra|venta)\b/.test(s) ||
    /\b(cambia|cambiar|modifica|modificar)\b/.test(s)) return "no_permitido" as const;
  if (/\b(dosis|dosificacion|diagnostico|tratamiento|que (tomo|tomar)|puedo tomar|me recomiendas (tomar|un medicamento))\b/.test(s)) return "fuera_alcance" as const;
  return null;
}

export async function resolverChat(supabase: SupabaseClient, uid: string, entrada: EntradaChat): Promise<RespuestaChat> {
  const consultado_en = new Date().toISOString();
  const ctx = leerContexto(entrada.contexto, uid);
  const responder = (r: Omit<RespuestaChat, "consultado_en">, c: Omit<ContextoChat, "exp"> = { uid, ids: ctx.ids, ultimaPeticion: ctx.ultimaPeticion }) =>
    ({ ...r, contexto: firmarContexto(c), consultado_en });
  const bloqueo = bloqueoLocal(entrada.mensaje);
  if (bloqueo) return responder({ intencion: bloqueo, texto: bloqueo === "no_permitido"
    ? "Este asistente consulta datos. Para registrar o modificar productos, movimientos o pedidos, utiliza las pantallas correspondientes y confirma allí la operación. No puedo mostrar claves ni datos personales."
    : "Puedo ayudarte con inventario y ventas. Para dosis, tratamientos o recomendaciones médicas, consulta a un profesional de salud." });

  let peticion: Peticion;
  let modelo: string | undefined;
  let resueltos: number[] = [];
  let busquedas: string[] = [];
  if (entrada.eleccion_id !== undefined) {
    if (!ctx.pendiente || !ctx.pendiente.opciones.includes(entrada.eleccion_id)) throw new IAError("Esa opción ya no corresponde a la pregunta pendiente. Elige una de las opciones actuales.", 409, "ELECCION_INVALIDA");
    peticion = ctx.pendiente.peticion;
    resueltos = unico([...ctx.pendiente.ids, entrada.eleccion_id]);
    busquedas = ctx.pendiente.busquedas;
  } else {
    await reservarConsulta(supabase);
    const interpretation = await generarJSON(INSTRUCCION_CHAT, {
      pregunta_actual: entrada.mensaje,
      contexto: { intencion_anterior: ctx.ultimaPeticion?.intencion, periodo_anterior: ctx.ultimaPeticion?.periodo,
        horizonte_anterior: ctx.ultimaPeticion?.horizonte_dias, productos_anteriores: ctx.ids.length,
        intencion_pendiente: ctx.pendiente?.peticion.intencion, hay_seleccion: Boolean(entrada.producto_id) },
      historial: entrada.historial,
    }, ESQUEMA_PETICION);
    modelo = interpretation.modelo;
    peticion = validarPeticion(interpretation.value);
    busquedas = peticion.busquedas;
    if (peticion.continuar_aclaracion && ctx.pendiente) {
      // The original intent/period survives clarification; the new text only identifies a product.
      resueltos = [...ctx.pendiente.ids];
      busquedas = [...peticion.busquedas, ...ctx.pendiente.busquedas];
      peticion = ctx.pendiente.peticion;
    }
  }
  const terminar = (r: Omit<RespuestaChat, "consultado_en" | "intencion">, ids: number[] = resueltos) =>
    responder({ ...r, intencion: peticion.intencion, modelo }, { uid, ids: unico(ids).slice(0, 20), ultimaPeticion: peticion });
  if (peticion.intencion === "ayuda") return terminar({ texto: AYUDA });
  if (peticion.intencion === "no_permitido") return terminar({ texto: "Puedo consultar los datos autorizados de inventario y ventas. Para guardar o modificar, utiliza Productos, Inventario o Pedidos. No puedo ejecutar SQL ni compartir secretos o información personal." });
  if (peticion.intencion === "fuera_alcance") return terminar({ texto: "Mi alcance es inventario y ventas de la farmacia. Puedo mostrar existencias, stock bajo, precios, ventas y estimaciones de demanda. Para consultas médicas, acude a un profesional de salud." });
  if (peticion.intencion === "aclarar") return terminar({ texto: "¿Puedes concretar qué quieres consultar y de qué producto? Puedo revisar existencias, precios, stock bajo y demanda a 7, 14 o 30 días. Para ventas admite hoy, ayer, este mes y los últimos 7, 30 o 90 días; no comparo períodos ni uso fechas personalizadas todavía." });

  const productos = await cargarProductos(supabase);
  const porId = new Map(productos.map((p) => [p.id, p]));
  if (resueltos.some((id) => !porId.has(id))) throw new IAError("Un producto elegido ya no está activo o accesible. Inicia una nueva pregunta para actualizar la selección.", 409, "PRODUCTO_NO_DISPONIBLE");
  const necesitaProducto = ["existencias", "demanda"].includes(peticion.intencion);
  const aclara = (texto: string, opciones: ProductoChat[], restantes: string[] = []) => responder({
    texto, intencion: peticion.intencion, modelo, opciones: opciones.slice(0, 8).map((p) => ({ id: p.id, nombre: p.nombre, codigo: p.codigo })),
    nota: opciones.length > 8 ? `Hay ${opciones.length} coincidencias. Muestro las primeras 8; escribe el código o una presentación más concreta si no aparece.` : undefined,
  }, { uid, ids: ctx.ids, ultimaPeticion: peticion,
    pendiente: { peticion, ids: resueltos, busquedas: restantes, opciones: opciones.slice(0, 8).map((p) => p.id) } });

  for (let i = 0; i < busquedas.length; i++) {
    const match = buscarProductos(busquedas[i], productos);
    if (!match.productos.length) return aclara(`No encontré un producto activo y accesible que coincida con «${busquedas[i]}». Escribe su nombre o código exacto.`, [], busquedas.slice(i + 1));
    if (match.aproximada || match.productos.length > 1) return aclara(match.aproximada
      ? `Encontré nombres parecidos a «${busquedas[i]}». Confirma cuál quieres consultar.`
      : `Hay varias coincidencias para «${busquedas[i]}». ¿Cuál presentación quieres consultar?`, match.productos, busquedas.slice(i + 1));
    resueltos.push(match.productos[0].id);
  }
  if (!busquedas.length && !resueltos.length && (necesitaProducto || peticion.referencia !== "ninguna")) {
    if (peticion.referencia === "lista") {
      if (!ctx.ids.length) return aclara("No tengo una lista de productos en esta conversación. Escribe los nombres o códigos de los que quieres consultar.", []);
      if (ctx.ids.some((id) => !porId.has(id))) throw new IAError("Un producto anterior ya no está activo o accesible. Indica nuevamente los productos.", 409, "PRODUCTO_NO_DISPONIBLE");
      resueltos = ctx.ids;
    }
    else if (entrada.producto_id && porId.has(entrada.producto_id)) resueltos = [entrada.producto_id];
    else if (entrada.producto_id) throw new IAError("El producto seleccionado ya no está activo o accesible. Quita la selección e indica otro producto.", 404, "PRODUCTO_NO_DISPONIBLE");
    else if (ctx.ids.length === 1 && porId.has(ctx.ids[0])) resueltos = ctx.ids;
    else if (ctx.ids.length > 1) return aclara("La conversación incluye varios productos. Elige uno o di «esos productos» para consultar todos los de la última respuesta.", ctx.ids.map((id) => porId.get(id)).filter((p): p is ProductoChat => Boolean(p)));
    else return aclara("¿De qué producto? Escribe el nombre o código. También puedes elegir «Consultar IA» en la lista de Productos y preguntar «¿cuántas unidades hay de este producto?». El plural por sí solo no identifica un producto.", []);
  }
  resueltos = unico(resueltos);
  if (necesitaProducto && !resueltos.length) return aclara("Indica el nombre o código del producto que quieres consultar.", []);
  const elegidos = resueltos.map((id) => porId.get(id)!).filter(Boolean);
  const interpretacion = `${peticion.intencion.replaceAll("_", " ")}${elegidos.length ? ` · ${elegidos.map((p) => p.nombre).join(", ")}` : ""}`;
  const fuente = "Productos activos accesibles en Supabase";

  if (peticion.intencion === "existencias") {
    const texto = elegidos.map((p) => `${p.nombre} (${p.codigo}): ${numero(p.stock)} ${p.stock === 1 ? "unidad disponible" : "unidades disponibles"}. Precio unitario: ${moneda(p.precio)}.${p.stock <= p.stock_minimo ? " Está en el mínimo o por debajo." : ""}`).join("\n");
    return terminar({ texto, filas: elegidos.map(filaProducto), fuente, interpretacion });
  }
  if (["stock_bajo", "agotados"].includes(peticion.intencion)) {
    const base = elegidos.length ? elegidos : productos;
    const filtrados = base.filter((p) => peticion.intencion === "agotados" ? p.stock === 0 : p.stock <= p.stock_minimo)
      .sort((a, b) => a.stock - a.stock_minimo - (b.stock - b.stock_minimo) || a.id - b.id);
    const lista = filtrados.slice(0, peticion.limite);
    return terminar({ texto: filtrados.length ? `Encontré ${filtrados.length} ${filtrados.length === 1 ? "producto" : "productos"} ${peticion.intencion === "agotados" ? "sin existencias" : "con stock en el mínimo o por debajo"}. Muestro ${lista.length}.` : "No encontré productos que cumplan ese criterio dentro de los datos accesibles.",
      filas: lista.map(filaProducto), fuente, interpretacion }, lista.map((p) => p.id));
  }
  if (peticion.intencion === "demanda") {
    const datos = await consultarDemanda(supabase, resueltos, peticion.horizonte_dias);
    const filas: FilaChat[] = datos.map((p) => ({ id: p.producto_id, producto: p.producto, stock: p.stock_actual, minimo: p.stock_minimo,
      unidades: p.vendidos_30_dias, estimacion: p.unidades_estimadas,
      diasStock: p.vendidos_30_dias > 0 ? Math.floor(p.stock_actual / (p.vendidos_30_dias / 30)) : null }));
    return terminar({ texto: `Estimación orientativa para ${peticion.horizonte_dias} días, calculada con las ventas de los últimos 30 días. La cobertura de stock se expresa en días completos al ritmo reciente.`, filas,
      fuente: "v_resumen_demanda de Supabase", periodo: `Base: últimos 30 días · Horizonte: ${peticion.horizonte_dias} días`, interpretacion,
      nota: "Estimación = techo(ventas de 30 días ÷ 30 × horizonte). Supone ventas constantes; no considera estacionalidad ni demanda no atendida. Sin ventas, la estimación y la cobertura se muestran como datos insuficientes. Puedes generar, revisar y guardar un informe en Reportes." });
  }
  const ventas = await consultarVentas(supabase, peticion.periodo);
  const detallePeriodo = `${ventas.rango.etiqueta} · Guatemala · ${new Date(ventas.rango.desde).toLocaleDateString("es-GT", { timeZone: "America/Guatemala" })} a ${new Date(ventas.rango.hasta).toLocaleString("es-GT", { timeZone: "America/Guatemala" })}`;
  if (peticion.intencion === "resumen") {
    const bajos = productos.filter((p) => p.stock <= p.stock_minimo).length;
    return terminar({ texto: `Inventario actual: ${productos.length} productos activos distintos y ${numero(productos.reduce((s, p) => s + p.stock, 0))} unidades en total. ${bajos} productos en el mínimo o por debajo; ${productos.filter((p) => p.stock === 0).length} agotados.\nVentas del período: ${ventas.pedidos} pedidos no anulados, ${numero(ventas.unidades)} unidades vendidas y ${moneda(ventas.ingresos)} en ingresos.`,
      fuente: "productos y pedidos con su detalle, accesibles en Supabase", periodo: detallePeriodo, interpretacion,
      nota: "El inventario es actual. Las ventas incluyen los pedidos no anulados visibles para tu usuario dentro del período indicado." }, []);
  }
  const base = elegidos.length ? elegidos : productos;
  const ranking = base.map((p) => ({ ...filaProducto(p), unidades: ventas.ventas.get(p.id)?.unidades ?? 0 }))
    .sort((a, b) => b.unidades - a.unidades || (a.id ?? 0) - (b.id ?? 0));
  if (peticion.intencion === "ventas" && elegidos.length) {
    return terminar({ texto: elegidos.map((p) => { const v = ventas.ventas.get(p.id); return `${p.nombre}: ${numero(v?.unidades ?? 0)} unidades vendidas e ingresos de ${moneda(v?.ingresos ?? 0)} en el período.`; }).join("\n"),
      filas: ranking, fuente: "pedidos y pedido_detalle accesibles en Supabase; se excluyen anulados", periodo: detallePeriodo, interpretacion });
  }
  const top = ranking.filter((p) => p.unidades > 0).slice(0, peticion.limite);
  return terminar({ texto: peticion.intencion === "mas_vendidos"
    ? top.length ? `Productos activos más vendidos por unidades. Muestro ${top.length} de ${ranking.filter((p) => p.unidades > 0).length} productos con ventas.` : "No encontré ventas de productos activos accesibles en ese período."
    : `${ventas.pedidos} pedidos no anulados · ${numero(ventas.unidades)} unidades vendidas · ingresos de ${moneda(ventas.ingresos)}.`,
    filas: top, fuente: "pedidos y pedido_detalle accesibles en Supabase; se excluyen anulados", periodo: detallePeriodo, interpretacion,
    nota: "El listado muestra productos activos accesibles; los totales de ventas incluyen todos los pedidos consultados." }, top.map((p) => p.id!));
}
