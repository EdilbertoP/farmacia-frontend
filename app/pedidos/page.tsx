"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Item = { producto_id: number; nombre: string; precio: number; cantidad: number; stock: number };

export default function Pedidos() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [rol, setRol] = useState<string | null>(null);
  const [productos, setProductos] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<Record<number, string>>({});
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [abierto, setAbierto] = useState<number | null>(null);

  const [cliente, setCliente] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [items, setItems] = useState<Item[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const supabase = createClient();
    const { data: prods } = await supabase
      .from("productos").select("id, codigo, nombre, precio, stock")
      .eq("activo", true).order("nombre");
    setProductos(prods ?? []);

    const { data: us } = await supabase.from("usuarios").select("id, nombre");
    setUsuarios(Object.fromEntries((us ?? []).map((u) => [u.id, u.nombre])));

    const { data: peds, error } = await supabase
      .from("pedidos")
      .select("*, pedido_detalle(id, cantidad, precio_unitario, subtotal, productos(nombre))")
      .order("creado_en", { ascending: false })
      .limit(50);
    if (error) setError(error.message);
    else setPedidos(peds ?? []);
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

  function agregarItem() {
    const p = productos.find((x) => x.id === Number(productoId));
    const cant = Number(cantidad);
    if (!p || cant <= 0) return;
    const existente = items.find((i) => i.producto_id === p.id);
    if (existente) {
      setItems(items.map((i) =>
        i.producto_id === p.id ? { ...i, cantidad: i.cantidad + cant } : i));
    } else {
      setItems([...items, {
        producto_id: p.id, nombre: p.nombre, precio: Number(p.precio),
        cantidad: cant, stock: p.stock,
      }]);
    }
    setProductoId("");
    setCantidad("1");
  }

  async function registrarPedido() {
    setGuardando(true);
    setMensaje(null);
    setError(null);
    const { data, error } = await createClient().rpc("app_registrar_pedido", {
      p_cliente_nombre: cliente.trim() || "Consumidor final",
      p_items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
    });
    setGuardando(false);
    if (error) setError(error.message);
    else {
      setMensaje(`Pedido #${data} registrado`);
      setItems([]);
      setCliente("");
      cargar();
    }
  }

  async function anular(id: number) {
    const motivo = prompt(`Motivo para anular el pedido #${id}:`);
    if (!motivo) return;
    const { error } = await createClient().rpc("app_anular_pedido", {
      p_pedido_id: id,
      p_motivo: motivo,
    });
    if (error) alert("Error: " + error.message);
    else cargar();
  }

  if (!listo) return <p className="p-6">Verificando sesión...</p>;

  const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const input = "border rounded px-3 py-2 bg-transparent";

  return (
    <main className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <a href="/" className="px-3 py-1 rounded border text-sm">Volver al inicio</a>
      </div>

      <section className="border rounded-lg p-4 mb-6 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Nuevo pedido</h2>

        <label className="flex flex-col gap-1 text-sm max-w-md">
          Cliente
          <input className={input} placeholder="Consumidor final"
            value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </label>

        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-sm">
            Producto
            <select className={input} value={productoId}
              onChange={(e) => setProductoId(e.target.value)}>
              <option value="">Selecciona...</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id} disabled={p.stock === 0} className="text-black">
                  {p.nombre} - Q{Number(p.precio).toFixed(2)} (stock: {p.stock})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Cantidad
            <input type="number" min="1" className={`${input} w-24`}
              value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </label>
          <button type="button" onClick={agregarItem} className="border rounded px-4 py-2">
            Agregar
          </button>
        </div>

        {items.length > 0 && (
          <table className="border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Producto</th>
                <th className="p-2">Precio</th>
                <th className="p-2">Cantidad</th>
                <th className="p-2">Subtotal</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.producto_id} className="border-b">
                  <td className="p-2">{i.nombre}</td>
                  <td className="p-2">Q{i.precio.toFixed(2)}</td>
                  <td className={`p-2 ${i.cantidad > i.stock ? "text-red-500 font-bold" : ""}`}>
                    {i.cantidad} {i.cantidad > i.stock && `(solo hay ${i.stock})`}
                  </td>
                  <td className="p-2">Q{(i.precio * i.cantidad).toFixed(2)}</td>
                  <td className="p-2">
                    <button onClick={() => setItems(items.filter((x) => x.producto_id !== i.producto_id))}
                      className="text-red-500">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex items-center gap-4">
          <p className="text-lg font-semibold">Total: Q{total.toFixed(2)}</p>
          <button onClick={registrarPedido} disabled={items.length === 0 || guardando}
            className="bg-green-600 text-white rounded px-4 py-2 font-semibold disabled:opacity-50">
            {guardando ? "Registrando..." : "Registrar pedido"}
          </button>
        </div>

        {mensaje && <p className="text-green-500">{mensaje}</p>}
        {error && <p className="text-red-500">Error: {error}</p>}
      </section>

      <h2 className="text-lg font-semibold mb-2">Últimos pedidos</h2>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-full">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">#</th>
              <th className="p-2">Fecha</th>
              <th className="p-2">Cliente</th>
              <th className="p-2">Vendedor</th>
              <th className="p-2">Total</th>
              <th className="p-2">Estado</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <>
                <tr key={p.id} className={`border-b ${p.estado === "anulado" ? "opacity-50" : ""}`}>
                  <td className="p-2">{p.id}</td>
                  <td className="p-2 whitespace-nowrap">{new Date(p.creado_en).toLocaleString("es-GT")}</td>
                  <td className="p-2">{p.cliente_nombre}</td>
                  <td className="p-2">{usuarios[p.usuario_id] ?? "-"}</td>
                  <td className="p-2">Q{Number(p.total).toFixed(2)}</td>
                  <td className="p-2">{p.estado}</td>
                  <td className="p-2 flex gap-2">
                    <button onClick={() => setAbierto(abierto === p.id ? null : p.id)}
                      className="border rounded px-2 py-1">
                      {abierto === p.id ? "Ocultar" : "Ver detalle"}
                    </button>
                    {rol === "admin" && p.estado !== "anulado" && (
                      <button onClick={() => anular(p.id)}
                        className="border border-red-500 text-red-500 rounded px-2 py-1">
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
                {abierto === p.id && (
                  <tr key={`d-${p.id}`} className="border-b">
                    <td colSpan={7} className="p-3">
                      {p.estado === "anulado" && (
                        <p className="text-red-500 mb-2">
                          Anulado por {usuarios[p.anulado_por] ?? "-"}: {p.motivo_anulacion}
                        </p>
                      )}
                      <ul className="list-disc pl-6">
                        {p.pedido_detalle.map((d: any) => (
                          <li key={d.id}>
                            {d.cantidad} x {d.productos?.nombre} a Q{Number(d.precio_unitario).toFixed(2)}
                            {" "}= Q{Number(d.subtotal ?? d.cantidad * d.precio_unitario).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}