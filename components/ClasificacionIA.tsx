"use client";
import { useState } from "react";
import { consultarIA } from "@/utils/consultar-ia";

type Sugerencia = { categoria_id: number; categoria: string; motivo: string; modelo: string };
export default function ClasificacionIA({ nombre, descripcion, onConfirmar }: {
  nombre: string; descripcion: string; onConfirmar: (id: string) => void;
}) {
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
  return <section className="md:col-span-3 border rounded p-3 flex flex-col gap-2" aria-label="Clasificación con Gemini">
    <div className="flex flex-wrap items-center gap-3">
      <strong>Clasificación con Gemini</strong>
      <button type="button" disabled={ocupado || !nombre.trim()} onClick={clasificar}
        className="border rounded px-3 py-2 disabled:opacity-50">{ocupado ? "Consultando..." : "Sugerir categoría con IA"}</button>
    </div>
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
