import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IAError,contieneCredencial } from "../domain";
import { HERRAMIENTAS, type Herramienta, type Datos, type Propuesta, type Capacidades } from "./types";

export async function capacidades(db: SupabaseClient): Promise<Capacidades> {
  const { data,error } = await db.rpc('ia_capacidades');
  if (error || !data || data.version!==3 || !Array.isArray(data.herramientas)) throw new IAError('Ejecuta supabase/IA_AGENTE_V3.sql para habilitar las herramientas, los permisos y la auditoría del agente.',503,'MIGRACION_V3');
  return data;
}
export function exigir(c: Capacidades, herramienta: string) {
  if (!c.herramientas.includes(herramienta)) throw new IAError('Tu rol no tiene permiso para esta herramienta. Solicita autorización al administrador; confirmar una propuesta no concede permisos.',403,'PERMISOS');
}
const CAMPOS: Record<Herramienta,string[]> = {
 'producto.crear':['codigo','nombre','descripcion','categoria_id','precio','stock_minimo','requiere_receta','activo'],
 'producto.actualizar':['id','codigo','nombre','descripcion','categoria_id','precio','stock_minimo','requiere_receta','activo'],
 'producto.desactivar':['id'],'categoria.crear':['nombre'],'categoria.actualizar':['id','nombre'],'categoria.eliminar':['id'],
 'inventario.entrada':['producto_id','cantidad','motivo'],'inventario.ajuste':['producto_id','cantidad','motivo'],
 'pedido.crear':['cliente_nombre','items'],'pedido.anular':['id','motivo'],'analisis.guardar':['tipo','texto','resultados','modelo','cantidades'],
};
export function validarDatos(h: unknown,d: unknown): asserts d is Datos {
 if (!HERRAMIENTAS.includes(h as Herramienta) || !d || typeof d!=='object' || Array.isArray(d)) throw new IAError('Herramienta o datos inválidos.');
 const data=d as Datos;
 if(contieneCredencial(JSON.stringify(data)))throw new IAError('Retira las credenciales o tokens de los campos antes de guardar.',422,'CREDENCIAL_EN_DATOS');
 if (Object.keys(data).some(k=>!CAMPOS[h as Herramienta].includes(k))) throw new IAError('La propuesta contiene campos no autorizados.');
 if (JSON.stringify(data).length>40000) throw new IAError('Propuesta demasiado grande.',413);
 for (const k of ['id','producto_id','categoria_id','cantidad','stock_minimo','precio']) if(k in data){
  const n=data[k]; if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>10000000|| (k!=='precio'&&!Number.isSafeInteger(n)) || (['id','producto_id','categoria_id'].includes(k)&&n<1)) throw new IAError(`Revisa el campo ${k}. Debe contener un número válido.`);
 }
 for (const k of ['requiere_receta','activo']) if(k in data&&typeof data[k]!=='boolean') throw new IAError(`El campo ${k} debe ser verdadero o falso.`);
 for(const k of ['nombre','codigo','descripcion','motivo','cliente_nombre','texto','tipo','modelo']) if(k in data&&(typeof data[k]!=='string'||String(data[k]).length>(k==='texto'?12000:k==='descripcion'?2000:500))) throw new IAError(`Revisa el campo ${k}.`);
 if('cantidades' in data){if(!Array.isArray(data.cantidades)||data.cantidades.length>20||data.cantidades.some(x=>!x||typeof x!=='object'||!Number.isSafeInteger(x.producto_id)||x.producto_id<1||!Number.isSafeInteger(x.cantidad)||x.cantidad<0||x.cantidad>1000000))throw new IAError('Revisa las cantidades propuestas para reposición.');}
 if('items' in data){
  if(!Array.isArray(data.items)||data.items.length<1||data.items.length>20) throw new IAError('El pedido necesita entre 1 y 20 productos.');
  const seen=new Set<number>();
  for(const item of data.items){
   if(!item||typeof item!=='object'||Object.keys(item).some(k=>!['producto_id','cantidad','precio_unitario'].includes(k))||!Number.isSafeInteger(item.producto_id)||item.producto_id<1||!Number.isSafeInteger(item.cantidad)||item.cantidad<1||item.cantidad>1000000||seen.has(item.producto_id)) throw new IAError('Revisa los productos y cantidades del pedido; no repitas productos.');
   seen.add(item.producto_id);
  }
 }
}
export function errorRPC(error: {code?:string;message?:string}): never {
 const m=error.message||'';
 if(m.includes('ANALISIS_DESACTUALIZADO'))throw new IAError('El inventario cambió. Genera un nuevo análisis de reposición antes de aprobarlo.',409,'ANALISIS_DESACTUALIZADO');
 if(error.code==='42501') throw new IAError('Tu sesión no tiene permiso para esa operación.',403,'PERMISOS');
 if(error.code==='23505'||/DUPLICAD/.test(m)) throw new IAError('Ya existe un registro con ese código o nombre. Revisa los datos.',409,'DUPLICADO');
 if(/VERSION|CONFIRMACION|ESTADO_INVALIDO/.test(m)) throw new IAError('La propuesta cambió o ya fue procesada. Consulta su estado antes de volver a confirmar.',409,'VERSION');
 if(/CATEGORIA_CON_PRODUCTOS/.test(m)) throw new IAError('La categoría tiene productos asociados y no puede eliminarse.',409,'DEPENDENCIAS');
 if(/STOCK_INSUFICIENTE/.test(m)) throw new IAError('No hay existencias suficientes. Reduce la cantidad y valida otra vez.',409,'STOCK_INSUFICIENTE');
 if(/FALTAN_CAMPOS|OBLIGATORIO|INVALID|SIN_CAMBIOS/.test(m)) throw new IAError('Faltan campos obligatorios o hay valores inválidos. Completa el formulario y vuelve a validarlo.',422,'DATOS_INVALIDOS');
 if(/INEXISTENTE|INACTIVO/.test(m)) throw new IAError('El registro no existe o ya no está disponible. Actualiza la propuesta.',404,'REGISTRO_INEXISTENTE');
 if(error.code==='23503') throw new IAError('Hay registros asociados que impiden esta operación.',409,'DEPENDENCIAS');
 throw new IAError('No fue posible procesar la propuesta. Comprueba la migración y los permisos. Consulta su estado antes de reintentar una confirmación.',502,'OPERACION_NO_COMPLETADA');
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function procesarPropuesta(db:SupabaseClient,b:Datos){
 const c=await capacidades(db);
 let fn:string,args:Datos;
 if(b.comando==='preparar'){
  validarDatos(b.herramienta,b.datos);exigir(c,String(b.herramienta));
  if(typeof b.clave!=='string'||!UUID.test(b.clave)) throw new IAError('La clave de idempotencia no es válida.');
  fn='ia_preparar_propuesta';args={p_herramienta:b.herramienta,p_datos:b.datos,p_clave:b.clave};
 }else if(b.comando==='historial') {fn='ia_historial';args={p_limite:20};}
 else if(b.comando==='auditoria'){exigir(c,'auditoria.leer');fn='ia_auditoria';args={p_limite:50};}
 else {
  if(typeof b.id!=='string'||!UUID.test(b.id))throw new IAError('Identificador de propuesta inválido.');
  if(b.comando==='estado'){fn='ia_obtener_propuesta';args={p_id:b.id};}
  else{
   if(typeof b.revision!=='number'||!Number.isSafeInteger(b.revision)||b.revision<1)throw new IAError('Revisión inválida.');
   if(b.comando==='revisar'){
    const {data:actual,error}=await db.rpc('ia_obtener_propuesta',{p_id:b.id});if(error)errorRPC(error);
    if(!actual)throw new IAError('Propuesta no accesible.',404);
    exigir(c,actual.herramienta);validarDatos(actual.herramienta,b.datos);
    fn='ia_revisar_propuesta';args={p_id:b.id,p_revision:b.revision,p_datos:b.datos};
   }else if(b.comando==='confirmar'){
    if(b.confirmado!==true)throw new IAError('Debes confirmar explícitamente la versión revisada.');
    fn='ia_confirmar_propuesta';args={p_id:b.id,p_revision:b.revision,p_confirmado:true};
   }else if(b.comando==='rechazar'){fn='ia_rechazar_propuesta';args={p_id:b.id,p_revision:b.revision};}
   else throw new IAError('Acción no autorizada.');
  }
 }
 const {data,error}=await db.rpc(fn,args);if(error)errorRPC(error);
 if(!data)throw new IAError('No se encontró una propuesta accesible.',404);
 return data as Propuesta|Propuesta[];
}
export async function evento(db:SupabaseClient,tipo:string,herramienta:string,codigo:string,ms:number,consumo?:unknown){
 try {const {error}=await db.rpc('ia_registrar_evento',{p_evento:tipo,p_herramienta:herramienta,p_codigo:codigo,p_duracion_ms:Math.round(ms),p_consumo:consumo||null});if(error)console.warn('[IA] auditoría no disponible',error.code);}catch{console.warn('[IA] auditoría no disponible');}
}
