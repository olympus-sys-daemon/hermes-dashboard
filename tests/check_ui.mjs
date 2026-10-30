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
check('no wind figure (the word "window" is fine)', !/\bwind\b/i.test(src))
check('no fixed 50vh clock', !/50vh/.test(src))
check('page height is bound to the window (100vh), not the parent', /height: '100vh'/.test(src))
check('nothing scrolls: no auto or scroll overflow anywhere', !/overflow(Y|X)?: '(auto|scroll)'/.test(src))
check('page is clipped to its box (overflow hidden)', /overflow: 'hidden'/.test(src))
check('no page title above the content', !/children: 'Dashboard'/.test(src))
check('root is a size container, so units are measured against the window', /containerType: 'size'/.test(src))
check('sizes use container units (cqw/cqh) and no fixed pixel heights', /\d(cqw|cqh)/.test(src) && !/[^A-Za-z]height: [0-9]/.test(src))
check('clock is not placed in a column (no fractional three-column layout)', !/minmax\(0, 1\.8fr\)/.test(src))
check('clock stacks above date, weather text and the box row', /function HomeTab[\s\S]*?Clock[\s\S]*?WeatherLine[\s\S]*?BoxRow/.test(src))
check('home boxes are a single row of four', /repeat\(4, minmax\(0, 1fr\)\)/.test(src))
const homeSrc = src.slice(src.indexOf('function Clock'), src.indexOf('function Spark'))
check('home section (clock, weather, boxes) has no graphs or stats', !/Spark|Stats|svg|viewBox/.test(homeSrc))
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
