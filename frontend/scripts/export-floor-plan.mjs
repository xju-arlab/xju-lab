import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const server = await createServer({ root, cacheDir: 'node_modules/.vite-floor-plan', server: { middlewareMode: true, watch: null, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' })
try {
  const { FloorPlan } = await server.ssrLoadModule('/src/features/seats/FloorPlan.tsx')
  const svg = renderToStaticMarkup(createElement(FloorPlan, { seats: [], showAssignments: false, onSelect() {} }))
  await mkdir(new URL('../public/', import.meta.url), { recursive: true })
  await writeFile(new URL('../public/lab-floor-plan.svg', import.meta.url), '<?xml version="1.0" encoding="UTF-8"?>\n' + svg + '\n')
  console.log('Exported public/lab-floor-plan.svg (31 workstations + printer, recreation and tool areas).')
} finally {
  await server.close()
}
