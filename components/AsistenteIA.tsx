"use client";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ConsultaIAError, solicitarIA } from "@/utils/consultar-ia";
import type { FilaChat, RespuestaChat } from "@/lib/ia/chat-types";
import { estilosAsistente as styles } from "./asistente-estilos";

type Mensaje = { id: string; rol: "usuario" | "asistente"; texto: string; resultado?: RespuestaChat; fecha?: string; error?: boolean };
type Seleccion = { id: number; nombre: string };
type Estado = { modelo: string; comprobada: boolean; mensaje: string; aviso?: string; uso?: { intentos: number; limite: number; restantes: number; espera_segundos: number } | null };
const RAPIDAS = [
  { titulo: "Consultar existencias", pregunta: "¿Cuántas unidades hay de este producto?" },
  { titulo: "Stock bajo", pregunta: "¿Qué productos están en el mínimo o por debajo?" },
  { titulo: "Más vendidos", pregunta: "Muéstrame los 5 productos más vendidos de los últimos 30 días" },
  { titulo: "Resumen del negocio", pregunta: "Dame un resumen del inventario actual y las ventas de este mes" },
];
function Spark({ small = false }: { small?: boolean }) {
  return <svg aria-hidden="true" width={small ? 18 : 23} height={small ? 18 : 23} viewBox="0 0 24 24" fill="none"><path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z" fill="currentColor" /></svg>;
}
function inicial(uid: string) {
  try {
    const s = JSON.parse(sessionStorage.getItem(`farmacia-chat:${uid}`) || "null");
    const mensajes: Mensaje[] = Array.isArray(s?.mensajes) ? s.mensajes.filter((m: Mensaje) => ["usuario", "asistente"].includes(m.rol) && typeof m.texto === "string" && m.texto.length <= 12000 && typeof m.id === "string")
      .slice(-30).map((m: Mensaje) => ({ id: m.id, rol: m.rol, texto: m.texto, fecha: typeof m.fecha === "string" ? m.fecha : undefined })) : [];
    return { mensajes, contexto: typeof s?.contexto === "string" && s.contexto.length <= 6000 ? s.contexto : undefined,
      seleccion: Number.isSafeInteger(s?.seleccion?.id) && s.seleccion.id > 0 && typeof s.seleccion.nombre === "string" ? s.seleccion as Seleccion : null };
  } catch { return { mensajes: [] as Mensaje[], contexto: undefined, seleccion: null }; }
}
function TablaDatos({ filas }: { filas: FilaChat[] }) {
  const cols: { key: keyof FilaChat; label: string; format?: (v: number | null) => string }[] = [
    { key: "producto", label: "Producto" }, { key: "codigo", label: "Código" },
    { key: "stock", label: "Disponibles" }, { key: "minimo", label: "Mínimo" },
    { key: "precio", label: "Precio", format: (v) => v === null ? "—" : `Q${v.toFixed(2)}` },
    { key: "unidades", label: "Vendidas" }, { key: "estimacion", label: "Estimadas", format: (v) => v === null ? "Datos insuficientes" : String(v) },
    { key: "diasStock", label: "Días de stock", format: (v) => v === null ? "Datos insuficientes" : String(v) },
  ];
  const visibles = cols.filter((c) => c.key === "producto" || filas.some((r) => r[c.key] !== undefined));
  return <div className={styles.tableWrap} tabIndex={0} aria-label="Datos consultados, desplaza horizontalmente si es necesario"><table><thead><tr>{visibles.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{filas.map((r, i) => <tr key={`${r.id ?? i}`}>
    {visibles.map((c) => <td key={c.key}>{c.format && (typeof r[c.key] === "number" || r[c.key] === null) ? c.format(r[c.key] as number | null) : String(r[c.key] ?? "—")}</td>)}
  </tr>)}</tbody></table></div>;
}

function ChatPanel({ uid }: { uid: string }) {
  const [base] = useState(() => inicial(uid));
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>(base.mensajes);
  const [contexto, setContexto] = useState<string | undefined>(base.contexto);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(base.seleccion);
  const [pregunta, setPregunta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [espera, setEspera] = useState(0);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [errorEstado, setErrorEstado] = useState("");
  const [ultimaPregunta, setUltimaPregunta] = useState("");
  const [ultimoError, setUltimoError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null), panel = useRef<HTMLElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const fin = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null);
  const enviando = useRef(false), secuencia = useRef(0);
  const pathname = usePathname();
  const noDisponible = ocupado || verificando || espera > 0;

  useEffect(() => {
    try { sessionStorage.setItem(`farmacia-chat:${uid}`, JSON.stringify({ mensajes: mensajes.slice(-30).map(({ id, rol, texto, fecha }) => ({ id, rol, texto, fecha })), contexto, seleccion })); }
    catch { /* Chat remains usable when browser storage is unavailable. */ }
  }, [uid, mensajes, contexto, seleccion]);
  useEffect(() => {
    const event = (e: Event) => {
      const d = (e as CustomEvent<{ productoId?: number; nombre?: string; pregunta?: string }>).detail;
      if (!d || !Number.isSafeInteger(d.productoId) || Number(d.productoId) < 1) return;
      setSeleccion({ id: d.productoId!, nombre: String(d.nombre || "Producto seleccionado").slice(0, 200) });
      setPregunta(d.pregunta || "¿Cuántas unidades hay de este producto?");
      setAbierto(true);
    };
    window.addEventListener("farmacia:asistente", event);
    return () => window.removeEventListener("farmacia:asistente", event);
  }, []);
  useEffect(() => {
    if (!abierto) return;
    const timer = window.setTimeout(() => input.current?.focus(), 0);
    const abort = new AbortController();
    solicitarIA<Estado>("/api/ia/chat", { accion: "estado" }, abort.signal).then((r) => {
      setEstado((prev) => ({ ...r, comprobada: Boolean(prev?.comprobada && prev.modelo === r.modelo) }));
      setErrorEstado("");
      if (r.uso?.espera_segundos) setEspera((v) => Math.max(v, r.uso!.espera_segundos));
    }).catch((e) => { if (!abort.signal.aborted) setErrorEstado(e instanceof Error ? e.message : "No se pudo revisar la configuración."); });
    return () => { clearTimeout(timer); abort.abort(); };
  }, [abierto, uid]);
  useEffect(() => {
    if (!abierto) return;
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, ocupado, abierto]);
  useEffect(() => {
    const timer = window.setInterval(() => setEspera((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => () => { controller.current?.abort(); }, []);

  function cerrar() { setAbierto(false); trigger.current?.focus(); }
  function teclado(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") { e.preventDefault(); cerrar(); }
    if (e.key !== "Tab") return;
    const elems = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length > 0);
    if (!elems.length) return;
    const first = elems[0], last = elems[elems.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  async function refrescarUso() {
    try {
      const r = await solicitarIA<Estado>("/api/ia/chat", { accion: "estado" });
      setEstado((prev) => ({ ...r, comprobada: Boolean(prev?.comprobada && prev.modelo === r.modelo) }));
    } catch { /* The request error itself is already shown to the user. */ }
  }
  async function enviar(texto: string, eleccion_id?: number) {
    if (!texto.trim() || enviando.current || (noDisponible && !eleccion_id)) return;
    enviando.current = true; setOcupado(true); setPregunta(""); setUltimoError(""); setUltimaPregunta(texto);
    const seq = ++secuencia.current;
    const abort = new AbortController(); controller.current = abort;
    setMensajes((m) => [...m.slice(-28), { id: crypto.randomUUID(), rol: "usuario", texto, fecha: new Date().toISOString() }]);
    try {
      const historial = mensajes.filter((m) => !m.error).slice(-6).map((m) => ({ rol: m.rol, texto: m.texto.slice(0, 1200) }));
      const r = await solicitarIA<RespuestaChat>("/api/ia/chat", { accion: "chat", mensaje: texto, historial, contexto,
        ...(seleccion ? { producto_id: seleccion.id } : {}), ...(eleccion_id ? { eleccion_id } : {}) }, abort.signal);
      if (seq !== secuencia.current) return;
      setContexto(r.contexto); if (!eleccion_id) setEspera(10);
      if (r.filas?.length === 1 && r.filas[0].id) {
        setSeleccion({ id: r.filas[0].id, nombre: r.filas[0].producto });
      } else if ((r.filas?.length ?? 0) > 1 || (r.opciones?.length ?? 0) > 0 || r.intencion === "resumen") {
        setSeleccion(null);
      }
      setMensajes((m) => [...m, { id: crypto.randomUUID(), rol: "asistente", texto: r.texto, resultado: r, fecha: r.consultado_en }]);
      if (r.modelo) setEstado((s) => ({ modelo: r.modelo!, comprobada: true, mensaje: "Gemini respondió correctamente.", uso: s?.uso }));
    } catch (e) {
      if (seq !== secuencia.current || abort.signal.aborted) return;
      const textoError = e instanceof Error ? e.message : "No pude completar la consulta.";
      setMensajes((m) => [...m, { id: crypto.randomUUID(), rol: "asistente", texto: textoError, error: true, fecha: new Date().toISOString() }]);
      setUltimoError(e instanceof ConsultaIAError ? e.codigo : "CONEXION");
      if (e instanceof ConsultaIAError && e.reintentarEn) setEspera(e.reintentarEn);
    } finally {
      if (seq === secuencia.current) { enviando.current = false; setOcupado(false); void refrescarUso(); input.current?.focus(); }
    }
  }
  async function comprobar() {
    if (enviando.current || noDisponible) return;
    enviando.current = true; setVerificando(true); setErrorEstado("");
    try {
      const r = await solicitarIA<Estado>("/api/ia/chat", { accion: "comprobar" });
      setEstado((s) => ({ ...r, uso: s?.uso })); setEspera(10);
    } catch (e) {
      setErrorEstado(e instanceof Error ? e.message : "No se pudo comprobar la conexión.");
      if (e instanceof ConsultaIAError && e.reintentarEn) setEspera(e.reintentarEn);
    } finally { enviando.current = false; setVerificando(false); void refrescarUso(); }
  }
  function nueva() {
    secuencia.current++; controller.current?.abort(); enviando.current = false;
    setMensajes([]); setContexto(undefined); setPregunta(""); setSeleccion(null); setUltimoError(""); setUltimaPregunta(""); setOcupado(false);
    input.current?.focus();
  }
  function submit(e: FormEvent) { e.preventDefault(); void enviar(pregunta); }
  if (pathname === "/login") return null;

  return <div className={styles.root}>
    {abierto && <>
      <div className={styles.backdrop} onClick={cerrar} aria-hidden="true" />
      <section ref={panel} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="asistente-titulo" onKeyDown={teclado}>
        <header className={styles.header}>
          <span className={styles.avatar}><Spark /></span>
          <div className={styles.heading}><h2 id="asistente-titulo">Asistente IA</h2><p>Farmacia La Salud · Inventario y ventas</p></div>
          <button type="button" className={styles.iconButton} onClick={cerrar} aria-label="Cerrar asistente">×</button>
        </header>
        <div className={styles.toolbar}>
          <span><i className={estado?.comprobada ? styles.dotOk : styles.dot} aria-hidden="true" />{estado?.comprobada ? "Conexión verificada" : "Consultas con Gemini"}</span>
          <button type="button" onClick={nueva} disabled={verificando}>Nueva conversación</button>
        </div>
        <div className={styles.messages} role="log" aria-label="Conversación con el asistente" aria-live="polite" aria-relevant="additions">
          <article className={styles.welcome}>
            <div className={styles.eyebrow}><Spark small /> DATOS DE TU FARMACIA</div>
            <h3>¿Qué necesitas consultar?</h3>
            <p>Pregunta con tus palabras. Consulto los datos disponibles y te pido aclaración si hay varias coincidencias.</p>
            <div className={styles.quickGrid}>{RAPIDAS.map((q) => <button key={q.titulo} type="button" disabled={noDisponible} onClick={() => void enviar(q.pregunta)}>{q.titulo}<span aria-hidden="true">↗</span></button>)}</div>
            <p className={styles.example}>Por ejemplo: “¿cuántos jabones quedan?” o “ventas de ayer”.</p>
          </article>
          {mensajes.map((m) => <article key={m.id} className={`${styles.message} ${m.rol === "usuario" ? styles.user : styles.assistant} ${m.error ? styles.error : ""}`}>
            <span className={styles.author}>{m.rol === "usuario" ? "Tú" : "Asistente IA"}</span>
            <p>{m.texto}</p>
            {m.rol === "asistente" && !m.resultado?.fuente && m.fecha && <span className={styles.transcriptTime}>Respuesta del {new Date(m.fecha).toLocaleString("es-GT", { timeZone: "America/Guatemala" })}</span>}
            {m.resultado?.filas && m.resultado.filas.length > 0 && <TablaDatos filas={m.resultado.filas} />}
            {m.resultado?.opciones && m.resultado.opciones.length > 0 && <div className={styles.choices}>{m.resultado.opciones.map((o) => <button key={o.id} type="button" disabled={ocupado || verificando || m !== mensajes[mensajes.length - 1]} onClick={() => void enviar(`Selecciono ${o.nombre} (${o.codigo})`, o.id)}><strong>{o.nombre}</strong><span>{o.codigo} · Elegir producto</span></button>)}</div>}
            {m.resultado?.nota && <p className={styles.note}>{m.resultado.nota}</p>}
            {m.resultado?.fuente && <div className={styles.source}><span>{m.resultado.fuente}</span>{m.resultado.periodo && <span>{m.resultado.periodo}</span>}<span>Consulta: {new Date(m.resultado.consultado_en).toLocaleString("es-GT", { timeZone: "America/Guatemala" })}</span></div>}
          </article>)}
          {ocupado && <div className={styles.thinking} role="status"><span />Interpretando tu pregunta y consultando los datos…</div>}
          {ultimoError && !ocupado && <div className={styles.recovery}>{ultimoError === "CONTEXTO_CADUCADO" || ultimoError === "ELECCION_INVALIDA"
            ? <button type="button" onClick={nueva}>Iniciar nueva conversación</button>
            : ultimoError === "SESION" ? <a href="/login">Iniciar sesión</a>
            : ultimoError === "LIMITE_DIARIO" ? <p>Podrás consultar de nuevo mañana.</p>
            : <button type="button" disabled={noDisponible} onClick={() => void enviar(ultimaPregunta)}>Reintentar pregunta{espera > 0 ? ` (${espera}s)` : ""}</button>}</div>}
          <div ref={fin} />
        </div>
        {seleccion && <div className={styles.selection}><span>Producto en contexto: <strong>{seleccion.nombre}</strong></span><button type="button" disabled={ocupado} aria-label="Quitar producto del contexto" onClick={() => { setSeleccion(null); setContexto(undefined); }}>×</button></div>}
        <div className={styles.composer}>
          <form onSubmit={submit}>
            <label htmlFor="pregunta-asistente" className={styles.srOnly}>Pregunta al asistente</label>
            <textarea ref={input} id="pregunta-asistente" rows={2} maxLength={1000} value={pregunta} placeholder="Escribe tu pregunta…" disabled={ocupado || verificando}
              onChange={(e) => setPregunta(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(pregunta); } }} />
            <button type="submit" disabled={noDisponible || !pregunta.trim()} aria-label="Enviar pregunta"><svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="m3 3 18 9-18 9 4-9-4-9Zm4 9h14" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg></button>
          </form>
          <div className={styles.composerMeta}><span>{espera > 0 ? `Próxima consulta en ${espera}s` : "Enter para enviar · Shift+Enter para otra línea"}</span><span>{pregunta.length}/1000</span></div>
          <details className={styles.connection}>
            <summary>Conexión y uso de IA{estado?.uso ? ` · ${estado.uso.restantes}/${estado.uso.limite} disponibles hoy` : ""}</summary>
            <p>Modelo: <strong>{estado?.modelo || "gemini-3.5-flash-lite"}</strong></p>
            <p>{estado?.mensaje || "La clave se configura de forma privada en Vercel."}</p>
            {estado?.aviso && <p>{estado.aviso}</p>}
            {errorEstado && <p className={styles.connectionError} role="alert">{errorEstado}</p>}
            <button type="button" disabled={noDisponible} onClick={comprobar}>{verificando ? "Comprobando…" : "Comprobar conexión"}</button>
            <p>La prueba consume una consulta. Límite local: 30 al día y 10 segundos entre consultas. La cuota de Google se aplica además.</p>
          </details>
          <p className={styles.disclaimer}>Consulta datos; las operaciones se confirman en sus pantallas. Revisa las estimaciones antes de decidir.</p>
        </div>
      </section>
    </>}
    <button ref={trigger} type="button" className={styles.trigger} onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-haspopup="dialog" aria-label={abierto ? "Cerrar asistente de IA" : "Abrir asistente de IA"}><Spark /><span>Asistente IA</span><span className={styles.triggerDot} aria-hidden="true" /></button>
  </div>;
}

export default function AsistenteIA() {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    let mounted = true, current: string | null = null;
    let authEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEvent = true;
      if (!mounted) return;
      if (current && current !== session?.user?.id) { try { sessionStorage.removeItem(`farmacia-chat:${current}`); } catch {} }
      current = session?.user?.id ?? null; setUid(current);
    });
    supabase.auth.getUser().then(({ data }) => { if (mounted && !authEvent) { current = data.user?.id ?? null; setUid(current); } }).catch(() => { if (mounted) setUid(null); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  return uid ? <ChatPanel key={uid} uid={uid} /> : null;
}
