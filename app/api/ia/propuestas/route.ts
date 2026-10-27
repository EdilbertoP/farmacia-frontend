import {createClient} from '@/utils/supabase/server';
import {IAError} from '@/lib/ia/domain';
import {leerJSON,NO_STORE,respuestaError} from '@/lib/ia/http';
import {procesarPropuesta} from '@/lib/ia/agente/propuestas';
export const maxDuration=60;
export async function POST(request:Request){
 try{
  const b=await leerJSON(request,52000);if(!b||typeof b!=='object'||Array.isArray(b))throw new IAError('Solicitud inválida.');
  const db=await createClient();const {data:{user},error}=await db.auth.getUser();
  if(error||!user)throw new IAError('Tu sesión expiró. Inicia sesión nuevamente.',401,'SESION');
  // Este endpoint no necesita Gemini: una confirmación ya revisada funciona aunque falle el LLM.
  return Response.json({resultado:await procesarPropuesta(db,b as Record<string,unknown>)},{headers:NO_STORE});
 }catch(e){return respuestaError(e);}
}
