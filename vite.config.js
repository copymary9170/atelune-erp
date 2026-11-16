import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Solo variables públicas: VITE_* y NEXT_PUBLIC_* (las que crea la integración Vercel + Supabase).
  // Nunca exponer SUPABASE_SERVICE_ROLE_KEY ni otras claves secretas.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
