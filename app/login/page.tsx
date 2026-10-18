"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({
      email,
      password,
    });
    setCargando(false);
    if (error) setError("Correo o contraseña incorrectos");
    else router.replace("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={iniciarSesion}
        className="w-full max-w-sm border rounded-lg p-6 flex flex-col gap-4"
      >
        <h1 className="text-2xl font-bold text-center">Farmacia La Salud</h1>
        <p className="text-center text-sm opacity-70">Inicia sesión para continuar</p>

        <label className="flex flex-col gap-1 text-sm">
          Correo
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded px-3 py-2 bg-transparent"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Contraseña
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border rounded px-3 py-2 bg-transparent"
          />
        </label>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={cargando}
          className="bg-green-600 text-white rounded py-2 font-semibold disabled:opacity-50"
        >
          {cargando ? "Ingresando..." : "Iniciar sesión"}
        </button>
      </form>
    </main>
  );
}