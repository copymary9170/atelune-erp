import { useLiveQuery } from 'dexie-react-hooks'
import { db, CONFIG_INICIAL } from '../db.js'

export function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M40 6a26 26 0 1 0 18 44A22 22 0 1 1 40 6z" fill="#b8955a" />
      <path d="M14 30c6-3 12-3 18 1 6-4 12-4 18-1v18c-6-3-12-3-18 1-6-4-12-4-18-1z" fill="#f7f2ea" />
      <path d="M32 31v18" stroke="#1f2a44" strokeWidth="1.5" />
    </svg>
  )
}

export function Modal({ titulo, onCerrar, children, ancho }) {
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={'modal' + (ancho ? ' ancho' : '')} role="dialog" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  )
}

// Campo de texto/número con etiqueta. Los números vacíos se guardan como null (dato pendiente).
export function Campo({ label, ayuda, valor, onCambio, tipo = 'text', className = '', ...rest }) {
  const v = valor ?? ''
  return (
    <div className={'campo ' + className}>
      {label && <label>{label}</label>}
      {tipo === 'textarea' ? (
        <textarea value={v} onChange={(e) => onCambio(e.target.value)} {...rest} />
      ) : (
        <input
          type={tipo}
          value={v}
          step={tipo === 'number' ? 'any' : undefined}
          onChange={(e) => onCambio(tipo === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
          {...rest}
        />
      )}
      {ayuda && <div className="ayuda">{ayuda}</div>}
    </div>
  )
}

export function Selector({ label, valor, onCambio, opciones, vacio, className = '' }) {
  return (
    <div className={'campo ' + className}>
      {label && <label>{label}</label>}
      <select value={valor ?? ''} onChange={(e) => onCambio(e.target.value)}>
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Avisos({ lista, titulo = 'Datos pendientes' }) {
  if (!lista?.length) return null
  return (
    <div className="avisos">
      <strong>{titulo}</strong>
      <ul>
        {lista.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  )
}

export function useConfig() {
  return useLiveQuery(() => db.config.get('general'), [], CONFIG_INICIAL) ?? CONFIG_INICIAL
}

export function useTasa() {
  return useLiveQuery(() => db.tasas.orderBy('fecha').last(), [])
}
