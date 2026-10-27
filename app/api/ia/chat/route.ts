import { createClient } from "@/utils/supabase/server";
import { IAError } from "@/lib/ia/domain";
import { leerJSON, NO_STORE, respuestaError } from "@/lib/ia/http";
import { validarChat } from "@/lib/ia/chat-domain";
import { resolverChat } from "@/lib/ia/chat-engine";
import { configuracionGemini, generarJSON } from "@/lib/ia/gemini";
import {capacidades,evento,exigir} from "@/lib/ia/agente/propuestas";
import type {SupabaseClient} from "@supabase/supabase-js";
import { reservarConsulta } from "@/lib/ia/cuota";

export const maxDuration = 60;

export async function POST(request: Request) {
  const inicio=Date.now();let dbEvento:SupabaseClient|undefined;
  try {
    const entrada = validarChat(await leerJSON(request, 64000));
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new IAError("Tu sesión expiró. Inicia sesión nuevamente para usar el asistente.", 401, "SESION");
    dbEvento=supabase;
    const cap=await capacidades(supabase);
    if(entrada.accion==='chat')exigir(cap,'catalogo.leer');
    const { model } = configuracionGemini();
    if (entrada.accion === "estado") {
      const { data: uso, error: errorUso } = await supabase.rpc("ia_estado_uso");
      return Response.json({ modelo: model, comprobada: false, capacidades:cap, uso: errorUso ? null : uso,
        aviso: errorUso ? "Ejecuta la versión actualizada de supabase/IA_GEMINI.sql para habilitar el indicador de uso." : undefined,
        mensaje: "Formato de configuración válido. Pulsa Comprobar conexión para verificar la respuesta real de Gemini." }, { headers: NO_STORE });
    }
    if (entrada.accion === "comprobar") {
      await reservarConsulta(supabase);
      const result = await generarJSON("Devuelve exactamente un objeto con ok=true para comprobar la conexión. No incluyas nada más.", { prueba: "conexion" },
        { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] });
      if (result.value.ok !== true) throw new IAError("La conexión respondió, pero no pasó la validación. Intenta nuevamente.", 502, "RESPUESTA_INVALIDA");
      return Response.json({ modelo: result.modelo, comprobada: true, mensaje: "Gemini respondió correctamente con el modelo configurado. La prueba consume una consulta del límite diario." }, { headers: NO_STORE });
    }
    const resultado=await resolverChat(supabase,user.id,entrada,cap);
    await evento(supabase,'solicitud_completada',resultado.intencion,'OK',Date.now()-inicio,resultado.consumo);
    return Response.json(resultado,{headers:NO_STORE});
  } catch (error) { if(dbEvento)await evento(dbEvento,'solicitud_fallida','chat',error instanceof IAError?error.codigo:'INTERNO',Date.now()-inicio);return respuestaError(error); }
}
