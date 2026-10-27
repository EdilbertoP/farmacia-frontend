export const HERRAMIENTAS = ['producto.crear','producto.actualizar','producto.desactivar','categoria.crear','categoria.actualizar','categoria.eliminar','inventario.entrada','inventario.ajuste','pedido.crear','pedido.anular','analisis.guardar'] as const;
export type Herramienta = typeof HERRAMIENTAS[number];
export type Datos = Record<string, unknown>;
export type Propuesta = { id: string; herramienta: Herramienta; datos: Datos; antes: unknown; revision: number; estado: 'pendiente'|'ejecutada'|'rechazada'|'fallida'; resultado?: Datos; vence_en: string; creada_en: string };
export type Catalogos = { categorias: {id:number;nombre:string}[]; productos: {id:number;nombre:string;codigo:string;precio:number;stock:number}[] };
export type Borrador = { herramienta: Herramienta; datos: Datos; faltantes: string[]; catalogos: Catalogos; nota?: string };
export type Capacidades = { rol: string; herramientas: string[]; modulos: Record<string,boolean>; version: number };
export type OperacionExtraida = { herramienta: Herramienta; campos: {campo:string;valor:string}[]; items:{busqueda:string;cantidad:number}[] };
