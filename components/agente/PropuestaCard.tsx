"use client";
import {useRef,useState} from 'react';
import type {Borrador,Datos,Propuesta,Herramienta} from '@/lib/ia/agente/types';
import Resultados from './Resultados';
import Exportar from './Exportar';
import {solicitarIA} from '@/utils/consultar-ia';
const etiquetas:Record<string,string>={id:'Registro',producto_id:'Producto',codigo:'Código',nombre:'Nombre',descripcion:'Descripción',categoria_id:'Categoría',precio:'Precio de venta (Q)',stock_minimo:'Stock mínimo',requiere_receta:'¿Requiere receta?',activo:'Activo',cantidad:'Cantidad',motivo:'Motivo',cliente_nombre:'Nombre de cliente (opcional)',texto:'Texto para revisión',tipo:'Tipo de análisis',modelo:'Modelo'};
const FALLOS:Record<string,string>={CONFLICTO_ACTUALIZACION:'El registro cambió desde la vista previa. Vuelve a validar y revisa una nueva versión.',PROPUESTA_CADUCADA:'La propuesta caducó. Vuelve a validar sus datos.',STOCK_INSUFICIENTE:'Ya no hay existencias suficientes. Reduce la cantidad o revisa el inventario.',ANALISIS_DESACTUALIZADO:'Cambió el inventario usado para reposición. Genera un análisis nuevo.',DUPLICADO:'Ya existe un registro con ese código o nombre.',DEPENDENCIAS:'Existen registros asociados que impiden esta operación.',PROCEDIMIENTO_NO_DISPONIBLE:'Falta un procedimiento comercial compatible. Revisa su implementación en el backend.',VALIDACION_RECHAZADA:'La validación del backend rechazó los datos. Revisa campos, permisos y reglas del negocio.'};
const TITULOS:Record<Herramienta,string>={'producto.crear':'Crear producto','producto.actualizar':'Actualizar producto','producto.desactivar':'Desactivar producto','categoria.crear':'Crear categoría','categoria.actualizar':'Actualizar categoría','categoria.eliminar':'Eliminar categoría sin productos','inventario.entrada':'Registrar entrada real','inventario.ajuste':'Ajustar existencias al conteo físico','pedido.crear':'Registrar pedido','pedido.anular':'Anular pedido','analisis.guardar':'Aprobar y guardar análisis'};
function campos(h:Herramienta,d:Datos){
 if(h==='producto.crear')return ['codigo','nombre','descripcion','categoria_id','precio','stock_minimo','requiere_receta','activo'];
 if(h==='producto.actualizar')return [...new Set(['id',...Object.keys(d)])];
 if(h==='producto.desactivar'||h==='categoria.eliminar')return ['id'];
 if(h==='categoria.crear')return ['nombre'];if(h==='categoria.actualizar')return ['id','nombre'];
 if(h.startsWith('inventario.'))return ['producto_id','cantidad','motivo'];
 if(h==='pedido.crear')return ['cliente_nombre'];if(h==='pedido.anular')return ['id','motivo'];return ['texto'];
}
export default function PropuestaCard({borrador,propuesta,puedeExportar=false,onEstado}:{borrador?:Borrador;propuesta?:Propuesta;puedeExportar?:boolean;onEstado?:(p:Propuesta)=>void}){
 const h=borrador?.herramienta??propuesta!.herramienta;
 const [actual,setActual]=useState<Propuesta|undefined>(propuesta);
 const [datos,setDatos]=useState<Datos>(()=>({...((h==='producto.crear')?{activo:true}:{}),...structuredClone(borrador?.datos??propuesta!.datos)}));
 const [tocado,setTocado]=useState(false);
 const [confirmado,setConfirmado]=useState(false),[ocupado,setOcupado]=useState(false),[error,setError]=useState(''),[incierto,setIncierto]=useState(false);
 const notificado=useRef("");
 const clave=useRef<string|null>(null),bloqueo=useRef(false);
 const dirty=tocado||(actual?JSON.stringify(actual.datos)!==JSON.stringify(datos):true);
 const finalizado=actual?.estado==='ejecutada'||actual?.estado==='rechazada';
 const cat=borrador?.catalogos;
 function cambiar(k:string,v:unknown){setTocado(true);setDatos(d=>({...d,[k]:v}));setConfirmado(false);}
 function aceptar(r:Propuesta){setTocado(false);setActual(r);setDatos(structuredClone(r.datos));setConfirmado(false);setIncierto(false);const marca=`${r.id}:${r.revision}:${r.estado}`;if(r.estado!=="pendiente"&&notificado.current!==marca){notificado.current=marca;onEstado?.(r);}}
 async function accion(comando:string){
  if(bloqueo.current)return;
  bloqueo.current=true;setOcupado(true);setError('');
  try{
   if(!clave.current)clave.current=crypto.randomUUID();
   const b=comando==='preparar'?{comando,herramienta:h,datos,clave:clave.current}:{comando,id:actual?.id,revision:actual?.revision,...(comando==='revisar'?{datos}:{}),...(comando==='confirmar'?{confirmado}: {})};
   const r=await solicitarIA<{resultado:Propuesta}>('/api/ia/propuestas',b);aceptar(r.resultado);
   if(r.resultado.estado==='ejecutada')window.dispatchEvent(new Event('farmacia:datos-actualizados'));
  }catch(e){
   if(comando==='confirmar'&&actual){
    try{const r=await solicitarIA<{resultado:Propuesta}>('/api/ia/propuestas',{comando:'estado',id:actual.id});aceptar(r.resultado);
     if(r.resultado.estado==='ejecutada'){window.dispatchEvent(new Event('farmacia:datos-actualizados'));return;}
     setError('La operación no aparece ejecutada. Revisa el estado y vuelve a validar si es necesario; conserva esta misma propuesta.');
    }catch{setIncierto(true);setError('No pude verificar si se ejecutó. Consulta el estado de ESTA propuesta antes de reintentar. No prepares una copia de la operación.');}
   }else setError(e instanceof Error?e.message:'No se pudo procesar la propuesta.');
  }finally{bloqueo.current=false;setOcupado(false);}
 }
 const listaItems=Array.isArray(datos.items)?datos.items as Datos[]:[];
 const anterior=actual?.antes&&!Array.isArray(actual.antes)?actual.antes as Datos:null;
 const cambios=anterior?Object.keys(datos).filter(k=>!['id','producto_id','items'].includes(k)&&Object.hasOwn(anterior,k)).map(k=>({campo:etiquetas[k]??k,anterior:anterior[k],propuesto:datos[k]})):[];
 if(anterior&&h==='producto.desactivar')cambios.push({campo:'Activo',anterior:anterior.activo,propuesto:false});
 if(anterior&&h.startsWith('inventario.'))cambios.push({campo:'Stock final',anterior:anterior.stock,propuesto:h==='inventario.entrada'?Number(anterior.stock)+Number(datos.cantidad):datos.cantidad});
 return <section className="iaV3-propuesta" aria-label={TITULOS[h]}>
  <div className="iaV3-cabecera"><strong>{TITULOS[h]}</strong><span>{actual?`${actual.estado} · versión ${actual.revision}`:'Borrador sin aplicar'}</span></div>
  {actual&&<p className="iaV3-pequeno">Propuesta {actual.id.slice(0,8)} · válida hasta {new Date(actual.vence_en).toLocaleTimeString('es-GT',{timeZone:'America/Guatemala'})}</p>}
  {borrador?.nota&&<p>{borrador.nota}</p>}
  {borrador?.faltantes.length!==0&&!actual&&<p>Completa y revisa los campos antes de validar.</p>}
  <fieldset disabled={ocupado||finalizado} className="iaV3-formulario">
   {campos(h,datos).filter(k=>!['resultados','modelo','tipo','items','precio_unitario'].includes(k)).map(k=>{
    const esNumero=['id','producto_id','categoria_id','cantidad','stock_minimo','precio'].includes(k);
    const opciones=k==='categoria_id'||(k==='id'&&h.startsWith('categoria.'))?cat?.categorias:(k==='producto_id'||(k==='id'&&h.startsWith('producto.')))?cat?.productos:undefined;
    return <label key={k}>{etiquetas[k]??k}
     {opciones?<select value={String(datos[k]??'')} onChange={e=>cambiar(k,e.target.value?Number(e.target.value):undefined)}><option value="">Selecciona…</option>{opciones.map(o=><option key={o.id} value={o.id}>{o.nombre}{'codigo'in o?` (${o.codigo})`:''}</option>)}</select>
     :['requiere_receta','activo'].includes(k)?<select value={datos[k]===undefined?'':String(datos[k])} onChange={e=>cambiar(k,e.target.value===''?undefined:e.target.value==='true')}><option value="">Confirma…</option><option value="true">Sí</option><option value="false">No</option></select>
     :['texto','descripcion'].includes(k)?<textarea rows={4} maxLength={k==='texto'?12000:2000} value={String(datos[k]??'')} onChange={e=>cambiar(k,e.target.value)}/>
     :<input type={esNumero?'number':'text'} step={k==='precio'?'0.01':'1'} min="0" value={String(datos[k]??'')} maxLength={k==='motivo'?500:200} onChange={e=>cambiar(k,esNumero?(e.target.value===''?undefined:Number(e.target.value)):e.target.value)}/>}
    </label>;
   })}
   {h==='producto.actualizar'&&<label>Agregar un campo a la modificación<select value="" onChange={e=>{const k=e.target.value;if(k)cambiar(k,['requiere_receta','activo'].includes(k)?undefined:['categoria_id','precio','stock_minimo'].includes(k)?undefined:'');}}><option value="">Selecciona campo…</option>{['codigo','nombre','descripcion','categoria_id','precio','stock_minimo','requiere_receta','activo'].filter(k=>!Object.hasOwn(datos,k)).map(k=><option key={k} value={k}>{etiquetas[k]}</option>)}</select></label>}
   {h==='analisis.guardar'&&Array.isArray(datos.cantidades)&&<div><strong>Cantidades propuestas de reposición (editables)</strong>{(datos.cantidades as Datos[]).map((x,i)=><label key={i}>Producto #{String(x.producto_id)}<input type="number" min="0" step="1" value={String(x.cantidad)} onChange={e=>cambiar('cantidades',(datos.cantidades as Datos[]).map((v,n)=>n===i?{...v,cantidad:Number(e.target.value)}:v))}/></label>)}<p>Guardar esta propuesta no crea compras ni aumenta existencias.</p></div>}
   {h==='pedido.crear'&&<div><strong>Productos del pedido</strong>{listaItems.map((it,i)=><div className="iaV3-item" key={i}>
    <label>Producto{cat?<select value={String(it.producto_id??'')} onChange={e=>cambiar('items',listaItems.map((x,n)=>n===i?{...x,producto_id:Number(e.target.value)}:x))}><option value="">Selecciona…</option>{cat.productos.map(p=><option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}</select>:<input type="number" value={String(it.producto_id??'')} onChange={e=>cambiar('items',listaItems.map((x,n)=>n===i?{...x,producto_id:Number(e.target.value)}:x))}/>}</label>
    <label>Cantidad<input type="number" min="1" step="1" value={String(it.cantidad??'')} onChange={e=>cambiar('items',listaItems.map((x,n)=>n===i?{...x,cantidad:Number(e.target.value)}:x))}/></label>
    {it.precio_unitario!==undefined&&<p>Precio oficial: Q{Number(it.precio_unitario).toFixed(2)} · Subtotal: Q{(Number(it.precio_unitario)*Number(it.cantidad)).toFixed(2)}</p>}
    <button type="button" onClick={()=>cambiar('items',listaItems.filter((_,n)=>n!==i))}>Quitar</button>
   </div>)}{listaItems.length<20&&<button type="button" onClick={()=>cambiar('items',[...listaItems,{producto_id:undefined,cantidad:1}])}>Agregar artículo</button>}</div>}
  </fieldset>
  {cambios.length>0&&<div><strong>Cambios propuestos</strong><Resultados datos={{cambios}}/></div>}
  {h==='pedido.crear'&&actual&&<p><strong>{dirty?'Total del borrador (actualiza la vista previa)':'Total verificado del pedido'}: Q{listaItems.reduce((s,x)=>s+Number(x.cantidad??0)*Number(x.precio_unitario??0),0).toFixed(2)}</strong></p>}
  {Boolean(actual?.antes)&&Object.keys(actual!.antes as object).length>0&&<details><summary>Valores anteriores que se volverán a comprobar</summary>{Array.isArray(actual!.antes)?<Resultados datos={{productos:actual!.antes}}/>:<Resultados datos={actual!.antes as Datos}/>}</details>}
  {h==='analisis.guardar'&&Boolean(datos.resultados)&&<details><summary>Datos calculados (no se editan al corregir el texto)</summary><Resultados datos={datos.resultados as Datos}/></details>}
  {actual?.estado==='ejecutada'?<p role="status" className="iaV3-exito">Operación ejecutada y registrada por PostgreSQL. Consulta las pantallas del sistema para ver el resultado actualizado.</p>
   :actual?.estado==='rechazada'?<p>Propuesta rechazada. No se ejecutó la operación.</p>
   :<>
    {actual?.estado==='fallida'&&<p className="iaV3-error">No se aplicó la operación. Motivo: {FALLOS[String(actual.resultado?.codigo)]??'La operación no superó las validaciones del backend.'}. Actualiza y valida la propuesta para obtener una nueva versión.</p>}
    <div className="iaV3-acciones"><button type="button" disabled={ocupado||incierto} onClick={()=>void accion(actual?'revisar':'preparar')}>{ocupado?'Procesando…':actual?'Actualizar vista previa':'Validar y preparar propuesta'}</button>
    {actual&&<button type="button" disabled={ocupado} onClick={()=>void accion('estado')}>Consultar estado</button>}</div>
    {actual&&<><label className="iaV3-confirmacion"><input type="checkbox" checked={confirmado} disabled={ocupado||dirty||incierto||actual.estado!=='pendiente'} onChange={e=>setConfirmado(e.target.checked)}/>Revisé los datos y confirmo esta versión exacta.</label>
    {dirty&&<p>Hay cambios sin validar. Actualiza la vista previa y confirma nuevamente.</p>}
    <div className="iaV3-acciones"><button type="button" disabled={ocupado||dirty||!confirmado||incierto||actual.estado!=='pendiente'} onClick={()=>void accion('confirmar')}>Confirmar operación</button><button type="button" disabled={ocupado||incierto} onClick={()=>void accion('rechazar')}>Rechazar</button></div></>}
   </>}
  {actual?.estado==='ejecutada'&&h==='analisis.guardar'&&puedeExportar&&<Exportar id={actual.id}/>}
  {error&&<p role="alert" className="iaV3-error">{error}</p>}
 </section>;
}
