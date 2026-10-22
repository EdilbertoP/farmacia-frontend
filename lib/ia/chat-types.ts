export const INTENCIONES = ["existencias", "stock_bajo", "agotados", "mas_vendidos", "ventas", "demanda", "resumen", "ayuda", "aclarar", "no_permitido", "fuera_alcance"] as const;
export type Intencion = typeof INTENCIONES[number];
export const PERIODOS = ["hoy", "ayer", "mes_actual", "ultimos_7_dias", "ultimos_30_dias", "ultimos_90_dias"] as const;
export type Periodo = typeof PERIODOS[number];
export type Peticion = {
  intencion: Intencion; busquedas: string[]; referencia: "ninguna" | "ultimo" | "lista";
  continuar_aclaracion: boolean; periodo: Periodo; horizonte_dias: 7 | 14 | 30; limite: number;
};
export type ProductoChat = { id: number; codigo: string; nombre: string; stock: number; stock_minimo: number; precio: number };
export type FilaChat = { id?: number; producto: string; codigo?: string; stock?: number; minimo?: number; precio?: number; unidades?: number; estimacion?: number | null; diasStock?: number | null };
export type RespuestaChat = {
  texto: string; intencion: Intencion; filas?: FilaChat[];
  opciones?: { id: number; nombre: string; codigo: string }[];
  contexto?: string; fuente?: string; consultado_en: string; periodo?: string; modelo?: string;
  interpretacion?: string; nota?: string;
};
export type HistorialChat = { rol: "usuario" | "asistente"; texto: string };
