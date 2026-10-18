"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Categoria = { id: number; nombre: string };

const FORM_VACIO = {
  id: null as number | null,
  codigo: "",
  nombre: "",
  descripcion: "",
  categoria_id: "",
  precio: "",
  stock: "0",
  stock_minimo: "0",
  requiere_receta: false,
  activo: true,
};

export default function Productos() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [productos, setProductos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const supabase = createClient();
    const { data: prods, error } = await supabase
      .from("productos")
      .select("*, categorias(nombre)")
      .order("nombre");
    if (error) setError(error.message);
    else setProductos(prods ?? []);

    const { data: cats } = await supabase
      .from("categorias")
      .select("id, nombre")
      .order("nombre");
    setCategorias(cats ?? []);
  }

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else {
        setListo(true);
        cargar();
      }
    });
  }, [router]);

  function cambiar(campo: string, valor: string | boolean) {
    setForm({ ...form, [campo]: valor });
  }

  function editar(p: any) {
    setMensaje(null);
    setError(null);
    setForm({
      id: p.id,
      codigo: p.codigo ?? "",
      nombre: p.nombre ?? "",
      descripcion: p.descripcion ?? "",
      categoria_id: String(p.categoria_id ?? ""),
      precio: String(p.precio ?? ""),
      stock: String(p.stock ?? 0),
      stock_minimo: String(p.stock_minimo ?? 0),
      requiere_receta: !!p.requiere_receta,
      activo: !!p.activo,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    setError(null);

    const datos = {
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim(),
      categoria_id: Number(form.categoria_id),
      precio: Number(form.precio),
      stock: Number(form.stock),
      stock_minimo: Number(form.stock_minimo),
      requiere_receta: form.requiere_receta,
      activo: form.activo,
    };

    const supabase = createClient();
    const { error } = form.id
      ? await supabase.from("productos").update(datos).eq("id", form.id)
      : await supabase.from("productos").insert(datos);

    setGuardando(false);
    if (error) {
      setError(error.message);
    } else {
      setMensaje(form.id ? "Producto actualizado" : "Producto agregado");
      setForm(FORM_VACIO);
      cargar();
    }
  }

  if (!listo) return <p className="p-6">Verificando sesión...</p>;

  const input = "border rounded px-3 py-2 bg-transparent";

  return (
    <main className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Productos</h1>
        <a href="/" className="px-3 py-1 rounded border text-sm">
          Volver al inicio
        </a>
      </div>

      <form onSubmit={guardar} className="border rounded-lg p-4 mb-6 grid gap-3 md:grid-cols-3">
        <h2 className="md:col-span-3 text-lg font-semibold">
          {form.id ? `Editando: ${form.nombre}` : "Agregar producto"}
        </h2>

        <label className="flex flex-col gap-1 text-sm">
          Código
          <input required className={input} value={form.codigo}
            onChange={(e) => cambiar("codigo", e.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Nombre
          <input required className={input} value={form.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Categoría
          <select required className={input} value={form.categoria_id}
            onChange={(e) => cambiar("categoria_id", e.target.value)}>
            <option value="">Selecciona...</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id} className="text-black">{c.nombre}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm md:col-span-3">
          Descripción
          <input className={input} value={form.descripcion}
            onChange={(e) => cambiar("descripcion", e.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Precio (Q)
          <input required type="number" step="0.01" min="0" className={input}
            value={form.precio} onChange={(e) => cambiar("precio", e.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Stock
          <input required type="number" min="0" className={input}
            value={form.stock} onChange={(e) => cambiar("stock", e.target.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Stock mínimo
          <input required type="number" min="0" className={input}
            value={form.stock_minimo} onChange={(e) => cambiar("stock_minimo", e.target.value)} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.requiere_receta}
            onChange={(e) => cambiar("requiere_receta", e.target.checked)} />
          Requiere receta
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.activo}
            onChange={(e) => cambiar("activo", e.target.checked)} />
          Activo
        </label>

        <div className="md:col-span-3 flex gap-2">
          <button type="submit" disabled={guardando}
            className="bg-green-600 text-white rounded px-4 py-2 font-semibold disabled:opacity-50">
            {guardando ? "Guardando..." : form.id ? "Guardar cambios" : "Agregar"}
          </button>
          {form.id && (
            <button type="button" onClick={() => setForm(FORM_VACIO)}
              className="border rounded px-4 py-2">
              Cancelar
            </button>
          )}
        </div>

        {mensaje && <p className="md:col-span-3 text-green-500">{mensaje}</p>}
        {error && <p className="md:col-span-3 text-red-500">Error: {error}</p>}
      </form>

      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-full">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Código</th>
              <th className="p-2">Nombre</th>
              <th className="p-2">Categoría</th>
              <th className="p-2">Precio</th>
              <th className="p-2">Stock</th>
              <th className="p-2">Receta</th>
              <th className="p-2">Activo</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className={`border-b ${p.activo ? "" : "opacity-50"}`}>
                <td className="p-2">{p.codigo}</td>
                <td className="p-2">{p.nombre}</td>
                <td className="p-2">{p.categorias?.nombre ?? "-"}</td>
                <td className="p-2">Q{Number(p.precio).toFixed(2)}</td>
                <td className={`p-2 ${p.stock <= p.stock_minimo ? "text-red-500 font-bold" : ""}`}>
                  {p.stock}
                </td>
                <td className="p-2">{p.requiere_receta ? "Sí" : "No"}</td>
                <td className="p-2">{p.activo ? "Sí" : "No"}</td>
                <td className="p-2">
                  <button onClick={() => editar(p)} className="border rounded px-2 py-1">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}