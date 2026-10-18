"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Semana = { semana: string; ingresos: number; unidades: number };

export default function Reportes() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [rol, setRol] = useState<string | null>(null);
  const [semanas, setSemanas] = useState<Semana[]>([]);
  const [demanda, setDemanda] = useState<any[]>([]);
  const [auditoria, setAuditoria] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function cargar(esAdmin: boolean) {
    const supabase = createClient();

    // Ventas de las últimas 12 semanas, sumadas por semana
    const desde = new Date();
    desde.setDate(desde.getDate() - 84);
    const { data: ventas, error } = await supabase
      .from("v_ventas_por_producto")
      .select("semana, unidades_vendidas, ingresos")
      .gte("semana", desde.toISOString().slice(0, 10));
    if (error) { setError(error.message); return; }

    const porSemana: Record<string, Semana> = {};
    for (const v of ventas ?? []) {
      const s = String(v.semana).slice(0, 10);
      porSemana[s] ??= { semana: s, ingresos: 0, unidades: 0 };
      porSemana[s].ingresos += Number(v.ingresos);
      porSemana[s].unidades += Number(v.unidades_vendidas);
    }
    setSemanas(Object.values(porSemana).sort((a, b) => a.semana.localeCompare(b.semana)));

    const { data: dem } = await supabase
      .from("v_resumen_demanda").select("*")
      .order("vendidos_30_dias", { ascending: false });
    setDemanda(dem ?? []);

    if (esAdmin) {
      const { data: aud } = await supabase
        .from("v_auditoria").select("*")
        .order("fecha", { ascending: false }).limit(20);
      setAuditoria(aud ?? []);
    }
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      const { data: r } = await supabase.rpc("rol_actual");
      setRol(r);
      setListo(true);
      cargar(r === "admin");
    });
  }, [router]);

  if (!listo) return <p className="p-6">Verificando sesión...</p>;

  const fecha = (s: string) => {
    const [, m, d] = s.split("-");
    return `${d}/${m}`;
  };

  const ingresos30 = semanas.slice(-4).reduce((s, x) => s + x.ingresos, 0);
  const unidades30 = demanda.reduce((s, p) => s + Number(p.vendidos_30_dias ?? 0), 0);
  const stockBajo = demanda.filter((p) => p.stock_actual <= p.stock_minimo).length;
  const maxSemana = Math.max(1, ...semanas.map((s) => s.ingresos));

  const top10 = demanda.filter((p) => p.vendidos_30_dias > 0).slice(0, 10);
  const maxTop = Math.max(1, ...top10.map((p) => p.vendidos_30_dias));

  const enRiesgo = demanda
    .filter((p) => p.dias_de_stock_estimados !== null && p.dias_de_stock_estimados <= 14)
    .sort((a, b) => a.dias_de_stock_estimados - b.dias_de_stock_estimados);

  const tarjeta = "border rounded-lg p-4";

  return (
    <main className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Reportes</h1>
        <a href="/" className="px-3 py-1 rounded border text-sm">Volver al inicio</a>
      </div>

      {error && <p className="text-red-500 mb-4">Error: {error}</p>}

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <div className={tarjeta}>
          <p className="text-sm opacity-70">Ingresos (últimas 4 semanas)</p>
          <p className="text-2xl font-bold">Q{ingresos30.toFixed(2)}</p>
        </div>
        <div className={tarjeta}>
          <p className="text-sm opacity-70">Unidades vendidas (30 días)</p>
          <p className="text-2xl font-bold">{unidades30}</p>
        </div>
        <div className={tarjeta}>
          <p className="text-sm opacity-70">Productos con stock bajo</p>
          <p className={`text-2xl font-bold ${stockBajo > 0 ? "text-red-500" : ""}`}>{stockBajo}</p>
        </div>
      </div>

      <section className={`${tarjeta} mb-8`}>
        <h2 className="text-lg font-semibold mb-4">Ingresos por semana</h2>
        {semanas.length === 0 ? (
          <p className="opacity-70">No hay ventas en las últimas 12 semanas.</p>
        ) : (
          <div className="flex items-end gap-2 h-56 overflow-x-auto">
            {semanas.map((s) => (
              <div key={s.semana} className="flex flex-col items-center justify-end h-full min-w-12 flex-1">
                <span className="text-xs mb-1">Q{Math.round(s.ingresos)}</span>
                <div className="w-full bg-green-600 rounded-t"
                  style={{ height: `${(s.ingresos / maxSemana) * 80}%` }}
                  title={`${s.unidades} unidades`} />
                <span className="text-xs mt-1 opacity-70">{fecha(s.semana)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <section className={tarjeta}>
          <h2 className="text-lg font-semibold mb-4">Más vendidos (30 días)</h2>
          {top10.length === 0 && <p className="opacity-70">Sin ventas en los últimos 30 días.</p>}
          <div className="flex flex-col gap-2">
            {top10.map((p) => (
              <div key={p.producto_id} className="text-sm">
                <div className="flex justify-between mb-1">
                  <span>{p.producto}</span>
                  <span className="font-semibold">{p.vendidos_30_dias}</span>
                </div>
                <div className="h-3 rounded bg-green-600"
                  style={{ width: `${(p.vendidos_30_dias / maxTop) * 100}%` }} />
              </div>
            ))}
          </div>
        </section>

        <section className={tarjeta}>
          <h2 className="text-lg font-semibold mb-4">Se agotan pronto (14 días o menos)</h2>
          {enRiesgo.length === 0 ? (
            <p className="opacity-70">Ningún producto en riesgo.</p>
          ) : (
            <table className="border-collapse text-sm w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Producto</th>
                  <th className="p-2">Stock</th>
                  <th className="p-2">Venta diaria</th>
                  <th className="p-2">Días</th>
                </tr>
              </thead>
              <tbody>
                {enRiesgo.map((p) => (
                  <tr key={p.producto_id} className="border-b">
                    <td className="p-2">{p.producto}</td>
                    <td className="p-2">{p.stock_actual}</td>
                    <td className="p-2">{Number(p.promedio_diario_30d).toFixed(1)}</td>
                    <td className={`p-2 font-bold ${p.dias_de_stock_estimados <= 7 ? "text-red-500" : "text-yellow-500"}`}>
                      {p.dias_de_stock_estimados}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {rol === "admin" && (
        <section className={tarjeta}>
          <h2 className="text-lg font-semibold mb-4">Últimas acciones (auditoría)</h2>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Tabla</th>
                  <th className="p-2">Registro</th>
                  <th className="p-2">Acción</th>
                  <th className="p-2">Hecho por</th>
                  <th className="p-2">Cambios</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.map((a) => (
                  <tr key={a.id} className="border-b align-top">
                    <td className="p-2 whitespace-nowrap">{new Date(a.fecha).toLocaleString("es-GT")}</td>
                    <td className="p-2">{a.tabla}</td>
                    <td className="p-2">{a.registro_id}</td>
                    <td className="p-2">{a.accion}</td>
                    <td className="p-2">{a.hecho_por}</td>
                    <td className="p-2 max-w-md truncate" title={JSON.stringify(a.cambios)}>
                      {JSON.stringify(a.cambios)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}