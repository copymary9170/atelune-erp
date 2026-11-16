import { useLiveQuery } from 'dexie-react-hooks'
import { db, CONFIG_INICIAL } from '../db.js'

// Luna creciente que sostiene un libro abierto: el logo de Atelune.
export function Logo({ size = 34, claro = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" fill="none">
      <path d="M43 5a27 27 0 1 0 17 45A23 23 0 1 1 43 5z" fill="#b8955a" />
      <path d="M13 29c6.5-3.2 12.5-2.8 19 1 6.5-3.8 12.5-4.2 19-1v20c-6.5-3.2-12.5-2.8-19 1-6.5-3.8-12.5-4.2-19-1z"
        fill={claro ? '#fffdfa' : '#fffdfa'} stroke="#1d2340" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M32 30v20" stroke="#1d2340" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M19 34.5c3.5-1 6.8-.7 9.5.9M36 35.4c2.7-1.6 6-1.9 9.5-.9" stroke="#b8955a" strokeWidth="1.4" strokeLinecap="round" />
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
