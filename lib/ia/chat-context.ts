import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { configuracionGemini } from "./gemini";
import { IAError } from "./domain";
import { validarPeticion } from "./chat-domain";
import type { Peticion } from "./chat-types";

export type ContextoChat = {
  uid: string; exp: number; ids: number[]; ultimaPeticion?: Peticion;
  pendiente?: { peticion: Peticion; ids: number[]; busquedas: string[]; opciones: number[] };
};
const idsValidos = (ids: unknown): ids is number[] => Array.isArray(ids) && ids.length <= 20 && ids.every((id) => Number.isSafeInteger(id) && id > 0);
function firma(data: string) { return createHmac("sha256", configuracionGemini().key).update(`farmacia-chat-v1:${data}`).digest(); }
export function firmarContexto(contexto: Omit<ContextoChat, "exp">) {
  const data = Buffer.from(JSON.stringify({ ...contexto, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `${data}.${firma(data).toString("base64url")}`;
}
export function leerContexto(token: string | undefined, uid: string): ContextoChat {
  const empty: ContextoChat = { uid, exp: 0, ids: [] };
  if (!token) return empty;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) throw new Error("Formato");
    const expected = firma(parts[0]), received = Buffer.from(parts[1], "base64url");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error("Firma");
    const c = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (c.uid !== uid || !Number.isFinite(c.exp) || c.exp < Date.now() / 1000 || !idsValidos(c.ids)) throw new Error("Contexto");
    if (c.ultimaPeticion) validarPeticion(c.ultimaPeticion);
    if (c.pendiente && (!idsValidos(c.pendiente.ids) || !idsValidos(c.pendiente.opciones) || !Array.isArray(c.pendiente.busquedas) ||
      c.pendiente.busquedas.length > 5 || c.pendiente.busquedas.some((s: unknown) => typeof s !== "string" || s.length > 120))) throw new Error("Pendiente");
    if (c.pendiente) validarPeticion(c.pendiente.peticion);
    return c;
  } catch {
    throw new IAError("La conversación caducó o cambió la configuración. Pulsa Nueva conversación e inténtalo otra vez.", 409, "CONTEXTO_CADUCADO");
  }
}
