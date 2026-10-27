import "server-only";
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Peticion,ProductoChat,RespuestaChat,FilaChat} from '../chat-types';
import type {Borrador,Catalogos,Datos,Herramienta,Capacidades} from './types';
import {HERRAMIENTAS} from './types';
import {IAError} from '../domain';
import {normalizar,buscarProductos,rangoPeriodo} from '../chat-domain';
import {consultarVentas} from '../chat-data';
import {generarJSON} from '../gemini';
import {capacidades,exigir,validarDatos,errorRPC} from './propuestas';
import {variacion,pronosticar,horizonte,periodoAnterior} from './estadistica';

export const AVANZADAS=['buscar','categorias','movimientos','pedidos','comparar','ventas_categoria','tendencias','reposicion','pronostico','clasificar','descripcion','propuesta','historial','vencimientos','modulos','ayuda_error','informe'];
type Resultado=Omit<RespuestaChat,'consultado_en'|'intencion'>;
export async function catalogos(db:SupabaseClient,productos:ProductoChat[]):Promise<Catalogos>{
 const {data,error}=await db.from('categorias').select('id,nombre').order('nombre').limit(201);
 if(error)throw new IAError('No pude leer las categorías permitidas.',502,'DATOS_SUPABASE');
 if((data?.length??0)>200)throw new IAError('El catálogo de categorías supera el límite de 200.',422,'LIMITE_DATOS');
 return {categorias:data??[],productos:productos.map(p=>({id:p.id,codigo:p.codigo,nombre:p.nombre,stock:p.stock,precio:p.precio}))};
}
export function filtrar(productos:ProductoChat[],p:Peticion,cats:Catalogos['categorias']){
 let lista=[...productos];
 if(p.categoria){const matches=cats.filter(c=>normalizar(c.nombre)===normalizar(p.categoria!));if(matches.length!==1)throw new IAError('No pude identificar una categoría única. Usa su nombre exacto.',422,'CATEGORIA_AMBIGUA');lista=lista.filter(x=>x.categoria_id===matches[0].id);}
 if(p.stock_filtro){const f=p.stock_filtro;lista=lista.filter(x=>f.comparador==='lt'?x.stock<f.cantidad:f.comparador==='lte'?x.stock<=f.cantidad:f.comparador==='gte'?x.stock>=f.cantidad:f.comparador==='gt'?x.stock>f.cantidad:x.stock===f.cantidad);}
 if(p.orden==='stock_desc')lista.sort((a,b)=>b.stock-a.stock||a.id-b.id);else if(p.orden==='stock_asc')lista.sort((a,b)=>a.stock-b.stock||a.id-b.id);else lista.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
 return lista;
}
function datosCampos(p:Peticion):Datos{
 const d:Datos={};for(const f of p.operacion?.campos??[]){
  if(Object.hasOwn(d,f.campo))throw new IAError('La solicitud repite un campo. Especifica un único valor.');
  if(['id','producto_id','categoria_id','cantidad','stock_minimo','precio'].includes(f.campo)){
   const v=f.valor.trim().replace(/^Q\s*/i,'');if(!/^\d+(\.\d{1,2})?$/.test(v))throw new IAError(`El campo ${f.campo} debe ser numérico.`);d[f.campo]=Number(v);
  }else if(['requiere_receta','activo'].includes(f.campo)){
   if(!['true','false','si','sí','no'].includes(f.valor.toLowerCase()))throw new IAError(`Confirma el campo ${f.campo}.`);d[f.campo]=['true','si','sí'].includes(f.valor.toLowerCase());
  }else d[f.campo]=f.valor;
 }return d;
}
const REQUERIDOS:Record<Herramienta,string[]>={
 'producto.crear':['codigo','nombre','categoria_id','precio','stock_minimo','requiere_receta'],
 'producto.actualizar':['id'],'producto.desactivar':['id'],'categoria.crear':['nombre'],'categoria.actualizar':['id','nombre'],'categoria.eliminar':['id'],
 'inventario.entrada':['producto_id','cantidad','motivo'],'inventario.ajuste':['producto_id','cantidad','motivo'],'pedido.crear':['items'],'pedido.anular':['id','motivo'],
 'analisis.guardar':['tipo','texto','resultados','modelo'],
};
export function construirBorrador(h:Herramienta,datos:Datos,cat:Catalogos,nota?:string):Borrador{
 validarDatos(h,datos);
 const faltantes=REQUERIDOS[h].filter(k=>datos[k]===undefined||datos[k]===null||datos[k]==='');
 if(h==='producto.actualizar'&&Object.keys(datos).length<2)faltantes.push('campo que deseas cambiar');
 return {herramienta:h,datos,faltantes,catalogos:cat,nota};
}
async function interpretacion(datos:Datos){
 try{
  const r=await generarJSON('Redacta una explicación breve de los resultados agregados. No cambies cifras, no inventes causas, beneficios médicos o relaciones. Distingue datos históricos, cálculos y estimaciones; advierte insuficiencia cuando aparezca. Máximo 150 palabras. No ejecutes nada.',datos,{type:'object',properties:{texto:{type:'string'}},required:['texto']});
  if(typeof r.value.texto!=='string'||!r.value.texto.trim()||r.value.texto.length>4000)throw new Error('Formato');
  // Las cifras oficiales se muestran separadas. Se descartan números nuevos en la explicación.
  const numeros=new Set(JSON.stringify(datos).match(/\d+(?:[.,]\d+)?/g)??[]);
  if((r.value.texto.match(/\d+(?:[.,]\d+)?/g)??[]).some(n=>!numeros.has(n)))return {texto:'No se utilizó la explicación de IA porque incluía una cifra no respaldada. Revisa los resultados calculados.',modelo:r.modelo,consumo:r.consumo};
  if(/debido a|causad[oa] por|a causa de|gracias a|se debe a|provocad[oa] por/i.test(r.value.texto))return {texto:'La explicación causal no está respaldada por los datos agregados y fue descartada.',modelo:r.modelo,consumo:r.consumo};
  return {texto:r.value.texto,modelo:r.modelo,consumo:r.consumo};
 }catch{return {texto:'La redacción de IA no estuvo disponible. Los resultados calculados y sus limitaciones siguen disponibles.',modelo:'no disponible',consumo:undefined};}
}
export async function ejecutarAvanzada(db:SupabaseClient,p:Peticion,productos:ProductoChat[],elegidos:ProductoChat[],c?:Capacidades,mensaje=""):Promise<Resultado|null>{
 const ventasFiltradas=p.intencion==='ventas'&&Boolean(p.categoria||p.stock_filtro);
 if(!AVANZADAS.includes(p.intencion)&&!ventasFiltradas)return null;
 const cap=c??await capacidades(db);exigir(cap,'catalogo.leer');
 if(p.intencion==='modulos'||p.intencion==='vencimientos')return {texto:'Este proyecto tiene productos, categorías, inventario y pedidos. No tiene módulos de proveedores, clientes, compras ni control por lotes y vencimientos. No puedo consultar ni crear registros de esos módulos. El seguimiento de vencimientos debe habilitarse junto con el modelo por lotes y las reglas que impidan vender lotes vencidos.',resultado_estructurado:{modulos:cap.modulos}};
 if(p.intencion==='ayuda_error')return {texto:'Un error de permisos requiere autorización del administrador; no se resuelve cambiando la pregunta. Stock insuficiente exige reducir cantidades o registrar una entrada real. Un conflicto obliga a volver a validar la propuesta. Si la conexión falló al confirmar, consulta el estado de esa misma propuesta antes de reintentar; no crees otra para la misma operación.'};
 if(p.intencion==='historial'){
  const {data,error}=await db.rpc('ia_historial',{p_limite:20});if(error)errorRPC(error);
  return {texto:`Últimas ${data?.length??0} propuestas de tu usuario. Pendiente no significa ejecutada. Puedes gestionarlas desde Historial del agente.`,resultado_estructurado:{propuestas:(data??[]).map((r:{id:string;herramienta:string;estado:string;revision:number;creada_en:string})=>({id:r.id,herramienta:r.herramienta,estado:r.estado,revision:r.revision,fecha:r.creada_en}))}};
 }
 const cat=await catalogos(db,productos);
 const universo=['propuesta','descripcion','clasificar'].includes(p.intencion)?(elegidos.length?elegidos:productos):filtrar(elegidos.length?elegidos:productos,p,cat.categorias);
 if(p.intencion==='categorias')return {texto:'Categorías registradas en PostgreSQL.',resultado_estructurado:{categorias:cat.categorias},fuente:'categorias de Supabase'};
 if(p.intencion==='buscar')return {texto:`Encontré ${universo.length} productos. Muestro hasta ${p.limite}.`,filas:universo.slice(0,p.limite).map(x=>({id:x.id,producto:x.nombre,codigo:x.codigo,stock:x.stock,minimo:x.stock_minimo,precio:x.precio})),fuente:'productos y categorías de Supabase'};
 if(p.intencion==='propuesta'){
  const op=p.operacion;if(!op||!HERRAMIENTAS.includes(op.herramienta))throw new IAError('Indica qué deseas crear o modificar. No se interpretará una confirmación de texto como ejecución.');
  exigir(cap,op.herramienta);
  if(op.herramienta==='inventario.ajuste'&&/\b(resta|restar|descuenta|descontar|retira|retirar|saca|salida)\b/.test(normalizar(mensaje)))throw new IAError('Un ajuste requiere el conteo físico final. No se convierte una salida o resta en un ajuste. Usa un pedido o indica el conteo real.',422,'DATOS_INVALIDOS');
  const d=datosCampos(p);
  if(op.herramienta==='producto.crear'){
   if(p.categoria&&!d.categoria_id){const matches=cat.categorias.filter(x=>normalizar(x.nombre)===normalizar(p.categoria!));if(matches.length===1)d.categoria_id=matches[0].id;}
  }
  if(['producto.actualizar','producto.desactivar'].includes(op.herramienta)&&!d.id&&elegidos.length===1)d.id=elegidos[0].id;
  if(op.herramienta.startsWith('inventario.')&&!d.producto_id&&elegidos.length===1)d.producto_id=elegidos[0].id;
  if(op.herramienta.startsWith('categoria.')&&op.herramienta!=='categoria.crear'&&!d.id&&p.categoria){const found=cat.categorias.filter(x=>normalizar(x.nombre)===normalizar(p.categoria!));if(found.length===1)d.id=found[0].id;}
  if(op.herramienta==='pedido.crear'){
   if(!op.items.length)return {texto:'Indica los productos y sus cantidades para preparar el pedido. No se descontó inventario.'};
   const items:Datos[]=[];for(const it of op.items){const found=buscarProductos(it.busqueda,productos);if(found.aproximada||found.productos.length!==1)return {texto:`El artículo «${it.busqueda}» no se identificó de forma única. Escribe el código y la cantidad de cada artículo para preparar un único pedido.`};items.push({producto_id:found.productos[0].id,cantidad:it.cantidad});}d.items=items;
  }
  return {texto:'Preparé un borrador editable. Completa los campos faltantes, valida la propuesta y revisa su vista previa antes de confirmar. Todavía no se modificó el negocio.',borrador:construirBorrador(op.herramienta,d,cat,op.herramienta==='producto.crear'?'El producto se crea con stock cero. Registra después una entrada real mediante Inventario; la IA no inventa existencias.':undefined)};
 }
 if(p.intencion==='descripcion'||p.intencion==='clasificar'){
  if(elegidos.length!==1)return {texto:'Selecciona un producto para generar una propuesta basada en sus datos registrados. Para un alta nueva, usa el formulario Productos y su clasificación asistida.'};
  const x=elegidos[0];const fuente=`${x.nombre}\n${x.descripcion??''}`;
  const r=await generarJSON(p.intencion==='descripcion'?'Selecciona hasta tres fragmentos literales útiles de la fuente para una descripción comercial conservadora. No inventes ni alteres los fragmentos, no agregues beneficios terapéuticos.':'Sugiere una categoría SOLO entre las permitidas y selecciona fragmentos literales de la fuente. No determines receta ni inventes atributos.',
   {fuente,categorias:cat.categorias}, {type:'object',properties:{categoria_id:{type:'integer'},fragmentos:{type:'array',maxItems:3,items:{type:'string'}}},required:['categoria_id','fragmentos']});
  const fragments=r.value.fragmentos;if(!Array.isArray(fragments)||fragments.length>3||fragments.some(t=>typeof t!=='string'||!t.trim()||!fuente.includes(t)||t.length>500))throw new IAError('La sugerencia añadió datos no respaldados y fue descartada.',502,'RESPUESTA_INVALIDA');
  const descripcion=[x.nombre,...fragments.filter(t=>t!==x.nombre)].join('. ').slice(0,2000);
  const datos:Datos={id:x.id,descripcion};
  if(p.intencion==='clasificar'){if(!cat.categorias.some(v=>v.id===r.value.categoria_id))throw new IAError('La categoría sugerida no existe.',502,'RESPUESTA_INVALIDA');datos.categoria_id=r.value.categoria_id;}
  if(cap.herramientas.includes('producto.actualizar'))return {texto:'Sugerencia administrativa y comercial basada en fragmentos registrados. Revisa el texto y la categoría; no se guardó ningún cambio.',borrador:construirBorrador('producto.actualizar',datos,cat),modelo:r.modelo,consumo:r.consumo};
  return {texto:`Sugerencia para revisión: ${descripcion}. Tu rol no puede modificar el catálogo; un administrador debe revisar la propuesta.`,modelo:r.modelo,consumo:r.consumo};
 }
 if(p.intencion==='movimientos'){
  exigir(cap,'inventario.leer');const rango=rangoPeriodo(p.periodo);
  let q=db.from('v_historial_inventario').select('*',{count:'exact'}).gte('fecha',rango.desde).lt('fecha',rango.hasta);
  if(elegidos.length)q=q.in('producto',elegidos.map(x=>x.nombre));
  const {data,count,error}=await q.order('fecha',{ascending:false}).range(0,p.limite-1);
  if(error||count===null)throw new IAError('No pude leer los movimientos permitidos.',502,'DATOS_SUPABASE');
  return {texto:`Encontré ${count} movimientos en el período. Muestro ${data?.length??0}.`,periodo:rango.etiqueta,resultado_estructurado:{movimientos:(data??[]).map(r=>({producto:r.producto,tipo:r.tipo,cantidad:r.cantidad,stock_final:r.stock_resultante,fecha:r.fecha,motivo:r.motivo}))},fuente:'v_historial_inventario'};
 }
 if(p.intencion==='pedidos'){
  exigir(cap,'pedido.leer');const rango=rangoPeriodo(p.periodo);
  let q=db.from('pedidos').select('id,total,estado,creado_en,pedido_detalle(producto_id,cantidad,precio_unitario,subtotal)');
  if(p.pedido_id)q=q.eq('id',p.pedido_id);else q=q.gte('creado_en',rango.desde).lt('creado_en',rango.hasta);
  const {data,error}=await q.order('creado_en',{ascending:false}).limit(p.limite);
  if(error)throw new IAError('No pude consultar los pedidos autorizados.',502,'DATOS_SUPABASE');
  return {texto:`${data?.length??0} pedidos visibles según tu sesión y filtros. Máximo ${p.limite}. No se incluyen datos personales.`,resultado_estructurado:{pedidos:data??[]},fuente:'pedidos y pedido_detalle de Supabase'};
 }
 exigir(cap,'ventas.global');
 const tieneFiltro=Boolean(p.categoria||p.stock_filtro||elegidos.length);
 const totales=(v:Awaited<ReturnType<typeof consultarVentas>>)=>{
  if(!tieneFiltro)return {unidades:v.unidades,ingresos:v.ingresos,pedidos:v.pedidos};
  const ids=new Set(universo.map(x=>x.id)),lineas=v.serie.filter(x=>ids.has(x.producto_id));
  return {unidades:universo.reduce((s,x)=>s+(v.ventas.get(x.id)?.unidades??0),0),ingresos:universo.reduce((s,x)=>s+(v.ventas.get(x.id)?.ingresos??0),0),pedidos:new Set(lineas.map(x=>x.pedido_id)).size};
 };
 if(ventasFiltradas){const v=await consultarVentas(db,p.periodo);return {texto:'Ventas del catálogo filtrado, calculadas con pedidos no anulados.',resultado_estructurado:{periodo:v.rango,...totales(v)},fuente:'pedidos y categorías en PostgreSQL'};}
 if(p.intencion==='comparar'){
  const anterior=p.comparar_con??periodoAnterior(p.periodo);if(!anterior)return {texto:'Indica dos períodos admitidos, por ejemplo este mes y el mes anterior.'};
  const a=await consultarVentas(db,p.periodo),b=await consultarVentas(db,anterior);
  const ta=totales(a),tb=totales(b);
  const resultados:Datos={actual:{periodo:a.rango,...ta},anterior:{periodo:b.rango,...tb},variacion_unidades:variacion(ta.unidades,tb.unidades),variacion_ingresos:variacion(ta.ingresos,tb.ingresos)};
  const ai=await interpretacion(resultados);
  return {texto:'Comparación calculada en el backend. Si el período anterior tiene cero ventas, la variación porcentual no está definida. El mes/semana actual puede estar incompleto.',resultado_estructurado:resultados,interpretacion_ia:ai.texto,modelo:ai.modelo,consumo:ai.consumo,fuente:'Pedidos no anulados de PostgreSQL'};
 }
 const v=await consultarVentas(db,['pronostico','reposicion'].includes(p.intencion)?(p.periodo_historico??'ultimos_90_dias'):p.intencion==='tendencias'?'mes_actual':p.periodo);
 let filas:FilaChat[]=[];let resultados:Datos;
 if(p.intencion==='informe'){
  const t=totales(v);resultados={periodo:v.rango,unidades_vendidas:t.unidades,ingresos:t.ingresos,pedidos_no_anulados:t.pedidos,productos_activos:universo.length,unidades_actuales:universo.reduce((a,x)=>a+x.stock,0),bajo_minimo:universo.filter(x=>x.stock<=x.stock_minimo).length,agotados:universo.filter(x=>x.stock===0).length,advertencia:'Los filtros se aplican al catálogo y sus ventas; un pedido con artículos de varias categorías se cuenta una sola vez si contiene un artículo del filtro.'};
 }else if(p.intencion==='ventas_categoria'){
  const grupos=new Map<number,{categoria:string;unidades:number;ingresos:number}>();for(const x of universo){const n=v.ventas.get(x.id);const id=x.categoria_id??0;const g=grupos.get(id)??{categoria:cat.categorias.find(c=>c.id===id)?.nombre??'Categoría no accesible',unidades:0,ingresos:0};g.unidades+=n?.unidades??0;g.ingresos+=n?.ingresos??0;grupos.set(id,g);}
  resultados={periodo:v.rango,categorias:[...grupos.values()].sort((a,b)=>b.unidades-a.unidades)};
 }else if(p.intencion==='tendencias'){
  const actual=v,prev=await consultarVentas(db,'mes_anterior');
  filas=universo.map(x=>({id:x.id,producto:x.nombre,actual:actual.ventas.get(x.id)?.unidades??0,anterior:prev.ventas.get(x.id)?.unidades??0,variacion:variacion(actual.ventas.get(x.id)?.unidades??0,prev.ventas.get(x.id)?.unidades??0)})).sort((a,b)=>Math.abs(b.actual!-b.anterior!)-Math.abs(a.actual!-a.anterior!)).slice(0,p.limite);
  resultados={advertencia:'Mes actual frente al mes anterior. El período actual puede estar incompleto; no prueba causas ni una tendencia de largo plazo.',actual:actual.rango,anterior:prev.rango,productos:filas};
 }else{
  const h=horizonte(Boolean(p.proximo_mes),p.horizonte_dias);const metodos:Datos[]=[];
  const series=new Map<number,{fecha:string;cantidad:number}[]>();for(const s of v.serie){const a=series.get(s.producto_id)??[];a.push(s);series.set(s.producto_id,a);}
  for(const x of universo){
   const f=pronosticar(series.get(x.id)??[],h.dias,new Date(v.rango.hasta));
   const minimo=Math.max(0,x.stock_minimo-x.stock);const sugerida=f.estimacion===null?minimo:Math.max(0,f.estimacion+x.stock_minimo-x.stock);
   filas.push({id:x.id,producto:x.nombre,codigo:x.codigo,stock:x.stock,minimo:x.stock_minimo,estimacion:f.estimacion,mae:f.mae_semanal,...(p.intencion==='reposicion'?{reposicion:sugerida}:{})});metodos.push({producto_id:x.id,...f});
  }
  if(p.intencion==='reposicion')filas.sort((a,b)=>(b.reposicion??0)-(a.reposicion??0)||(a.id??0)-(b.id??0));
  filas=filas.slice(0,elegidos.length?20:p.limite);
  const metodosMostrados=metodos.filter(x=>filas.some(f=>f.id===x.producto_id));
  resultados={total_productos_analizados:universo.length,mostrados:filas.length,historia:v.rango,antiguedad_fin_historia_dias:Math.max(0,Math.floor((Date.now()-Date.parse(v.rango.hasta))/86400000)),horizonte:h,metodo:'Promedio móvil de cuatro semanas completas; evaluación MAE con cuatro semanas de prueba',productos:filas,evaluacion:metodosMostrados,criterio_reposicion:'max(0, pronóstico + stock mínimo - stock actual). Sin historia suficiente: solo max(0, mínimo - stock), alerta por mínimo, no recomendación basada en demanda.',limitaciones:'No incluye plazos de proveedores, compras pendientes, vencimientos ni disponibilidad histórica. No se registran compras ni entradas por aprobar este análisis.'};
 }
 const ai=await interpretacion(resultados);
 const tipo=p.intencion==='reposicion'?'reposicion':'informe';
 const borrador=cap.herramientas.includes('analisis.guardar')?construirBorrador('analisis.guardar',{tipo,texto:ai.texto,resultados,modelo:ai.modelo,...(tipo==='reposicion'?{cantidades:filas.map(f=>({producto_id:f.id,cantidad:f.reposicion??0}))}:{})},cat):undefined;
 return {texto:'Resultados calculados a partir de datos históricos. La interpretación de IA se presenta por separado para revisión; el análisis todavía no está aprobado ni aplicado.',filas:filas.length?filas:undefined,resultado_estructurado:resultados,interpretacion_ia:ai.texto,modelo:ai.modelo,consumo:ai.consumo,borrador,fuente:'PostgreSQL: productos activos y pedidos no anulados',etiquetas:[{tipo:'Histórico',texto:'Ventas registradas'},{tipo:'Calculado',texto:'Cálculos del backend'},{tipo:'Estimación',texto:'Pronóstico orientativo'},{tipo:'IA',texto:'Interpretación sujeta a revisión'}]};
}
