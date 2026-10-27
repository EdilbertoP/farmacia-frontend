"use client";
import {useState} from 'react';
import type {Propuesta} from '@/lib/ia/agente/types';
import {solicitarIA} from '@/utils/consultar-ia';
import PropuestaCard from './PropuestaCard';
import Resultados from './Resultados';
import Exportar from './Exportar';
export default function Historial({admin=false,puedeExportar=false}:{admin?:boolean;puedeExportar?:boolean}){
 const [lista,setLista]=useState<Propuesta[]>([]),[error,setError]=useState(''),[cargando,setCargando]=useState(false),[auditoria,setAuditoria]=useState<Record<string,unknown>[]|null>(null);
 async function cargar(audit=false){setCargando(true);setError('');try{const r=await solicitarIA<{resultado:Propuesta[]}>('/api/ia/propuestas',{comando:audit?'auditoria':'historial'});if(audit)setAuditoria(r.resultado as unknown as Record<string,unknown>[]);else setLista(r.resultado);}catch(e){setError(e instanceof Error?e.message:'No se pudo cargar.');}finally{setCargando(false);}}
 return <details className="iaV3-historial" onToggle={e=>{if(e.target===e.currentTarget&&e.currentTarget.open)void cargar();}}><summary>Historial del agente y propuestas</summary><div className="iaV3-acciones"><button type="button" disabled={cargando} onClick={()=>void cargar()}>Actualizar historial</button>{admin&&<button type="button" disabled={cargando} onClick={()=>void cargar(true)}>Ver auditoría</button>}</div>{puedeExportar&&<Exportar/>}{cargando&&<p>Cargando…</p>}{error&&<p role="alert">{error}</p>}{lista.map(p=><details key={`${p.id}:${p.revision}`}><summary>{p.herramienta} · {p.estado} · {new Date(p.creada_en).toLocaleString('es-GT',{timeZone:'America/Guatemala'})}</summary><PropuestaCard propuesta={p} puedeExportar={puedeExportar}/></details>)}{!cargando&&!error&&!lista.length&&<p>No hay propuestas guardadas para tu usuario.</p>}{auditoria&&<Resultados datos={{eventos:auditoria}}/>}</details>;
}
