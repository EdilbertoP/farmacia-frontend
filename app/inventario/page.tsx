"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function Inventario() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [rol, setRol] = useState<string | null>(null);
  const [inventario, setInventario] = useState<any[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [soloBajo, setSoloBajo] = useState(false);
  const [buscar, setBuscar] = useState("");

  const [productoId, setProductoId] = useState("");
  const [tipo, setTipo] = useState("entrada");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const supabase = createClient();
    const { data: inv, error } = await supabase
      .from("v_inventario").select("*").order("nombre");
    if (error) setError(error.message);
    else setInventario(inv ?? []);

    const { data: his } = await supabase
      .from("v_historial_inventario").select("*")
      .order("fecha", { ascending: false }).limit(30);
    setHistorial(his ?? []);
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      const { data: r } = await supabase.rpc("rol_actual");
      setRol(r);
      setListo(true);
      cargar();
    });
  }, [router]);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    setError(null);
    const { data, error } = await createClient().rpc("app_registrar_movimiento", {
      p_producto_id: Number(productoId),
      p_tipo: tipo,
      p_cantidad: Number(cantidad),
      p_motivo: motivo.trim() || null,
    });
    setGuardando(false);
    if (error) setError(error.message);
    else {
      setMensaje(`Movimiento registrado. Stock actual: ${data}`);
      setCantidad("");
      setMotivo("");
      cargar();
    }
  }

  if (!listo) return <p className="p-6">Verificando sesión...</p>;

  const filtrados = inventario.filter(
    (p) =>
      (!soloBajo || p.stock_bajo) &&
      `${p.codigo} ${p.nombre}`.toLowerCase().includes(buscar.toLowerCase())
  );
  const totalBajo = inventario.filter((p) => p.stock_bajo).length;
  const input = "border rounded px-3 py-2 bg-transparent";

  return (
    <main className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Inventario</h1>
        <a href="/" className="px-3 py-1 rounded border text-sm">Volver al inicio</a>
      </div>

      {totalBajo > 0 && (
        <p className="mb-4 p-3 rounded border border-red-500 text-red-500">
          Hay {totalBajo} producto(s) con stock bajo.
        </p>
      )}

      {rol === "admin" && (
        <form onSubmit={registrar} className="border rounded-lg p-4 mb-6 grid gap-3 md:grid-cols-4">
          <h2 className="md:col-span-4 text-lg font-semibold">Registrar movimiento</h2>

          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            Producto
            <select required className={input} value={productoId}
              onChange={(e) => setProductoId(e.target.value)}>
              <option value="">Selecciona...</option>
              {inventario.map((p) => (
                <option key={p.id} value={p.id} className="text-black">
                  {p.codigo} - {p.nombre} (stock: {p.stock})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Tipo
            <select className={input} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="entrada" className="text-black">Entrada (llegó mercadería)</option>
              <option value="ajuste" className="text-black">Ajuste (conteo físico)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            {tipo === "entrada" ? "Cantidad que entra" : "Stock real contado"}
            <input required type="number" min={tipo === "entrada" ? 1 : 0} className={input}
              value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm md:col-span-4">
            Motivo {tipo === "ajuste" && "(obligatorio: vencido, dañado, conteo...)"}
            <input required={tipo === "ajuste"} className={input} value={motivo}
              onChange={(e) => setMotivo(e.target.value)} />
          </label>

          <div className="md:col-span-4">
            <button type="submit" disabled={guardando}
              className="bg-green-600 text-white rounded px-4 py-2 font-semibold disabled:opacity-50">
              {guardando ? "Guardando..." : "Registrar"}
            </button>
          </div>

          {mensaje && <p className="md:col-span-4 text-green-500">{mensaje}</p>}
          {error && <p className="md:col-span-4 text-red-500">Error: {error}</p>}
        </form>
      )}

      <div className="flex flex-wrap gap-4 items-center mb-3">
        <input placeholder="Buscar por código o nombre..." className={input}
          value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} />
          Solo stock bajo
        </label>
      </div>

      <div className="overflow-x-auto mb-8">
        <table className="border-collapse text-sm w-full">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Código</th>
              <th className="p-2">Producto</th>
              <th className="p-2">Categoría</th>
              <th className="p-2">Precio</th>
              <th className="p-2">Stock</th>
              <th className="p-2">Mínimo</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="p-2">{p.codigo}</td>
                <td className="p-2">{p.nombre}</td>
                <td className="p-2">{p.categoria}</td>
                <td className="p-2">Q{Number(p.precio).toFixed(2)}</td>
                <td className={`p-2 ${p.stock_bajo ? "text-red-500 font-bold" : ""}`}>{p.stock}</td>
                <td className="p-2">{p.stock_minimo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold mb-2">Últimos movimientos</h2>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-full">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Fecha</th>
              <th className="p-2">Producto</th>
              <th className="p-2">Tipo</th>
              <th className="p-2">Cantidad</th>
              <th className="p-2">Stock final</th>
              <th className="p-2">Motivo</th>
              <th className="p-2">Hecho por</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="p-2 whitespace-nowrap">{new Date(m.fecha).toLocaleString("es-GT")}</td>
                <td className="p-2">{m.producto}</td>
                <td className="p-2">{m.tipo}</td>
                <td className="p-2">{m.cantidad}</td>
                <td className="p-2">{m.stock_resultante}</td>
                <td className="p-2">{m.motivo}</td>
                <td className="p-2">{m.hecho_por}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}