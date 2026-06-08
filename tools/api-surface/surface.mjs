// Public API surface snapshot. For each published package it reads the built
// rollup `.d.ts`, resolves every exported symbol (following re-export aliases
// across packages), and emits a normalized, comment-free, name-sorted list of
// signatures. Committed snapshots in this directory are the reviewed surface;
// any change to what consumers can import shows up as a diff.
//
//   node tools/api-surface/surface.mjs --check    # fail on drift (CI)
//   node tools/api-surface/surface.mjs --write     # update snapshots
import ts from 'typescript'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')

// Discover every publishable package's entry .d.ts from the workspace, so a
// newly added package is gated automatically (no hand-maintained list to drift
// out of sync with packages/*).
function discoverPackages() {
  const pkgsDir = resolve(root, 'packages')
  const out = {}
  for (const dir of readdirSync(pkgsDir).sort()) {
    const pkgJsonPath = join(pkgsDir, dir, 'package.json')
    if (!existsSync(pkgJsonPath)) continue
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
    if (pkg.private) continue
    const types = pkg.types ?? './dist/index.d.ts'
    out[pkg.name] = [join('packages', dir, types)]
  }
  return out
}

const PACKAGES = discoverPackages()

function extractSurface(entry) {
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
  })
  const checker = program.getTypeChecker()
  const sf = program.getSourceFile(entry)
  if (!sf) throw new Error(`could not load ${entry}`)
  const moduleSymbol = checker.getSymbolAtLocation(sf)
  if (!moduleSymbol) return '(no exports)\n'
  const exports = checker.getExportsOfModule(moduleSymbol)
  const printer = ts.createPrinter({ removeComments: true })

  // Code-unit sort (not localeCompare) so the ordering is identical regardless
  // of the runner's locale/ICU build — a snapshot must be reproducible.
  const sorted = [...exports].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const lines = []
  const unresolved = []
  for (const exp of sorted) {
    let sym = exp
    if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym)
    const decls = sym.getDeclarations() ?? []
    const sigs = decls
      .map((d) =>
        printer
          .printNode(ts.EmitHint.Unspecified, d, d.getSourceFile())
          .replace(/\bexport\b\s*/g, '')
          .replace(/\bdeclare\b\s*/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean)
    if (sigs.length === 0) unresolved.push(exp.name)
    lines.push(`${exp.name}: ${sigs.join(' | ') || '(unresolved)'}`)
  }
  // A bare `(unresolved)` means a cross-package type alias couldn't be resolved
  // — almost always because a sibling package's dist wasn't built. Fail loudly
  // rather than baking a blind spot into the committed snapshot.
  if (unresolved.length > 0) {
    throw new Error(
      `${entry}: could not resolve declarations for: ${unresolved.join(', ')}. ` +
        `Run \`pnpm build\` so sibling dist/*.d.ts exist, then retry.`,
    )
  }
  return lines.join('\n') + '\n'
}

const mode = process.argv.includes('--write') ? 'write' : 'check'
let failed = false

for (const [pkg, entries] of Object.entries(PACKAGES)) {
  const surface = entries
    .map((e) => extractSurface(resolve(root, e)))
    .join('\n')
  const snapPath = resolve(here, `${pkg.replace(/[@/]/g, '_')}.api.txt`)

  if (mode === 'write') {
    writeFileSync(snapPath, surface)
    console.log(`wrote ${snapPath}`)
    continue
  }

  if (!existsSync(snapPath)) {
    console.error(`MISSING snapshot for ${pkg} — run: pnpm api:update`)
    failed = true
    continue
  }
  const prev = readFileSync(snapPath, 'utf8')
  if (prev !== surface) {
    failed = true
    console.error(`\nAPI SURFACE CHANGED: ${pkg}`)
    const prevLines = prev.split('\n')
    const nextLines = surface.split('\n')
    const all = new Set([...prevLines, ...nextLines])
    for (const line of all) {
      if (!line) continue
      const inPrev = prevLines.includes(line)
      const inNext = nextLines.includes(line)
      if (inPrev && !inNext) console.error(`  - ${line}`)
      if (!inPrev && inNext) console.error(`  + ${line}`)
    }
  } else {
    console.log(`ok  ${pkg}`)
  }
}

if (failed) {
  console.error('\nPublic API surface drifted. If intentional, run `pnpm api:update` and review the diff (it may be a breaking change → bump versions).')
  process.exit(1)
}
console.log('\nAll API surfaces match their snapshots.')
