const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript');
function load(file,mocks={}){const filename=path.resolve(file),m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m.require=id=>Object.hasOwn(mocks,id)?mocks[id]:require(id);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);return m.exports;}
const domain=load('lib/ia/domain.ts'),types=load('lib/ia/chat-types.ts'),at=load('lib/ia/agente/types.ts');
const cd=load('lib/ia/chat-domain.ts',{'./domain':domain,'./chat-types':types});
const stats=load('lib/ia/agente/estadistica.ts',{'../chat-domain':cd});
const prop=load('lib/ia/agente/propuestas.ts',{'server-only':{},'../domain':domain,'./types':at});
const admin={rol:'admin',version:3,herramientas:['catalogo.leer','ventas.global',...at.HERRAMIENTAS],modulos:{}},vendedor={rol:'vendedor',version:3,herramientas:['catalogo.leer','pedido.crear','analisis.guardar'],modulos:{}};
const productos=[{id:1,codigo:'ALC',nombre:'Alcohol',categoria_id:1,descripcion:'Frasco de 100 ml',stock:10,stock_minimo:3,precio:15},{id:2,codigo:'JAB',nombre:'Jabón',categoria_id:2,descripcion:'Presentación de 200 ml',stock:30,stock_minimo:5,precio:20}];
const plan=(e={})=>({intencion:'buscar',busquedas:[],referencia:'ninguna',continuar_aclaracion:false,periodo:'mes_actual',horizonte_dias:7,limite:10,...e});
const cats=[{id:1,nombre:'Primeros auxilios'},{id:2,nombre:'Cuidado personal'}];
const database={from:t=>({select:()=>({order:()=>({limit:async()=>({data:cats,error:null})})})})};
function herramientas(gen=async()=>({value:{texto:'Resultados para revisión.'},modelo:'gemini-3.5-flash-lite'})){
 const venta=async(_db,p)=>({rango:cd.rangoPeriodo(p),ventas:new Map([[1,{unidades:p==='mes_anterior'?0:4,ingresos:p==='mes_anterior'?0:60}],[2,{unidades:2,ingresos:40}]]),unidades:p==='mes_anterior'?2:6,ingresos:p==='mes_anterior'?40:100,pedidos:2,serie:[{producto_id:1,pedido_id:10,fecha:new Date().toISOString(),cantidad:4,ingresos:60},{producto_id:2,pedido_id:11,fecha:new Date().toISOString(),cantidad:2,ingresos:40}]});
 return load('lib/ia/agente/herramientas.ts',{'server-only':{},'../domain':domain,'./types':at,'../chat-domain':cd,'../chat-data':{consultarVentas:venta},'../gemini':{generarJSON:gen},'./propuestas':prop,'./estadistica':stats});
}
test('extended periods and next month use Guatemala calendar boundaries',()=>{
 const d=new Date('2026-10-27T04:00:00Z');assert.equal(cd.rangoPeriodo('semana_actual',d).desde,'2026-10-26T06:00:00.000Z');
 assert.equal(cd.rangoPeriodo('mes_anterior',d).desde,'2026-09-01T06:00:00.000Z');
 assert.equal(cd.rangoPeriodo('trimestre_anterior',d).hasta,'2026-10-01T06:00:00.000Z');
 assert.equal(stats.horizonte(true,7,d).dias,30);assert.equal(stats.variacion(10,0),null);assert.equal(stats.variacion(15,10),50);
});
test('forecast requires sufficient history and evaluates a rolling mean without inventing confidence',()=>{
 const ahora=new Date('2026-10-26T18:00:00Z'),fin=Date.parse(cd.rangoPeriodo('semana_actual',ahora).desde);
 const serie=Array.from({length:84},(_,i)=>({fecha:new Date(fin-(84-i)*86400000).toISOString(),cantidad:1}));
 const r=stats.pronosticar(serie,14,ahora);assert.equal(r.suficientes,true);assert.equal(r.estimacion,14);assert.equal(r.mae_semanal,0);
 const insuf=stats.pronosticar(serie.slice(-20),14,ahora);assert.equal(insuf.estimacion,null);assert.equal(insuf.mae_semanal,null);
});
test('tool permissions and payload allowlists reject escalation and direct stock fields',()=>{
 assert.throws(()=>prop.exigir(vendedor,'producto.precio'),e=>e.status===403);
 assert.throws(()=>prop.validarDatos('producto.actualizar',{id:1,stock:100}));
 assert.throws(()=>prop.validarDatos('producto.crear',{nombre:'x',rol:'admin'}));
 assert.throws(()=>prop.validarDatos('pedido.crear',{items:[{producto_id:1,cantidad:2},{producto_id:1,cantidad:1}]}));
 assert.throws(()=>prop.validarDatos('pedido.crear',{items:[{producto_id:1,cantidad:-1}]}));
 prop.validarDatos('producto.actualizar',{id:1,precio:22});
});
test('product search combines real category, quantity filter and sorting',async()=>{
 const h=herramientas(),r=await h.ejecutarAvanzada(database,plan({categoria:'Primeros auxilios',stock_filtro:{comparador:'lt',cantidad:20},orden:'stock_desc'}),productos,[],admin);
 assert.equal(r.filas.length,1);assert.equal(r.filas[0].id,1);
});
test('CRUD interpretation prepares an editable draft and never executes a write',async()=>{
 const h=herramientas(),r=await h.ejecutarAvanzada(database,plan({intencion:'propuesta',operacion:{herramienta:'producto.actualizar',campos:[{campo:'precio',valor:'22.00'}],items:[]}}),productos,[productos[0]],admin);
 assert.equal(r.borrador.datos.precio,22);assert.equal(r.borrador.datos.id,1);assert.equal(r.borrador.id,undefined);
 await assert.rejects(h.ejecutarAvanzada(database,plan({intencion:'propuesta',operacion:{herramienta:'producto.actualizar',campos:[{campo:'precio',valor:'22'}],items:[]}}),productos,[productos[0]],vendedor),e=>e.status===403);
});
test('new product asks for missing official fields rather than inventing a code or price',async()=>{
 const h=herramientas(),r=await h.ejecutarAvanzada(database,plan({intencion:'propuesta',categoria:'Primeros auxilios',operacion:{herramienta:'producto.crear',campos:[{campo:'nombre',valor:'Vendas'}],items:[]}}),productos,[],admin);
 assert.ok(r.borrador.faltantes.includes('codigo'));assert.ok(r.borrador.faltantes.includes('precio'));assert.equal(r.borrador.datos.categoria_id,1);assert.equal(r.borrador.datos.stock,undefined);
});
test('inventory adjustment does not convert a requested subtraction into an absolute count',async()=>{
 const h=herramientas();await assert.rejects(h.ejecutarAvanzada(database,plan({intencion:'propuesta',operacion:{herramienta:'inventario.ajuste',campos:[{campo:'cantidad',valor:'5'},{campo:'motivo',valor:'Salida'}],items:[]}}),productos,[productos[0]],admin,'Descuenta 5 unidades'),e=>e.codigo==='DATOS_INVALIDOS');
});
test('descriptions reject fragments absent from registered source',async()=>{
 const h=herramientas(async()=>({value:{categoria_id:1,fragmentos:['Cura enfermedades']},modelo:'test'}));
 await assert.rejects(h.ejecutarAvanzada(database,plan({intencion:'descripcion'}),productos,[productos[0]],admin),e=>e.codigo==='RESPUESTA_INVALIDA');
 const ok=herramientas(async()=>({value:{categoria_id:1,fragmentos:['Frasco de 100 ml']},modelo:'test'}));
 const r=await ok.ejecutarAvanzada(database,plan({intencion:'descripcion'}),productos,[productos[0]],admin);assert.equal(r.borrador.datos.descripcion,'Alcohol. Frasco de 100 ml');
});
test('global analysis is forbidden to the default seller and zero baseline remains undefined',async()=>{
 const h=herramientas();await assert.rejects(h.ejecutarAvanzada(database,plan({intencion:'comparar'}),productos,[],vendedor),e=>e.status===403);
 const r=await h.ejecutarAvanzada(database,plan({intencion:'comparar',comparar_con:'mes_anterior'}),productos,[productos[0]],admin);
 assert.equal(r.resultado_estructurado.actual.unidades,4);assert.equal(r.resultado_estructurado.variacion_unidades,null);
});
test('unavailable modules are disclosed without querying nonexistent tables',async()=>{
 const r=await herramientas().ejecutarAvanzada({from:()=>{throw Error('No table should be queried')}},plan({intencion:'vencimientos'}),productos,[],admin);
 assert.match(r.texto,/No tiene módulos/);assert.equal(r.borrador,undefined);
});
test('a failed narrative leaves computed results available and cannot change official amounts',async()=>{
 const h=herramientas(async()=>{throw Error('offline');});const r=await h.ejecutarAvanzada(database,plan({intencion:'informe'}),productos,[],admin);
 assert.equal(r.resultado_estructurado.ingresos,100);assert.match(r.interpretacion_ia,/no estuvo disponible/);
});

