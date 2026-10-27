export class ConsultaIAError extends Error {
  constructor(message: string, public status: number, public codigo = "ERROR", public reintentarEn?: number) { super(message); }
}
export async function solicitarIA<T>(url: "/api/ia" | "/api/ia/chat" | "/api/ia/propuestas", body: object, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(55000)]) : AbortSignal.timeout(55000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ConsultaIAError("No se pudo conectar o la consulta tardó demasiado. Comprueba tu conexión y vuelve a intentarlo.", 0, "CONEXION", 10);
  }
  let result;
  try { result = await response.json(); }
  catch { throw new ConsultaIAError("El servidor no respondió correctamente. Revisa el despliegue e intenta de nuevo.", response.status, "RESPUESTA_INVALIDA"); }
  if (!response.ok) throw new ConsultaIAError(result.error || "No se pudo consultar la IA.", response.status, result.codigo, result.reintentarEn);
  return result as T;
}
export async function consultarIA<T>(body: object): Promise<T> { return solicitarIA<T>("/api/ia", body); }
