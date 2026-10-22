export async function consultarIA<T>(body: object): Promise<T> {
  const response = await fetch("/api/ia", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(55000),
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error("El servidor no respondió correctamente. Intenta nuevamente."); }
  if (!response.ok) throw new Error(result.error || "No se pudo consultar la IA.");
  return result as T;
}
