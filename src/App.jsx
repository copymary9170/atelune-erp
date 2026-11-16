import { useEffect, useState } from 'react'
import { nubeConfigurada, useSesion, iniciarNube, detenerNube } from './nube.js'
import { Acceso, IndicadorNube, ConflictoNube } from './components/Nube.jsx'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Logo } from './components/ui.jsx'
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

const MENU = [
  { to: '/', label: 'Inicio', end: true },
  { seccion: 'Ventas' },
  { to: '/cotizaciones', label: 'Cotizaciones' },
  { to: '/pedidos', label: 'Pedidos y producción' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/plantillas', label: 'Plantillas de trabajo' },
  { seccion: 'Operación' },
  { to: '/inventario', label: 'Inventario' },
  { to: '/activos', label: 'Activos y máquinas' },
  { to: '/proveedores', label: 'Proveedores' },
  { seccion: 'Finanzas' },
  { to: '/gastos', label: 'Gastos y pagos' },
  { to: '/contabilidad', label: 'Contabilidad' },
  { seccion: 'Ajustes' },
  { to: '/tasas', label: 'Tasa de cambio' },
  { to: '/configuracion', label: 'Configuración y respaldo' },
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
        <button onClick={() => setAbierto(true)} aria-label="Abrir menú">☰</button>
        <Logo size={26} /> <strong>Atelune</strong>
      </div>
      <nav className={'menu' + (abierto ? ' abierto' : '')} onClick={() => setAbierto(false)}>
        <div className="marca">
          <Logo />
          <div>
            <strong>Atelune</strong>
            <small>Administración</small>
          </div>
        </div>
        {MENU.map((m) =>
          m.seccion ? (
            <div className="seccion" key={m.seccion}>{m.seccion}</div>
          ) : (
            <NavLink key={m.to} to={m.to} end={m.end}>{m.label}</NavLink>
          ),
        )}
        <div className="seccion">Próximas etapas</div>
        {PROXIMAMENTE.map((p) => (
          <div className="proximo" key={p}>{p}</div>
        ))}
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
          <Route path="/contabilidad" element={<Contabilidad />} />
          <Route path="/tasas" element={<Tasas />} />
          <Route path="/configuracion" element={<Configuracion />} />
        </Routes>
      </main>
    </div>
  )
}
