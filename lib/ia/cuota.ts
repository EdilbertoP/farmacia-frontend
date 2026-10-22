import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IAError } from "./domain";

export async function reservarConsulta(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("ia_reservar_consulta");
  if (error) throw new IAError("No se pudo verificar el límite de IA. Ejecuta supabase/IA_GEMINI.sql en tu proyecto y revisa permisos.", 503, "CONFIGURACION_SUPABASE");
  if (data !== true) {
    const { data: estado } = await supabase.rpc("ia_estado_uso");
    const agotado = estado && Number(estado.restantes) === 0;
    throw new IAError(agotado ? "Ya utilizaste las 30 consultas de IA de hoy. El límite se reinicia a medianoche de Guatemala." : "Espera 10 segundos entre consultas. El máximo es de 30 intentos diarios por usuario.",
      429, agotado ? "LIMITE_DIARIO" : "LIMITE_LOCAL", agotado ? undefined : Math.max(1, Math.min(10, Number(estado?.espera_segundos) || 10)));
  }
}
