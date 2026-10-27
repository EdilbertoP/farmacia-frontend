import type {Periodo} from '../chat-types';
import {rangoPeriodo} from '../chat-domain';
export function variacion(actual:number,anterior:number){return anterior===0?null:Math.round((actual-anterior)/anterior*10000)/100;}
export function horizonte(proximoMes:boolean,dias:number,ahora=new Date()){
 if(!proximoMes)return {dias,etiqueta:`próximos ${dias} días`};
 const local=new Date(ahora.getTime()-6*3600000),y=local.getUTCFullYear(),m=local.getUTCMonth();
 const desde=new Date(Date.UTC(y,m+1,1)+6*3600000),hasta=new Date(Date.UTC(y,m+2,1)+6*3600000);
 return {dias:Math.round((hasta.getTime()-desde.getTime())/86400000),etiqueta:`próximo mes: ${desde.toISOString().slice(0,10)} a ${hasta.toISOString().slice(0,10)} (fin exclusivo, Guatemala)`};
}
export function pronosticar(serie:{fecha:string;cantidad:number}[],dias:number,ahora=new Date()){
 const fin=Date.parse(rangoPeriodo('semana_actual',ahora).desde),inicio=fin-12*7*86400000;
 const semanas=Array(12).fill(0) as number[];const diasConVenta=new Set<string>();let primera=Infinity;
 for(const s of serie){const t=Date.parse(s.fecha);if(!Number.isFinite(t)||t<inicio||t>=fin)continue;semanas[Math.floor((t-inicio)/(7*86400000))]+=s.cantidad;diasConVenta.add(new Date(t-6*3600000).toISOString().slice(0,10));primera=Math.min(primera,t);}
 const suficientes=primera<=fin-8*7*86400000&&diasConVenta.size>=4;
 const promedio=semanas.slice(-4).reduce((a,b)=>a+b,0)/4;
 let mae=0;for(let i=8;i<12;i++){const p=semanas.slice(i-4,i).reduce((a,b)=>a+b,0)/4;mae+=Math.abs(semanas[i]-p);}
 return {metodo:'Promedio móvil de 4 semanas completas',semanas,desde:new Date(inicio).toISOString(),hasta:new Date(fin).toISOString(),
  suficientes,estimacion:suficientes?Math.ceil(promedio/7*dias):null,mae_semanal:suficientes?Math.round(mae/4*100)/100:null,
  limitacion:'Se exigen al menos ocho semanas desde la primera venta observada y ventas en cuatro fechas distintas. MAE calculado en cuatro predicciones semanales con ventana móvil. Sin registro de disponibilidad por fecha no puede separarse falta de demanda de falta de stock. No mide estacionalidad ni garantiza compras futuras.'};
}
export function periodoAnterior(p:Periodo):Periodo|null{return p==='mes_actual'?'mes_anterior':p==='semana_actual'?'semana_pasada':p==='trimestre_actual'?'trimestre_anterior':null;}
