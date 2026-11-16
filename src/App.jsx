import { useState } from 'react'
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

const MENU = [
  { to: '/', label: 'Inicio', end: true },
  { seccion: 'Ventas' },
  { to: '/cotizaciones', label: 'Cotizaciones' },
  { to: '/plantillas', label: 'Plantillas de trabajo' },
  { seccion: 'Operación' },
  { to: '/inventario', label: 'Inventario' },
  { to: '/activos', label: 'Activos y máquinas' },
  { seccion: 'Ajustes' },
  { to: '/tasas', label: 'Tasa de cambio' },
  { to: '/configuracion', label: 'Configuración y respaldo' },
]

const PROXIMAMENTE = ['Pedidos y producción', 'Clientes y proveedores', 'Libro diario y mayor', 'Estados financieros', 'Reportes']

export default function App() {
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
      </nav>
      <main className="contenido">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/activos" element={<Activos />} />
          <Route path="/cotizaciones" element={<Cotizaciones />} />
          <Route path="/cotizaciones/:id" element={<CotizacionEditor />} />
          <Route path="/plantillas" element={<Plantillas />} />
          <Route path="/tasas" element={<Tasas />} />
          <Route path="/configuracion" element={<Configuracion />} />
        </Routes>
      </main>
    </div>
  )
}
