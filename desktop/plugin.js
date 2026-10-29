/**
 * Home dashboard page for the Hermes desktop app.
 * Data comes from the plugin backend (plugin_api.py) via ctx.rest. The HA token never reaches this file.
 * Two tabs: Home (clock, today's weather, lights, room temperatures) and Energy (plugs).
 * Built only from the SDK UI kit and app theme variables. Plain ESM, no JSX.
 */

import {
  Button,
  ErrorState,
  PALETTE_AREA,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  SegmentedControl,
  Skeleton,
  host,
  useQuery,
  useQueryClient
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useState } from 'react'

const ID = 'hermes-dashboard'
const PATH = '/home-dashboard'
const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'energy', label: 'Energy' }
]
const RANGES = [
  { id: 24, label: '24 h' },
  { id: 168, label: '7 days' }
]

// Theme tokens only. No colour literals.
const TEXT = 'var(--ui-text-primary)'
const DIM = 'var(--ui-text-secondary)'
const FAINT = 'var(--ui-text-quaternary)'
const LINE = 'var(--ui-stroke-tertiary)'
const ACCENT = 'var(--ui-accent)'

const PAGE = {
  height: '100%',
  overflow: 'auto',
  boxSizing: 'border-box',
  padding: '24px 32px 40px',
  maxWidth: 1180,
  margin: '0 auto',
  color: TEXT,
  display: 'flex',
  flexDirection: 'column',
  gap: 24
}
const HEAD = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }
const CARD = {
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  padding: 18,
  boxSizing: 'border-box',
  minWidth: 0
}
const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }
const BIG = { fontSize: 34, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }

const fmt = (v, digits = 0) => (v == null || Number.isNaN(Number(v)) ? '–' : Number(v).toFixed(digits))

function useDash(ctx, path, interval) {
  return useQuery({
    queryKey: [ID, path],
    queryFn: () => ctx.rest(path),
    refetchInterval: interval
  })
}

async function lightAction(ctx, qc, entity, action, value) {
  const body = value === undefined ? { entity } : { entity, value }
  try {
    await ctx.rest(`/light/${action}`, { method: 'POST', body })
    qc.invalidateQueries({ queryKey: [ID, '/snapshot'] })
  } catch (err) {
    host.notify({ kind: 'error', message: `Light ${action} failed: ${err?.message || err}` })
  }
}

// Skeleton while loading, error panel if the backend does not answer. Returns null once data exists.
function gate(query, what) {
  if (query.data) return null
  if (query.isError) {
    return jsx('div', {
      style: { ...CARD, padding: 28 },
      children: jsx(ErrorState, {
        title: `${what} unavailable`,
        description: String(query.error?.message || 'The dashboard backend did not answer.')
      })
    })
  }
  return jsx('div', {
    style: GRID,
    children: [0, 1, 2].map(i => jsx(Skeleton, { key: i, style: { height: 132, borderRadius: 14 } }))
  })
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
  return jsxs('div', {
    style: {
      height: '50vh',
      minHeight: 240,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      fontVariantNumeric: 'tabular-nums'
    },
    children: [
      jsx('div', {
        style: { fontSize: 'min(40vh, 18vw)', fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em' },
        children: time
      }),
      jsx('div', { style: { fontSize: 18, color: DIM, marginTop: 16 }, children: date })
    ]
  })
}

function Card({ title, aside, children }) {
  return jsxs('section', {
    style: { ...CARD, display: 'flex', flexDirection: 'column', gap: 12 },
    children: [
      jsxs('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
        children: [
          jsx('h3', { style: { margin: 0, fontSize: 14, fontWeight: 600 }, children: title }),
          aside ? jsx('span', { style: { fontSize: 12, color: DIM }, children: aside }) : null
        ]
      }),
      children
    ]
  })
}

