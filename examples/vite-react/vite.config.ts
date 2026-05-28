import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactPerfscope from '@react-perfscope/vite'

export default defineConfig({
  plugins: [reactPerfscope(), react()],
})
