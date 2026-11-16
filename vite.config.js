import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Supabase: solo se pasan al navegador DOS valores públicos (la URL y la clave anon/publishable).
// Se aceptan los nombres que crea la integración de Vercel con cualquier prefijo
// (SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, MIPREFIJO_SUPABASE_URL…). Las claves secretas
// (service_role, JWT secret) nunca se incluyen.
function buscar(env, patrones) {
  for (const p of patrones) {
    const k = Object.keys(env).find((x) => p.test(x) && env[x])
    if (k) return env[k]
  }
  return ''
}

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }
  const url = buscar(env, [/^VITE_SUPABASE_URL$/, /^NEXT_PUBLIC_SUPABASE_URL$/, /SUPABASE_URL$/])
  const clave = buscar(env, [
    /^VITE_SUPABASE_ANON_KEY$/, /^NEXT_PUBLIC_SUPABASE_ANON_KEY$/, /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY$/,
    /SUPABASE_ANON_KEY$/, /SUPABASE_PUBLISHABLE_KEY$/,
  ])
  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(url),
      __SUPABASE_CLAVE__: JSON.stringify(clave),
    },
  }
})
