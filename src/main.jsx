import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { inicializar } from './db.js'
import { nubeConfigurada } from './nube.js'

// Cuando hay sesión en la nube, App selecciona la base de la cuenta antes
// de inicializarla. No crear datos en la base compartida al arrancar.
const listo = nubeConfigurada ? Promise.resolve() : inicializar()
listo.then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  )
})
