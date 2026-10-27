export class IAError extends Error {
  constructor(message: string, public status = 400, public codigo = "SOLICITUD_INVALIDA", public reintentarEn?: number) { super(message); }
}

export type Categoria = { id: number; nombre: string };
export type BaseDemanda = {
  producto_id: number; producto: string; stock_actual: number;
  stock_minimo: number; vendidos_30_dias: number;
  horizonte_dias: number; unidades_estimadas: number | null;
};
export type ResultadoDemanda = {
  texto: string; datos: BaseDemanda; modelo: string; generado_en: string;
};

export function validarEntrada(value: unknown) {
  if (!value || typeof value !== "object") throw new IAError("Solicitud inválida.");
  const b = value as Record<string, unknown>;
  if (b.accion === "clasificar" || b.accion === "describir") {
    if (typeof b.nombre !== "string" || !b.nombre.trim() || b.nombre.length > 200 ||
        typeof b.descripcion !== "string" || b.descripcion.length > 2000) {
      throw new IAError("Escribe un nombre (máximo 200 caracteres) y una descripción de hasta 2000 caracteres.");
    }
    return b.accion==="clasificar"?{accion:"clasificar" as const,nombre:b.nombre.trim(),descripcion:b.descripcion.trim()}:{accion:"describir" as const,nombre:b.nombre.trim(),descripcion:b.descripcion.trim()};
  }
  if (b.accion === "demanda" && typeof b.producto_id === "number" && Number.isSafeInteger(b.producto_id) &&
      b.producto_id > 0 && typeof b.dias === "number" && [7, 14, 30].includes(b.dias)) {
    return { accion: "demanda" as const, producto_id: b.producto_id, dias: b.dias };
  }
  throw new IAError("Selecciona un producto y un horizonte de 7, 14 o 30 días.");
}

export function baseDemanda(row: Record<string, unknown>, dias: number): BaseDemanda {
  const numero = (key: string) => {
    const v = row[key];
    if ((typeof v !== "number" && typeof v !== "string") || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0) {
      throw new IAError("El resumen de demanda contiene datos faltantes o inválidos.", 422);
    }
    return Number(v);
  };
  const vendidos = numero("vendidos_30_dias");
  return {
    producto_id: numero("producto_id"), producto: String(row.producto).slice(0, 200),
    stock_actual: numero("stock_actual"), stock_minimo: numero("stock_minimo"),
    vendidos_30_dias: vendidos, horizonte_dias: dias,
    unidades_estimadas: vendidos > 0 ? Math.ceil(vendidos / 30 * dias) : null,
  };
}

export function validarClasificacion(value: unknown, categorias: Categoria[]) {
  if (!value || typeof value !== "object") throw new IAError("Gemini devolvió una clasificación inválida.", 502);
  const r = value as Record<string, unknown>;
  const categoria = categorias.find((c) => c.id === r.categoria_id);
  if (!categoria || typeof r.motivo !== "string" || !r.motivo.trim() || r.motivo.length > 1000) {
    throw new IAError("Gemini no devolvió una categoría válida del catálogo. Revisa la categoría manualmente.", 502);
  }
  return { categoria_id: categoria.id, categoria: categoria.nombre, motivo: r.motivo };
}

export function contieneCredencial(texto:string,clave?:string){
 return Boolean(clave&&texto.includes(clave))||/\bAIza[A-Za-z0-9_-]{20,}\b|\bsk-[A-Za-z0-9_-]{16,}|\bsb_(secret|publishable)_[A-Za-z0-9_-]{16,}|\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b|Bearer\s+[A-Za-z0-9._-]{16,}/i.test(texto);
}