function Spark({ points, height = 64 }) {
  if (!points || points.length < 2) {
    return jsx('div', {
      style: { height, display: 'grid', placeItems: 'center', color: FAINT, fontSize: 12 },
      children: 'No history yet'
    })
  }
  const vals = points.map(p => p[1])
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const W = 300
  const line = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * W
      const y = height - ((p[1] - min) / span) * (height - 6) - 3
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return jsxs('svg', {
    viewBox: `0 0 ${W} ${height}`,
    preserveAspectRatio: 'none',
    style: { width: '100%', height, display: 'block' },
    children: [
      jsx('path', { key: 'area', d: `${line} L${W},${height} L0,${height} Z`, fill: ACCENT, opacity: 0.14 }),
      jsx('path', {
        key: 'line',
        d: line,
        fill: 'none',
        stroke: ACCENT,
        strokeWidth: 1.5,
        strokeLinejoin: 'round',
        vectorEffect: 'non-scaling-stroke'
      })
    ]
  })
}

function Stats({ stats, unit = '' }) {
  if (!stats) return null
  const cell = (label, v) =>
    jsxs('div', {
      children: [
        jsx('div', { style: { fontSize: 11, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.04em' }, children: label }),
        jsx('div', { style: { fontSize: 13, fontVariantNumeric: 'tabular-nums', marginTop: 2 }, children: `${fmt(v, 1)}${unit}` })
      ]
    })
  return jsxs('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
    children: [cell('min', stats.min), cell('avg', stats.avg), cell('max', stats.max)]
  })
}

function WeatherToday({ w }) {
  const bits = [w.state, w.humidity != null ? `${fmt(w.humidity)}% humidity` : null].filter(Boolean)
  return jsx(Card, {
    title: 'Weather today',
    aside: 'Outside',
    children: jsxs('div', {
      style: { display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' },
      children: [
        jsx('span', { style: BIG, children: w.temperature != null ? `${fmt(w.temperature, 1)}°` : '–' }),
        jsx('span', { style: { fontSize: 14, color: DIM }, children: bits.join(' · ') })
      ]
    })
  })
}

function LightCard({ ctx, qc, light: l }) {
  const off = l.state === 'off'
  const unreachable = l.state === 'unavailable'
  const status = unreachable ? 'Unreachable' : off ? 'Off' : 'On'
  const detail = unreachable
    ? 'Home Assistant reports the light unavailable'
    : off
      ? 'Light is off'
      : `${l.effect || 'Custom'}${l.brightness != null ? ` · ${Math.round((l.brightness / 255) * 100)}%` : ''}`
  return jsxs(Card, {
    title: l.name,
    aside: status,
    children: [
      jsx('div', { style: { fontSize: 13, color: DIM }, children: detail }),
      jsxs('div', {
        style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 },
        children: [
          jsx(Button, {
            key: 'toggle',
            variant: 'chip',
            size: 'sm',
            disabled: unreachable,
            onClick: () => lightAction(ctx, qc, l.id, 'toggle'),
            children: off ? 'Turn on' : 'Turn off'
          }),
          jsx(Button, {
            key: 'day',
            variant: 'chip',
            size: 'sm',
            disabled: unreachable,
            onClick: () => lightAction(ctx, qc, l.id, 'effect', 'Daylight'),
            children: 'Daylight'
          }),
          jsx(Button, {
            key: 'night',
            variant: 'chip',
            size: 'sm',
            disabled: unreachable,
            onClick: () => lightAction(ctx, qc, l.id, 'effect', 'Night light'),
            children: 'Night light'
          })
        ]
      })
    ]
  })
}

function RoomCard({ c, t }) {
  return jsxs(Card, {
    title: c.name,
    aside: '24 h',
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
        children: [
          jsx('span', { style: BIG, children: c.temp != null ? `${fmt(c.temp, 1)}°` : '–' }),
          c.hum != null ? jsx('span', { style: { fontSize: 13, color: DIM }, children: `${fmt(c.hum)}% humidity` }) : null
        ]
      }),
      jsx(Spark, { points: t.points }),
      jsx(Stats, { stats: t.stats, unit: '°' })
    ]
  })
}

