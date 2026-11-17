// Sincronización «primero local»: la app siempre trabaja con los datos del navegador
// (funciona sin internet) y cuando hay conexión sube o baja una copia completa a la nube.
//
// Cada guardado en la nube aumenta un número de versión. Si al subir la versión de la
// nube ya no es la que conocía este dispositivo, otro dispositivo guardó antes: si aquí
// no había cambios se baja la copia nueva; si había cambios en ambos lados, se le pregunta
// a la usuaria cuál conservar (nunca se pisa nada en silencio).

/**
 * remoto: { leer(): {datos, version}|null, insertar(datos): version, actualizar(datos, versionEsperada): version|null }
 * local:  { exportar(): datos, importar(datos), tieneDatos(): bool }
 * meta:   { get(): {version, sucio}, set(parcial) }  — guardado fuera de la base de datos
 * alEstado(estado, detalle)  estados: 'sincronizando' | 'ok' | 'sin_conexion' | 'conflicto' | 'error'
 */
export function crearSincronizador({ remoto, local, meta, alEstado = () => {} }) {
  let ocupado = false
  let repetir = false
  let cambios = 0 // cuenta los cambios locales para saber si hubo más mientras se subía
  let conflicto = null
  let aplicandoRemoto = false
  let activo = true
  const asegurarActivo = () => { if (!activo) throw new Error('Sincronización detenida.') }

  const estado = (e, d) => alEstado(e, d)

  async function bajar(r) {
    asegurarActivo()
    aplicandoRemoto = true
    try {
      await local.importar(r.datos)
    } finally {
      aplicandoRemoto = false
    }
    asegurarActivo()
    meta.set({ version: r.version, sucio: false, ultimaSync: new Date().toISOString() })
  }

  async function subir(versionEsperada) {
    asegurarActivo()
    const marca = cambios
    const datos = await local.exportar()
    asegurarActivo()
    const v = versionEsperada == null ? await remoto.insertar(datos) : await remoto.actualizar(datos, versionEsperada)
    asegurarActivo()
    if (v == null) return false // otro dispositivo guardó primero
    meta.set({ version: v, sucio: cambios !== marca, ultimaSync: new Date().toISOString() })
    return true
  }

  async function sincronizar() {
    if (!activo) return
    if (conflicto) return estado('conflicto', conflicto)
    if (ocupado) { repetir = true; return }
    ocupado = true
    estado('sincronizando')
    try {
      for (let intento = 0; intento < 3; intento++) {
        // Leer el estado local DESPUÉS de la consulta remota. Durante la espera pueden
        // producirse ediciones; usar una copia anterior permitiría sobrescribirlas.
        const r = await remoto.leer()
        asegurarActivo()
        const m = meta.get()
        if (!r) {
          // La nube está vacía: se sube lo de este dispositivo.
          await subir(null)
        } else if (m.version == null) {
          // Primera vez en este dispositivo.
          const hayDatos = await local.tieneDatos()
          // Otra edición pudo ocurrir mientras se comprobaba la base local.
          if (hayDatos || meta.get().sucio) { conflicto = r; return estado('conflicto', r) }
          await bajar(r)
        } else if (r.version > m.version) {
          if (m.sucio || meta.get().sucio) { conflicto = r; return estado('conflicto', r) }
          await bajar(r)
        } else if (m.sucio || r.version < m.version) {
          if (!(await subir(r.version))) continue // cambió entre leer y subir: reintentar
        }
        break
      }
      asegurarActivo()
      estado(meta.get().sucio ? 'sincronizando' : 'ok', meta.get())
    } catch (e) {
      if (activo) estado(esErrorDeRed(e) ? 'sin_conexion' : 'error', e)
    } finally {
      ocupado = false
      if (activo && (repetir || (meta.get().sucio && !conflicto))) {
        repetir = false
        if (meta.get().sucio && !conflicto) setTimeout(sincronizar, 1500)
      }
    }
  }

  return {
    sincronizar,
    detener() { activo = false; conflicto = null; repetir = false },
    marcarCambio() {
      if (!activo || aplicandoRemoto) return
      cambios++
      meta.set({ sucio: true })
    },
    get aplicandoRemoto() { return aplicandoRemoto },
    get conflicto() { return conflicto },
    /** eleccion: 'nube' (bajar y descartar lo local) o 'local' (subir y reemplazar la nube). */
    async resolver(eleccion) {
      asegurarActivo()
      const r = conflicto
      if (!r) return
      if (eleccion === 'nube') {
        // El conflicto mostrado puede haberse quedado desactualizado mientras la
        // persona decide: comprobar que la copia remota no cambió otra vez.
        const actual = await remoto.leer()
        if (!actual) throw new Error('La copia de la nube ya no está disponible.')
        if (actual.version !== r.version) {
          conflicto = actual
          return estado('conflicto', conflicto)
        }
        await bajar(actual)
      } else {
        const ok = await subir(r.version)
        if (!ok) { conflicto = await remoto.leer(); return estado('conflicto', conflicto) }
      }
      conflicto = null
      estado('ok', meta.get())
    },
  }
}

export function esErrorDeRed(e) {
  const t = String(e?.message || e)
  return /fetch|network|Failed to fetch|NetworkError|timeout|offline/i.test(t) || (typeof navigator !== 'undefined' && navigator.onLine === false)
}
