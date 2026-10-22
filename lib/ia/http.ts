import { IAError } from "./domain";

export const NO_STORE = { "Cache-Control": "no-store" };
export async function leerJSON(request: Request, limite = 16000): Promise<unknown> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new IAError("Origen no permitido.", 403, "ORIGEN");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new IAError("Envía datos JSON.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new IAError("Solicitud vacía.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limite) { await reader.cancel(); throw new IAError("Solicitud demasiado grande.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new IAError("JSON inválido."); }
}

export function respuestaError(error: unknown) {
  const known = error instanceof IAError;
  const retry = known ? error.reintentarEn : undefined;
  return Response.json({ error: known ? error.message : "No se pudo completar la consulta. Revisa la configuración y vuelve a intentarlo.",
    codigo: known ? error.codigo : "ERROR_INTERNO", reintentarEn: retry },
  { status: known ? error.status : 500, headers: { ...NO_STORE, ...(retry ? { "Retry-After": String(retry) } : {}) } });
}
