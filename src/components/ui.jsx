import { useId } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, CONFIG_INICIAL } from '../db.js'

// Logo de Atelune: una luna creciente y detalles dorados sobre azul noche.
export function Logo({ size = 34 }) {
  const g = 'atelune-g' + useId().replace(/\W/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" fill="none">
      <defs>
        <linearGradient id={g} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10213b" />
          <stop offset="1" stopColor="#294766" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${g})`} />
      <path d="M38 12a21 21 0 1 0 13 33A17.5 17.5 0 1 1 38 12z" fill="#fff" />
      <path d="M46 18l1.7 5.5L53 25l-5.3 1.5L46 32l-1.7-5.5L39 25l5.3-1.5z" fill="#d7b473" />
    </svg>
  )
}

/** Escudo + nombre, usado en el menú, el acceso y los documentos. */
export function Marca({ size = 34, subtitulo = 'Administración' }) {
  return (
    <div className="marca">
      <div className="marca-escudo"><Logo size={size} /></div>
      <div>
        <strong>Atelune</strong>
        <small>{subtitulo}</small>
      </div>
    </div>
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

export function Avisos({ lista, titulo = 'Datos pendientes', tono }) {
  if (!lista?.length) return null
  return (
    <div className={'avisos' + (tono === 'suave' ? ' suave' : '')}>
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

// ¿Cómo se pagó? Define la cuenta contable de contrapartida.
export function SelectorPago({ valor, onCambio, metodos, label = '¿Cómo se pagó?', sinAporte }) {
  return (
    <Selector label={label} valor={valor} onCambio={onCambio}
      opciones={[
        ...(sinAporte ? [] : [{ value: '', label: 'Ya lo tenía / aporte propio (capital)' }]),
        ...metodos.map((m) => ({ value: m.nombre, label: 'Pagado con ' + m.nombre })),
        { value: 'credito', label: 'A crédito (queda por pagar)' },
      ]} />
  )
}
