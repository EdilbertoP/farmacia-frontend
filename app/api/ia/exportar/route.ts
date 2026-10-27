import {createClient} from '@/utils/supabase/server';
import {IAError} from '@/lib/ia/domain';
import {leerJSON,respuestaError,NO_STORE} from '@/lib/ia/http';
import {capacidades,exigir,evento,errorRPC} from '@/lib/ia/agente/propuestas';
import {cargarProductos} from '@/lib/ia/chat-data';
function celda(v:unknown){let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);if(typeof v==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export const maxDuration=60;
export async function POST(request:Request){
 try{
  const b=await leerJSON(request);if(!b||typeof b!=='object'||Array.isArray(b))throw new IAError('Solicitud inválida.');
  const d=b as Record<string,unknown>,db=await createClient();const {data:{user},error}=await db.auth.getUser();if(error||!user)throw new IAError('Inicia sesión.',401,'SESION');
  const cap=await capacidades(db);exigir(cap,'informe.exportar');let filas:unknown[][];
  if(d.tipo==='inventario'){
   exigir(cap,'catalogo.leer');const prods=await cargarProductos(db);filas=[['Código','Producto','Stock actual','Stock mínimo','Precio Q'],...prods.map(p=>[p.codigo,p.nombre,p.stock,p.stock_minimo,p.precio])];
  }else if(d.tipo==='analisis'&&typeof d.id==='string'&&/^[0-9a-f-]{36}$/i.test(d.id)){
   const {data:p,error:e}=await db.rpc('ia_obtener_propuesta',{p_id:d.id});if(e)errorRPC(e);if(!p||p.herramienta!=='analisis.guardar'||p.estado!=='ejecutada')throw new IAError('Solo puedes exportar un análisis propio que ya aprobaste.',403);
   filas=[['Tipo','Estado','Fecha','Modelo','Texto revisado','Resultados históricos y método'],[p.datos.tipo,p.estado,p.creada_en,p.datos.modelo,p.datos.texto,p.datos.resultados]];
  }else throw new IAError('Tipo de exportación inválido.');
  await evento(db,'exportacion',String(d.tipo),'OK',0);
  return new Response('\ufeff'+filas.map(r=>r.map(celda).join(',')).join('\r\n'),{headers:{...NO_STORE,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="farmacia-informe.csv"'}});
 }catch(e){return respuestaError(e);}
}