test('credentials and JWT are rejected before reaching the provider or proposals',()=>{
 assert.equal(domain.contieneCredencial('AIzaabcdefghijklmnopqrstuvwxyz123456'),true);
 assert.equal(domain.contieneCredencial('abcdefghijklm.abcdefghijklm.abcdefghijklm'),true);
 assert.equal(domain.contieneCredencial('Jabón 500 ml'),false);
 assert.throws(()=>prop.validarDatos('producto.crear',{nombre:'AIzaabcdefghijklmnopqrstuvwxyz123456'}),e=>e.codigo==='CREDENCIAL_EN_DATOS');
});

test('forecast respects an explicit historical period and does not fill future weeks with fake zeros',async()=>{
 const r=await herramientas().ejecutarAvanzada(database,plan({intencion:'pronostico',periodo_historico:'trimestre_anterior',proximo_mes:true}),productos,[productos[0]],admin);
 assert.equal(r.resultado_estructurado.historia.etiqueta,'trimestre anterior');
 const eval0=r.resultado_estructurado.evaluacion[0];
 assert.ok(Date.parse(eval0.hasta)<=Date.parse(r.resultado_estructurado.historia.hasta));
});

function motorConGemini(respuestas,cap=admin){
 let llamadas=0,reservas=0;
 const e=load('lib/ia/chat-engine.ts',{
  'server-only':{},'./domain':domain,'./chat-domain':cd,
  './gemini':{generarJSON:async(_instruccion,_datos,esquema)=>{
   const value=respuestas[llamadas++];assert.ok(value,'Unexpected provider retry');
   if(llamadas===2)assert.ok(esquema.required.includes('herramienta'));
   return {value,modelo:'test',consumo:{entrada:10,salida:5,total:15}};
  }},
  './cuota':{reservarConsulta:async()=>{reservas++;}},
  './chat-context':{leerContexto:()=>({uid:'user',ids:[1]}),firmarContexto:()=> 'signed'},
  './chat-data':{cargarProductos:async()=>productos},
  './agente/herramientas':herramientas(), './agente/propuestas':prop,
 });
 return {consultar:mensaje=>e.resolverChat(database,'user',{mensaje,historial:[],producto_id:1},cap),llamadas:()=>llamadas,reservas:()=>reservas};
}
test('missing CRUD extraction recovers once for all reported product creation examples',async()=>{
 const ejemplos=[
  ['crea un producto llamado "Gasas esteriles" con 30 unidades','Gasas esteriles',undefined,undefined,30],
  ['Quiero crear producto gasas','gasas'],
  ['Crea un producto llamado Gasas Esteriles, código ALC071, precio Q15','Gasas Esteriles','ALC071','15'],
  ['Crea un producto llamado Alcohol al 70 %, código ALC070, precio Q15.','Alcohol al 70 %','ALC070','15'],
 ];
 for(const [mensaje,nombre,codigo,precio,inicial] of ejemplos){
  const campos=[{campo:'nombre',valor:nombre},...(codigo?[{campo:'codigo',valor:codigo}]:[]),...(precio?[{campo:'precio',valor:precio}]:[])];
  const motor=motorConGemini([plan({intencion:'propuesta'}),{herramienta:'producto.crear',campos,items:[],busquedas:[nombre],...(inicial!==undefined?{stock_inicial:inicial}:{})}]);
  const r=await motor.consultar(mensaje);
  assert.equal(r.borrador.herramienta,'producto.crear');assert.equal(r.borrador.datos.nombre,nombre);
  assert.equal(r.borrador.datos.id,undefined);assert.equal(r.borrador.datos.stock,undefined);
  assert.equal(r.borrador.datos.codigo,codigo);assert.equal(r.borrador.datos.precio,precio?Number(precio):undefined);
  if(inicial!==undefined)assert.match(r.borrador.nota,/30 unidades/);
  assert.equal(motor.llamadas(),2);assert.equal(motor.reservas(),1);assert.equal(r.consumo.total,30);
 }
});
test('complete creation extraction needs one call and never searches or inherits a selected product',async()=>{
 const m=motorConGemini([plan({intencion:'propuesta',busquedas:['Producto inexistente'],referencia:'ultimo',continuar_aclaracion:true,operacion:{herramienta:'producto.crear',campos:[{campo:'nombre',valor:'Gasas'}],items:[]}})]);
 const r=await m.consultar('Crea un producto llamado Gasas');
 assert.equal(r.borrador.datos.nombre,'Gasas');assert.equal(r.opciones,undefined);assert.equal(m.llamadas(),1);
});
test('recovery respects permissions and does not invent an operation for a text confirmation',async()=>{
 const extraction={herramienta:'producto.crear',campos:[{campo:'nombre',valor:'Gasas'}],items:[],busquedas:[]};
 await assert.rejects(motorConGemini([plan({intencion:'propuesta'}),extraction],vendedor).consultar('Crea gasas'),e=>e.status===403);
 const r=await motorConGemini([plan({intencion:'propuesta'}),{herramienta:'ninguna',campos:[],items:[],busquedas:[]}]).consultar('sí');
 assert.equal(r.intencion,'aclarar');assert.equal(r.borrador,undefined);
 await assert.rejects(motorConGemini([plan({intencion:'propuesta'}),{...extraction,herramienta:'sql.ejecutar'}]).consultar('Crea gasas'),e=>e.codigo==='INTERPRETACION');
 assert.throws(()=>cd.validarPeticion(plan({intencion:'propuesta',operacion:{...extraction,stock_inicial:-1}})),e=>e.codigo==='INTERPRETACION');
});