function PlugCard({ plug: p, series: s }) {
  return jsxs(Card, {
    title: p.name,
    aside: p.state === 'on' ? 'On' : p.state === 'off' ? 'Off' : p.state,
    children: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'baseline', gap: 6 },
        children: [
          jsx('span', { style: BIG, children: p.watts != null ? fmt(p.watts) : '–' }),
          jsx('span', { style: { fontSize: 14, color: DIM }, children: 'W' })
        ]
      }),
      jsx('div', {
        style: { fontSize: 13, color: DIM },
        children: `${fmt(p.kwh_today, 2)} kWh today · ${fmt(p.kwh_month, 1)} kWh this month`
      }),
      jsx(Spark, { points: s.points }),
      jsx(Stats, { stats: s.stats, unit: ' W' })
    ]
  })
}

function HomeTab({ ctx }) {
  const qc = useQueryClient()
  const snap = useDash(ctx, '/snapshot', 15000)
  const hist = useDash(ctx, '/history?hours=24', 240000)
  const blocked = gate(snap, 'Home data')
  if (blocked) return blocked

  const lights = snap.data.lights || []
  const climate = snap.data.climate || []
  const series = hist.data?.series || {}

  return jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', gap: 24 },
    children: [
      jsx(Clock, {}),
      jsx(WeatherToday, { w: snap.data.weather }),
      jsx('div', {
        style: GRID,
        children: lights.map(l => jsx(LightCard, { key: l.id, ctx, qc, light: l }))
      }),
      jsx('div', {
        style: GRID,
        children: climate.map(c => jsx(RoomCard, { key: c.name, c, t: series[c.series] || {} }))
      })
    ]
  })
}

function EnergyTab({ ctx }) {
  const [range, setRange] = useState(24)
  const snap = useDash(ctx, '/snapshot', 15000)
  const hist = useDash(ctx, `/history?hours=${range}`, 240000)
  const blocked = gate(snap, 'Energy data')
  if (blocked) return blocked

  const plugs = snap.data.plugs || []
  const series = hist.data?.series || {}
  const total = plugs.reduce((sum, p) => sum + (p.watts || 0), 0)
  const todayKwh = plugs.reduce((sum, p) => sum + (p.kwh_today || 0), 0)

  return jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', gap: 24 },
    children: [
      jsxs('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
        children: [
          jsx('div', { style: { fontSize: 13, color: DIM }, children: `Monitored total ${fmt(total)} W · ${fmt(todayKwh, 2)} kWh today` }),
          jsx(SegmentedControl, { options: RANGES, value: range, onChange: setRange })
        ]
      }),
      jsx('div', {
        style: GRID,
        children: plugs.map(p => jsx(PlugCard, { key: p.id, plug: p, series: series[p.series] || {} }))
      })
    ]
  })
}

function DashboardPage({ ctx }) {
  const [tab, setTab] = useState('home')
  return jsxs('div', {
    style: PAGE,
    children: [
      jsxs('header', {
        style: HEAD,
        children: [
          jsx('div', { style: { fontSize: 20, fontWeight: 600 }, children: 'Dashboard' }),
          jsx(SegmentedControl, { options: TABS, value: tab, onChange: setTab })
        ]
      }),
      tab === 'home' ? jsx(HomeTab, { ctx }) : null,
      tab === 'energy' ? jsx(EnergyTab, { ctx }) : null
    ]
  })
}

export default {
  id: ID,
  name: 'Home Dashboard',
  register(ctx) {
    ctx.register({
      id: 'page',
      area: ROUTES_AREA,
      data: { path: PATH },
      render: () => jsx(DashboardPage, { ctx })
    })
    ctx.register({
      id: 'nav',
      area: SIDEBAR_NAV_AREA,
      data: { path: PATH, label: 'Home', codicon: 'graph' }
    })
    ctx.register({
      id: 'palette',
      area: PALETTE_AREA,
      data: {
        id: `${ID}.open`,
        label: 'Open Home dashboard',
        keywords: ['home', 'dashboard', 'lights', 'energy'],
        run: () => host.navigate(PATH)
      }
    })
  }
}
