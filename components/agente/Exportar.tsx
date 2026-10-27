"use client";
import {useState} from 'react';
export default function Exportar({id}:{id?:string}){
 const [ocupado,setOcupado]=useState(false),[error,setError]=useState('');
 async function descargar(){setOcupado(true);setError('');try{const r=await fetch('/api/ia/exportar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(id?{tipo:'analisis',id}:{tipo:'inventario'})});if(!r.ok){const e=await r.json();throw new Error(e.error||'No se pudo exportar.');}const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=id?'farmacia-analisis.csv':'farmacia-inventario.csv';a.click();URL.revokeObjectURL(url);}catch(e){setError(e instanceof Error?e.message:'Error de descarga.');}finally{setOcupado(false);}}
 return <div className="iaV3-acciones"><button type="button" disabled={ocupado} onClick={descargar}>{ocupado?'Exportando…':id?'Exportar análisis aprobado (CSV)':'Exportar inventario actual (CSV)'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
