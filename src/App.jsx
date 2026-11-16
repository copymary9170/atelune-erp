import { useEffect, useState } from 'react'
import { nubeConfigurada, useSesion, iniciarNube, detenerNube } from './nube.js'
import { Acceso, IndicadorNube, ConflictoNube } from './components/Nube.jsx'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Logo, Marca } from './components/ui.jsx'
import Inicio from './pages/Inicio.jsx'
import Inventario from './pages/Inventario.jsx'
import Activos from './pages/Activos.jsx'
import Cotizaciones from './pages/Cotizaciones.jsx'
import CotizacionEditor from './pages/CotizacionEditor.jsx'
import CotizacionImprimir from './pages/CotizacionImprimir.jsx'
import Plantillas from './pages/Plantillas.jsx'
import Tasas from './pages/Tasas.jsx'
import Configuracion from './pages/Configuracion.jsx'
import Pedidos, { PedidoDetalle } from './pages/Pedidos.jsx'
import Contactos from './pages/Contactos.jsx'
import Gastos from './pages/Gastos.jsx'
import Contabilidad from './pages/Contabilidad.jsx'
import Reparto from './pages/Reparto.jsx'

const MENU = [
  { to: '/', icono: 'M3 11l9-8 9 8M5 10v10h14V10', label: 'Inicio', end: true },
  { seccion: 'Ventas' },
  { to: '/cotizaciones', icono: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6', label: 'Cotizaciones' },
  { to: '/pedidos', icono: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10', label: 'Pedidos y producción' },
  { to: '/clientes', icono: 'M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', label: 'Clientes' },
  { to: '/plantillas', icono: 'M4 4h16v5H4zM4 13h7v7H4zM15 13h5v7h-5z', label: 'Plantillas de trabajo' },
  { seccion: 'Operación' },
  { to: '/inventario', icono: 'M4 7h16v13H4zM4 7l2-4h12l2 4M9 12h6', label: 'Inventario' },
  { to: '/activos', icono: 'M6 9V3h12v6M6 17H4v-6h16v6h-2M7 14h10v7H7z', label: 'Activos y máquinas' },
  { to: '/proveedores', icono: 'M2 6h11v10H2zM13 9h5l4 4v3h-9zM6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4', label: 'Proveedores' },
  { seccion: 'Finanzas' },
  { to: '/gastos', icono: 'M3 6h18v12H3zM3 10h18M7 15h4', label: 'Gastos y pagos' },
  { to: '/reparto', icono: 'M12 3v9h9A9 9 0 1 1 12 3M15 3.5A9 9 0 0 1 20.5 9H15z', label: 'Reparto de utilidades' },
  { to: '/contabilidad', icono: 'M5 3h14v18H5zM9 7h6M9 11h6M9 15h3', label: 'Contabilidad' },
  { seccion: 'Ajustes' },
  { to: '/tasas', icono: 'M4 8h14l-3-3M20 16H6l3 3', label: 'Tasa de cambio' },
  { to: '/configuracion', icono: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2', label: 'Configuración y respaldo' },
]

const PROXIMAMENTE = ['Reportes de rentabilidad']

export default function App() {
  const sesion = useSesion()
  const uid = sesion?.user?.id
  useEffect(() => {
    if (uid) iniciarNube(uid)
    else detenerNube()
  }, [uid])

  if (nubeConfigurada && sesion === undefined) return <p className="muted" style={{ padding: 30 }}>Cargando…</p>
  if (nubeConfigurada && !sesion) return <Acceso />
  return <Interfaz />
}

function Interfaz() {
  const [abierto, setAbierto] = useState(false)
  const { pathname } = useLocation()
  if (pathname.endsWith('/imprimir'))
    return (
      <Routes>
        <Route path="/cotizaciones/:id/imprimir" element={<CotizacionImprimir />} />
      </Routes>
    )
  return (
    <div className="app">
      <div className="barra-movil">
        <button onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto}>
          <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <Logo size={24} /> <strong>Atelune</strong>
      </div>
      <nav className={'menu' + (abierto ? ' abierto' : '')} onClick={() => setAbierto(false)}>
        <Marca />
        {MENU.map((m) =>
          m.seccion ? (
            <div className="seccion" key={m.seccion}>{m.seccion}</div>
          ) : (
            <NavLink key={m.to} to={m.to} end={m.end}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={m.icono} /></svg>
              {m.label}
            </NavLink>
          ),
        )}
        <div className="seccion">Próximas etapas</div>
        {PROXIMAMENTE.map((p) => (
          <div className="proximo" key={p}>{p}</div>
        ))}
        <div className="espaciador" />
        {nubeConfigurada && <IndicadorNube />}
      </nav>
      <ConflictoNube />
      <main className="contenido">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/activos" element={<Activos />} />
          <Route path="/cotizaciones" element={<Cotizaciones />} />
          <Route path="/cotizaciones/:id" element={<CotizacionEditor />} />
          <Route path="/plantillas" element={<Plantillas />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/pedidos/:id" element={<PedidoDetalle />} />
          <Route path="/clientes" element={<Contactos tipo="clientes" key="clientes" />} />
          <Route path="/proveedores" element={<Contactos tipo="proveedores" key="proveedores" />} />
          <Route path="/gastos" element={<Gastos />} />
          <Route path="/reparto" element={<Reparto />} />
          <Route path="/contabilidad" element={<Contabilidad />} />
          <Route path="/tasas" element={<Tasas />} />
          <Route path="/configuracion" element={<Configuracion />} />
        </Routes>
      </main>
    </div>
  )
}
