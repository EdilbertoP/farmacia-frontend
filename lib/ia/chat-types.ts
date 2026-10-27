export const INTENCIONES = ["existencias", "stock_bajo", "agotados", "mas_vendidos", "ventas", "demanda", "resumen", "ayuda", "aclarar", "no_permitido", "fuera_alcance", "buscar", "categorias", "movimientos", "pedidos", "comparar", "ventas_categoria", "tendencias", "reposicion", "pronostico", "clasificar", "descripcion", "propuesta", "historial", "vencimientos", "modulos", "ayuda_error", "informe"] as const;
export type Intencion = typeof INTENCIONES[number];
export const PERIODOS = ["hoy", "ayer", "mes_actual", "ultimos_7_dias", "ultimos_30_dias", "ultimos_90_dias", "semana_actual", "semana_pasada", "mes_anterior", "trimestre_actual", "trimestre_anterior"] as const;
export type Periodo = typeof PERIODOS[number];
export type Peticion = {
  intencion: Intencion; busquedas: string[]; referencia: "ninguna" | "ultimo" | "lista";
  periodo_historico?:Periodo; pedido_id?:number; categoria?: string; stock_filtro?: {comparador:"lt"|"lte"|"gte"|"gt"|"eq";cantidad:number}; orden?: "nombre"|"stock_asc"|"stock_desc";
  operacion?: import("./agente/types").OperacionExtraida;
  comparar_con?: Periodo; proximo_mes?: boolean;
  continuar_aclaracion: boolean; periodo: Periodo; horizonte_dias: 7 | 14 | 30; limite: number;
};
export type ProductoChat = { id: number; codigo: string; nombre: string; stock: number; stock_minimo: number; precio: number; categoria_id?: number; descripcion?: string; activo?: boolean };
export type FilaChat = { id?: number; producto: string; codigo?: string; stock?: number; minimo?: number; precio?: number; unidades?: number; estimacion?: number | null; diasStock?: number | null; anterior?: number; actual?: number; variacion?: number|null; reposicion?: number; mae?: number|null };
export type RespuestaChat = {
  texto: string; intencion: Intencion; filas?: FilaChat[];
  opciones?: { id: number; nombre: string; codigo: string }[];
  contexto?: string; fuente?: string; consultado_en: string; periodo?: string; modelo?: string;
  consumo?: {entrada:number;salida:number;total:number};
  borrador?: import("./agente/types").Borrador;
  resultado_estructurado?: Record<string,unknown>; interpretacion_ia?: string; etiquetas?: {tipo:string;texto:string}[];
  interpretacion?: string; nota?: string;
};
export type HistorialChat = { rol: "usuario" | "asistente"; texto: string };
