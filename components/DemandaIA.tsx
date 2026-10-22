"use client";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { consultarIA } from "@/utils/consultar-ia";
import type { ResultadoDemanda } from "@/lib/ia/domain";

type Producto = { producto_id: number; producto: string };
type Informe = { id: string; producto: string; texto: string; confirmado_en: string };

export default function DemandaIA({ productos }: { productos: Producto[] }) {
  const [producto, setProducto] = useState("");
  const [dias, setDias] = useState("7");
  const [ocupado, setOcupado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDemanda | null>(null);
  const [texto, setTexto] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [historial, setHistorial] = useState<Informe[]>([]);
  const [errorHistorial, setErrorHistorial] = useState("");

  async function cargarHistorial() {
    const { data, error } = await createClient().from("ia_informes_demanda")
      .select("id,producto,texto,confirmado_en").order("confirmado_en", { ascending: false }).limit(5);
    if (error) setErrorHistorial("El historial no está disponible. Ejecuta el archivo supabase/IA_GEMINI.sql y revisa permisos.");
    else { setHistorial(data ?? []); setErrorHistorial(""); }
  }

  function limpiar() {
    setResultado(null); setTexto(""); setConfirmado(false); setGuardado(false); setMensaje(""); setError("");
  }
  async function generar() {
    limpiar(); setOcupado(true);
    try {
      const r = await consultarIA<ResultadoDemanda>({ accion: "demanda", producto_id: Number(producto), dias: Number(dias) });
      setResultado(r); setTexto(r.texto);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo generar el informe."); }
    finally { setOcupado(false); }
  }
  async function guardar() {
    if (!resultado || !confirmado || guardado || guardando || !texto.trim()) return;
    setGuardando(true); setError(""); setMensaje("");
    try {
      const { error } = await createClient().from("ia_informes_demanda").insert({
        producto_id: resultado.datos.producto_id, producto: resultado.datos.producto,
        horizonte_dias: resultado.datos.horizonte_dias, texto: texto.trim(),
        texto_original: resultado.texto, datos_base: resultado.datos,
        modelo: resultado.modelo, generado_en: resultado.generado_en, confirmado: true,
      });
      if (error) throw new Error("No se pudo guardar el informe. Revisa que ejecutaste supabase/IA_GEMINI.sql y que tu sesión tiene permisos.");
      setGuardado(true); setMensaje("Informe confirmado y guardado. No se modificaron existencias ni pedidos.");
      await cargarHistorial();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setGuardando(false); }
  }

  const bloqueado = ocupado || guardando;
  return <section className="border rounded-lg p-4 mb-8 flex flex-col gap-3" aria-label="Predicción de demanda con Gemini">
    <h2 className="text-lg font-semibold">Predicción de demanda con Gemini</h2>
    <p className="text-sm opacity-80">Consulta ventas reales de los últimos 30 días. La estimación supone el mismo ritmo de ventas; Gemini redacta su explicación. Revisa y confirma el informe antes de guardarlo.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col text-sm gap-1">Producto
        <select className="border rounded px-3 py-2 bg-transparent" value={producto} disabled={bloqueado}
          onChange={(e) => { setProducto(e.target.value); limpiar(); }}>
          <option value="">Selecciona...</option>
          {productos.map((p) => <option className="text-black" key={p.producto_id} value={p.producto_id}>{p.producto}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-sm gap-1">Horizonte
        <select className="border rounded px-3 py-2 bg-transparent" value={dias} disabled={bloqueado}
          onChange={(e) => { setDias(e.target.value); limpiar(); }}>
          {[7, 14, 30].map((d) => <option className="text-black" key={d} value={d}>{d} días</option>)}
        </select>
      </label>
      <button type="button" disabled={bloqueado || !producto} onClick={generar}
        className="border rounded px-4 py-2 disabled:opacity-50">{ocupado ? "Consultando Gemini..." : "Generar borrador con IA"}</button>
    </div>
    {!productos.length && <p className="text-sm">No hay productos accesibles en el resumen de demanda.</p>}
    {resultado && <div className="border rounded p-3 flex flex-col gap-3">
      <p className="text-sm"><strong>{resultado.datos.producto}</strong> · Ventas en 30 días: {resultado.datos.vendidos_30_dias} · Stock: {resultado.datos.stock_actual} · Stock mínimo: {resultado.datos.stock_minimo}</p>
      <p className="font-semibold">Estimación para {resultado.datos.horizonte_dias} días: {resultado.datos.unidades_estimadas === null ? "datos insuficientes" : `${resultado.datos.unidades_estimadas} unidades`}</p>
      <p className="text-xs opacity-80">Fórmula: ventas de 30 días ÷ 30 × días del horizonte, redondeadas hacia arriba. No incluye estacionalidad ni demanda no atendida.</p>
      <label className="flex flex-col gap-1 text-sm">Borrador del informe (puedes corregirlo)
        <textarea rows={7} maxLength={6000} className="border rounded p-3 bg-transparent w-full" value={texto}
          disabled={guardando || guardado} onChange={(e) => { setTexto(e.target.value); setConfirmado(false); }} />
      </label>
      <p className="text-xs opacity-80">Modelo: {resultado.modelo} · Generado: {new Date(resultado.generado_en).toLocaleString("es-GT")}</p>
      <label className="flex gap-2 items-center text-sm">
        <input type="checkbox" checked={confirmado} disabled={guardando || guardado} onChange={(e) => setConfirmado(e.target.checked)} />
        Revisé el texto y los datos y confirmo que deseo guardar este informe.
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={!confirmado || guardando || guardado || !texto.trim()} onClick={guardar}
          className="bg-green-700 text-white rounded px-4 py-2 disabled:opacity-50">{guardando ? "Guardando..." : guardado ? "Informe guardado" : "Guardar informe confirmado"}</button>
        <button type="button" disabled={guardando} onClick={limpiar} className="border rounded px-4 py-2">{guardado ? "Cerrar" : "Descartar borrador"}</button>
      </div>
    </div>}
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {mensaje && <p role="status" className="text-green-500">{mensaje}</p>}
    <details onToggle={(e) => { if (e.currentTarget.open) void cargarHistorial(); }}>
      <summary className="cursor-pointer">Mis últimos informes confirmados</summary>
      {errorHistorial && <p className="text-sm text-red-500 mt-2">{errorHistorial}</p>}
      {!errorHistorial && !historial.length && <p className="text-sm mt-2">Aún no tienes informes guardados.</p>}
      {historial.map((i) => <article className="border rounded p-3 mt-2" key={i.id}>
        <p className="font-semibold">{i.producto} · {new Date(i.confirmado_en).toLocaleString("es-GT")}</p>
        <p className="whitespace-pre-wrap text-sm mt-1">{i.texto}</p>
      </article>)}
    </details>
  </section>;
}
