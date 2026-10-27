import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IAError, baseDemanda } from "./domain";
import { rangoPeriodo } from "./chat-domain";
import type { ProductoChat, Periodo } from "./chat-types";

export function numeroReal(v: unknown) {
  if ((typeof v !== "number" && typeof v !== "string") || !String(v).trim() || !Number.isFinite(Number(v)) || Number(v) < 0) {
    throw new IAError("La base contiene una cantidad faltante o inválida. Revísala antes de utilizar el análisis.", 422, "DATOS_INVALIDOS");
  }
  return Number(v);
}
export async function cargarProductos(supabase: SupabaseClient, incluirInactivos = false): Promise<ProductoChat[]> {
  const productos: ProductoChat[] = [];
  // Supabase may cap each response at 1000. Page at 200, with an exact count.
  let total = 0;
  for (let offset = 0; offset <= 5000; offset += 200) {
    let query=supabase.from("productos").select("id,codigo,nombre,descripcion,categoria_id,stock,stock_minimo,precio,activo", {count:"exact"});
    if(!incluirInactivos)query=query.eq("activo",true);
    const {data,count,error}=await query.order("id").range(offset,offset+199);
    if (error) throw new IAError("No pude consultar los productos. Revisa la sesión y los permisos de Supabase.", 502, "DATOS_SUPABASE");
    if (count === null) throw new IAError("No pude verificar si el catálogo está completo. Intenta de nuevo.", 502, "DATOS_SUPABASE");
    total = count;
    if (total > 5000) throw new IAError("El catálogo supera 5000 productos activos. Se necesita ampliar la búsqueda del servidor antes de analizarlo completo.", 422, "LIMITE_DATOS");
    for (const p of data ?? []) {
      if (typeof p.nombre !== "string" || !p.nombre.trim() || p.nombre.length > 500 || typeof p.codigo !== "string") throw new IAError("Hay productos con nombre o código inválido.", 422, "DATOS_INVALIDOS");
      productos.push({ id: numeroReal(p.id), codigo: p.codigo, nombre: p.nombre,
        categoria_id:p.categoria_id===undefined?undefined:numeroReal(p.categoria_id),descripcion:p.descripcion,activo:p.activo,stock: numeroReal(p.stock), stock_minimo: numeroReal(p.stock_minimo), precio: numeroReal(p.precio) });
    }
    if (productos.length >= total) break;
    if (!data?.length) throw new IAError("El catálogo cambió o se recibió incompleto. Repite la consulta.", 409, "DATOS_INCOMPLETOS");
  }
  if (new Set(productos.map((p) => p.id)).size !== total) throw new IAError("El catálogo cambió durante la consulta. Repite la pregunta para actualizarlo.", 409, "DATOS_INCOMPLETOS");
  return productos;
}

export async function consultarDemanda(supabase: SupabaseClient, ids: number[], dias: number) {
  const { data, error } = await supabase.from("v_resumen_demanda")
    .select("producto_id,producto,stock_actual,stock_minimo,vendidos_30_dias").in("producto_id", ids);
  if (error) throw new IAError("No pude consultar el resumen de demanda. Revisa v_resumen_demanda y sus permisos.", 502, "DATOS_SUPABASE");
  if ((data ?? []).length !== ids.length || new Set((data ?? []).map((r) => Number(r.producto_id))).size !== ids.length) {
    throw new IAError("No hay un resumen de demanda completo para los productos seleccionados. No calcularé con datos faltantes.", 422, "DATOS_INCOMPLETOS");
  }
  return ids.map((id) => baseDemanda(data!.find((r) => Number(r.producto_id) === id)!, dias));
}

export async function consultarVentas(supabase: SupabaseClient, periodo: Periodo) {
  const rango = rangoPeriodo(periodo);
  const serie: {producto_id:number;fecha:string;cantidad:number;pedido_id:number;ingresos:number}[]=[];
  const ventas = new Map<number, { unidades: number; ingresos: number }>();
  let pedidos = 0, ingresos = 0, unidades = 0;
  const seen = new Set<number>();
  for (let offset = 0; offset <= 5000; offset += 200) {
    const { data, count, error } = await supabase.from("pedidos")
      .select("id,total,creado_en,pedido_detalle(producto_id,cantidad,subtotal,precio_unitario)", { count: "exact" })
      .neq("estado", "anulado").gte("creado_en", rango.desde).lt("creado_en", rango.hasta)
      .order("id").range(offset, offset + 199);
    if (error || count === null) throw new IAError("No pude consultar ventas y detalles de pedidos. Revisa los permisos de tu sesión en Supabase.", 502, "DATOS_SUPABASE");
    if (count > 5000) throw new IAError("Ese período supera 5000 pedidos. Elige un período más corto para obtener un resultado completo.", 422, "LIMITE_DATOS");
    for (const pedido of data ?? []) {
      if (seen.has(Number(pedido.id))) throw new IAError("Los pedidos cambiaron durante el análisis. Repite la consulta.", 409, "DATOS_INCOMPLETOS");
      seen.add(Number(pedido.id)); pedidos++;
      if (!Array.isArray(pedido.pedido_detalle) || pedido.pedido_detalle.length === 0) throw new IAError("Un pedido no tiene detalles accesibles. Revisa sus datos y permisos antes de analizar las ventas.", 422, "DATOS_INCOMPLETOS");
      let totalPedido = 0;
      for (const d of pedido.pedido_detalle) {
        const id = numeroReal(d.producto_id), cantidad = numeroReal(d.cantidad);
        const subtotal = d.subtotal === null ? cantidad * numeroReal(d.precio_unitario) : numeroReal(d.subtotal);
        totalPedido += subtotal;
        const old = ventas.get(id) ?? { unidades: 0, ingresos: 0 };
        ventas.set(id, { unidades: old.unidades + cantidad, ingresos: old.ingresos + subtotal });
        if(typeof pedido.creado_en==="string")serie.push({producto_id:id,fecha:pedido.creado_en,cantidad,pedido_id:Number(pedido.id),ingresos:subtotal});
        unidades += cantidad; ingresos += subtotal;
      }
      if (Math.abs(totalPedido - numeroReal(pedido.total)) > 0.02) throw new IAError("El detalle de un pedido no coincide con su total o se recibió incompleto. Revisa los datos antes del análisis.", 422, "DATOS_INCOMPLETOS");
    }
    if (pedidos >= count) break;
    if (!data?.length) throw new IAError("Los pedidos se recibieron incompletos. Repite la consulta.", 409, "DATOS_INCOMPLETOS");
  }
  return { rango, ventas, pedidos, ingresos, unidades, serie };
}
