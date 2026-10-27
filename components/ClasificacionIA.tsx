"use client";
import { useState } from "react";
import { consultarIA } from "@/utils/consultar-ia";

type Sugerencia = { categoria_id: number; categoria: string; motivo: string; modelo: string };
export default function ClasificacionIA({ nombre, descripcion, onConfirmar, onDescripcion }: {
  nombre: string; descripcion: string; onConfirmar: (id: string) => void; onDescripcion:(texto:string)=>void;
}) {
  const [desc,setDesc]=useState<{texto:string;nombre:string;descripcion:string}|null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<{ sugerencia: Sugerencia; nombre: string; descripcion: string } | null>(null);
  const vigente = resultado?.nombre === nombre && resultado?.descripcion === descripcion ? resultado : null;

  async function clasificar() {
    setOcupado(true); setError(""); setResultado(null);
    try {
      const sugerencia = await consultarIA<Sugerencia>({ accion: "clasificar", nombre, descripcion });
      setResultado({ sugerencia, nombre, descripcion });
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo clasificar."); }
    finally { setOcupado(false); }
  }
  async function describir(){
    setOcupado(true);setError("");setDesc(null);
    try{const r=await consultarIA<{descripcion:string}>({accion:'describir',nombre,descripcion});setDesc({texto:r.descripcion,nombre,descripcion});}
    catch(e){setError(e instanceof Error?e.message:'No se pudo redactar.');}finally{setOcupado(false);}
  }
  return <section className="md:col-span-3 border rounded p-3 flex flex-col gap-2" aria-label="Clasificación con Gemini">
    <div className="flex flex-wrap items-center gap-3">
      <strong>Clasificación con Gemini</strong>
      <button type="button" disabled={ocupado || !nombre.trim()} onClick={clasificar}
        className="border rounded px-3 py-2 disabled:opacity-50">{ocupado ? "Consultando..." : "Sugerir categoría con IA"}</button>
    </div>
    <button type="button" disabled={ocupado||!nombre.trim()} onClick={describir} className="border rounded px-3 py-2 disabled:opacity-50">Redactar descripción con datos disponibles</button>
    {desc&&desc.nombre===nombre&&desc.descripcion===descripcion&&<div><p>Descripción sugerida: {desc.texto}</p><button type="button" className="border rounded px-3 py-2" onClick={()=>{onDescripcion(desc.texto);setDesc(null);}}>Confirmar descripción en el formulario</button><button type="button" className="border rounded px-3 py-2 ml-2" onClick={()=>setDesc(null)}>Descartar descripción</button></div>}
    <p className="text-sm opacity-80">La IA propone una categoría. Tú la revisas y confirmas antes de guardar el producto.</p>
    {vigente && <div className="text-sm flex flex-col gap-2" aria-live="polite">
      <p><strong>{vigente.sugerencia.categoria}</strong>: {vigente.sugerencia.motivo}</p>
      <div className="flex gap-2">
        <button type="button" className="bg-blue-700 text-white rounded px-3 py-2" onClick={() => {
          onConfirmar(String(vigente.sugerencia.categoria_id)); setResultado(null);
        }}>Confirmar categoría en el formulario</button>
        <button type="button" className="border rounded px-3 py-2" onClick={() => setResultado(null)}>Descartar</button>
      </div>
      <p>Confirmarla solo cambia el formulario. Pulsa Agregar o Guardar cambios para persistir.</p>
    </div>}
    {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
  </section>;
}
