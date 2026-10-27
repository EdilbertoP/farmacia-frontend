"use client";
const etiqueta=(s:string)=>s.replaceAll('_',' ');
export default function Resultados({datos}:{datos:Record<string,unknown>}){
 return <div className="iaV3-resultados">{Object.entries(datos).map(([key,value])=>{
  if(value===null||typeof value!=='object')return <p key={key}><strong>{etiqueta(key)}: </strong>{value===null?'No calculable / sin datos':String(value)}</p>;
  if(Array.isArray(value)){
   const objetos=value.filter((v):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v));
   if(objetos.length){const cols=[...new Set(objetos.flatMap(v=>Object.keys(v)))].filter(k=>objetos.some(v=>v[k]===null||typeof v[k]!=='object')).slice(0,8);return <details key={key} open={['productos','categorias','propuestas'].includes(key)}><summary>{etiqueta(key)} ({value.length})</summary><div className="iaV3-tabla"><table><thead><tr>{cols.map(c=><th key={c}>{etiqueta(c)}</th>)}</tr></thead><tbody>{objetos.slice(0,50).map((o,i)=><tr key={i}>{cols.map(c=><td key={c}>{o[c]===null?'Sin datos':typeof o[c]==='object'?'Ver detalle':String(o[c]??'—')}</td>)}</tr>)}</tbody></table></div>{value.length>50&&<p>Se muestran 50 filas.</p>}</details>;}
   return <p key={key}><strong>{etiqueta(key)}: </strong>{value.map(v=>String(v)).join(', ')}</p>;
  }
  return <details key={key}><summary>{etiqueta(key)}</summary><Resultados datos={value as Record<string,unknown>}/></details>;
 })}</div>;
}
