import { useEffect, useState } from 'react'
import { supabase } from '../nube.js'

// Lectura, nunca escritura: solo obtiene tasas compartidas verificadas.
// Las cuentas personales y sus pedidos históricos siguen en atelune_datos.
export function useTasasAutomaticas() {
  const [estado,setEstado] = useState({registros:[],error:null,cargando:true})
  useEffect(()=>{
    let activo=true
    if (!supabase) {setEstado({registros:[],error:'Supabase no configurado',cargando:false});return}
    supabase.from('atelune_tasas_automaticas')
      .select('id,tipo,fuente,entidad,sentido,moneda,bs_por_unidad,fecha_valor,registrado_en,url_fuente,confirmado')
      .eq('confirmado',true)
      .order('fecha_valor',{ascending:false})
      .order('registrado_en',{ascending:false})
      .limit(150)
      .then(({data,error})=>{
        if (activo) setEstado({registros:data || [],error:error?.message || null,cargando:false})
      })
      .catch(error=>{if(activo)setEstado({registros:[],error:error?.message || String(error),cargando:false})})
    return ()=>{activo=false}
  },[])
  return estado
}
