import { createClient } from "@/utils/supabase/server";
import { IAError, baseDemanda, validarEntrada, validarClasificacion } from "@/lib/ia/domain";
import { configuracionGemini, generarJSON } from "@/lib/ia/gemini";
import { reservarConsulta } from "@/lib/ia/cuota";
import {capacidades,exigir,evento} from "@/lib/ia/agente/propuestas";
import type {SupabaseClient} from "@supabase/supabase-js";
import { leerJSON, respuestaError } from "@/lib/ia/http";

export const maxDuration = 60;

export async function POST(request: Request) {
  const inicio=Date.now();let dbEvento:SupabaseClient|undefined;
  const headers = { "Cache-Control": "no-store" };
  try {
    const entrada = validarEntrada(await leerJSON(request, 12000));
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new IAError("Inicia sesión para consultar la IA.", 401);
    dbEvento=supabase;
    const cap=await capacidades(supabase);exigir(cap,entrada.accion==='demanda'?'ventas.global':'catalogo.leer');
    configuracionGemini();

    if(entrada.accion==='describir'){
      await reservarConsulta(supabase);
      const fuente=`${entrada.nombre}\n${entrada.descripcion}`;
      const result=await generarJSON('Selecciona hasta tres fragmentos literales de la fuente para redactar una descripción conservadora. No inventes palabras, beneficios terapéuticos ni propiedades. Devuelve solo fragmentos que aparecen literalmente en la fuente.',{fuente},{type:'object',properties:{fragmentos:{type:'array',maxItems:3,items:{type:'string'}}},required:['fragmentos']});
      const f=result.value.fragmentos;
      if(!Array.isArray(f)||f.length>3||f.some(x=>typeof x!=='string'||!x.trim()||x.length>500||!fuente.includes(x)))throw new IAError('Se descartó la descripción porque contenía información no respaldada.',502,'RESPUESTA_INVALIDA');
      const descripcion=[entrada.nombre,...f.filter(x=>x!==entrada.nombre)].join('. ').slice(0,2000);
      await evento(supabase,'solicitud_completada','describir','OK',Date.now()-inicio,result.consumo);
      return Response.json({descripcion,modelo:result.modelo},{headers});
    }
    if (entrada.accion === "clasificar") {
      const { data: categorias, error } = await supabase.from("categorias").select("id,nombre").order("id").limit(201);
      if (error) throw new IAError("No se pudieron leer las categorías de Supabase. Revisa los permisos.", 502);
      if (!categorias?.length) throw new IAError("No hay categorías disponibles. Crea una categoría antes de clasificar.", 422);
      if (categorias.length > 200) throw new IAError("El catálogo supera las 200 categorías permitidas por consulta.", 422);
      await reservarConsulta(supabase);
      const result = await generarJSON(
        "Clasifica el producto exclusivamente dentro de una categoría existente. Usa categoria_id=0 si falta información o ninguna categoría corresponde; explica el motivo. No inventes categorías ni determines si requiere receta.",
        { nombre: entrada.nombre, descripcion: entrada.descripcion, categorias },
        { type: "object", properties: { categoria_id: { type: "integer" }, motivo: { type: "string" } }, required: ["categoria_id", "motivo"] },
      );
      const validada=validarClasificacion(result.value,categorias);
      await evento(supabase,'solicitud_completada','clasificar','OK',Date.now()-inicio,result.consumo);
      return Response.json({...validada,modelo:result.modelo},{headers});
    }

    const { data, error } = await supabase.from("v_resumen_demanda")
      .select("producto_id,producto,stock_actual,stock_minimo,vendidos_30_dias")
      .eq("producto_id", entrada.producto_id).maybeSingle();
    if (error) throw new IAError("No se pudo consultar v_resumen_demanda. Revisa la vista y los permisos en Supabase.", 502);
    if (!data) throw new IAError("El producto no tiene un resumen de demanda accesible.", 404);
    const datos = baseDemanda(data, entrada.dias);
    await reservarConsulta(supabase);
    const result = await generarJSON(
      "Redacta un informe breve (máximo 250 palabras) de demanda de un producto. Solo usa las cifras del JSON. Las unidades estimadas ya están calculadas como techo(ventas de 30 días / 30 * horizonte). No inventes cifras, tendencias, estacionalidad ni porcentajes de confianza. Si unidades_estimadas es null, indica datos insuficientes para estimar, sin confundir ausencia de ventas con demanda futura cero. Explica la hipótesis de ritmo constante y que ventas no equivalen a demanda total cuando hubo faltantes. Puedes sugerir revisar existencias pero no emitir pedidos. Es una estimación orientativa, no garantizada.",
      datos,
      { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
    );
    if (typeof result.value?.texto !== "string" || !result.value.texto.trim() || result.value.texto.length > 6000) {
      throw new IAError("Gemini devolvió un informe inválido.", 502);
    }
    await evento(supabase,'solicitud_completada','demanda','OK',Date.now()-inicio,result.consumo);
    return Response.json({ texto: result.value.texto, datos, modelo: result.modelo, generado_en: new Date().toISOString() }, { headers });
  } catch (error) {if(dbEvento)await evento(dbEvento,'solicitud_fallida','ia',error instanceof IAError?error.codigo:'INTERNO',Date.now()-inicio);return respuestaError(error); }
}
