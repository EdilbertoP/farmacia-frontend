"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const TABLAS = [
  "productos", "categorias", "movimientos_inventario", "pedidos",
  "pedido_detalle", "usuarios", "auditoria", "sugerencias_ia",
];

const VISTAS = [
  "v_inventario", "v_historial_inventario", "v_resumen_demanda",
  "v_ventas_por_producto", "v_auditoria",
];

type Usuario = { email: string; nombre?: string; rol?: string };

export default function Home() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [seleccionada, setSeleccionada] = useState("productos");
  const [filas, setFilas] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // 1. Verificar la sesión
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const { data: perfil } = await supabase
        .from("usuarios")
        .select("nombre, rol")
        .eq("email", data.user.email!)
        .maybeSingle();
      setUsuario({
        email: data.user.email!,
        nombre: perfil?.nombre,
        rol: perfil?.rol,
      });
    });
  }, [router]);

  // 2. Cargar la tabla seleccionada
  useEffect(() => {
    if (!usuario) return;
    setCargando(true);
    setError(null);
    createClient()
      .from(seleccionada)
      .select(
        seleccionada === "usuarios"
          ? "id, nombre, email, rol, activo, creado_en, actualizado_en"
          : "*"
      )
      .limit(100)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setFilas(data ?? []);
        setCargando(false);
      });
  }, [seleccionada, usuario]);

  async function cerrarSesion() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  if (!usuario) return <p className="p-6">Verificando sesión...</p>;

  const columnas = filas.length > 0 ? Object.keys(filas[0]) : [];

  const boton = (nombre: string) => (
    <button
      key={nombre}
      onClick={() => setSeleccionada(nombre)}
      className={`px-3 py-1 rounded border text-sm ${
        seleccionada === nombre ? "bg-green-600 text-white" : ""
      }`}
    >
      {nombre}
    </button>
  );

  return (
    <main className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Farmacia La Salud</h1>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {usuario.nombre ?? usuario.email} ({usuario.rol ?? "sin rol"})
          </span>
          <a href="/productos" className="px-3 py-1 rounded border">Productos</a>
          <a href="/inventario" className="px-3 py-1 rounded border">Inventario</a>
          <a href="/pedidos" className="px-3 py-1 rounded border">Pedidos</a>
          <a href="/reportes" className="px-3 py-1 rounded border">Reportes</a>
          <button onClick={cerrarSesion} className="px-3 py-1 rounded border">
            Cerrar sesión
          </button>
        </div>
      </div>

      <p className="font-semibold mb-1">Tablas</p>
      <div className="flex flex-wrap gap-2 mb-3">{TABLAS.map(boton)}</div>

      <p className="font-semibold mb-1">Vistas</p>
      <div className="flex flex-wrap gap-2 mb-6">{VISTAS.map(boton)}</div>

      <h2 className="text-xl font-semibold mb-2">{seleccionada}</h2>

      {cargando && <p>Cargando...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}
      {!cargando && !error && filas.length === 0 && (
        <p>Sin datos (la tabla está vacía o no tienes permiso para verla).</p>
      )}

      {!cargando && !error && filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                {columnas.map((c) => (
                  <th key={c} className="p-2 whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => (
                <tr key={i} className="border-b">
                  {columnas.map((c) => (
                    <td key={c} className="p-2 whitespace-nowrap">
                      {typeof fila[c] === "object" && fila[c] !== null
                        ? JSON.stringify(fila[c])
                        : String(fila[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}