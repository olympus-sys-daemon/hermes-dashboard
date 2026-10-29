// Offline source checks for desktop/plugin.js. No app or network needed.
// Run from the repo root: node tests/check_ui.mjs   (exit 0 = all passed)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = readFileSync(path.join(here, '..', 'desktop', 'plugin.js'), 'utf8')
const failures = []
const check = (name, ok) => {
  console.log(`${ok ? 'ok    ' : 'FAIL  '}${name}`)
  if (!ok) failures.push(name)
}

check('tabs are home and energy only', /id: 'home'/.test(src) && /id: 'energy'/.test(src) && !/id: 'today'/.test(src))
check('no forecast in the page', !/forecast/i.test(src))
check('clock block is half the window height (50vh)', /height: '50vh'/.test(src))
check('no wind figure on the weather card', !/wind/i.test(src))
check('no hardcoded colours', !/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(src))
check('no JSX syntax', !/<[A-Za-z][A-Za-z0-9]*[\s/>]/.test(src.replace(/\/\/.*$/gm, '')))
const imports = [...src.matchAll(/from '([^']+)'/g)].map(m => m[1])
check('imports only the SDK, react and react/jsx-runtime',
  imports.length > 0 && imports.every(i => ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'].includes(i)))

if (failures.length) {
  console.log(`${failures.length} failing`)
  process.exit(1)
}
console.log('all ok')
