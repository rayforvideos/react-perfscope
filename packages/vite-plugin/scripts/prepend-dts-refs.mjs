import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const banner = '/// <reference lib="es2015" />\n/// <reference lib="dom" />\n\n'

for (const name of ['index.d.ts', 'index.d.cts']) {
  const file = join(distDir, name)
  if (!existsSync(file)) continue
  const content = readFileSync(file, 'utf8')
  if (content.startsWith('/// <reference')) continue
  writeFileSync(file, banner + content)
  console.log(`[postbuild] prepended lib refs to ${name}`)
}
