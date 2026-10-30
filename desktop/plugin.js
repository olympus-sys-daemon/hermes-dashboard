/**
 * Home dashboard page for the Hermes desktop app.
 * Data comes from the plugin backend (plugin_api.py) via ctx.rest. The HA token never reaches this file.
 * Two tabs: Home (clock, date, weather line, four small boxes) and Energy (plugs). Nothing scrolls.
 * Sizes are shares of the page box (container units), so the layout fits whatever size the pane has.
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
const SURFACE = 'var(--ui-bg-elevated)'
const ACCENT = 'var(--ui-accent)'
const GLOW = `color-mix(in srgb, ${ACCENT} 22%, transparent)`

// The page is a size container. Everything inside sizes itself in cqw/cqh, measured against this box.
const PAGE = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  boxSizing: 'border-box',
  padding: '12px 20px 16px',
  color: TEXT,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  overflow: 'hidden',
  containerType: 'size'
}
const BODY = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }
const HOME = { flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }
const TOP = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1.5cqh',
  paddingBottom: '4cqh'
}
const BOXROW = {
  flex: 'none',
  height: '24cqh',
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gridTemplateRows: 'minmax(0, 1fr)',
  gap: 14
}
const CARD = {
  minHeight: 0,
  minWidth: 0,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '14px 16px',
  borderRadius: 16,
  border: `1px solid ${LINE}`,
  background: SURFACE,
  overflow: 'hidden'
}
const TITLE = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }
const NUM = {
  fontSize: 'min(7cqh, 4.5cqw)',
  fontWeight: 300,
  lineHeight: 1,
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums'
}
const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }

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
      style: { ...CARD, flex: 1, justifyContent: 'center' },
      children: jsx(ErrorState, {
        title: `${what} unavailable`,
        description: String(query.error?.message || 'The dashboard backend did not answer.')
      })
    })
  }
  return jsx(Skeleton, { style: { flex: 1, borderRadius: 16 } })
}

function Card({ title, aside, body, style }) {
  return jsxs('section', {
    style: { ...CARD, ...style },
    children: [
      jsxs('div', {
        style: TITLE,
        children: [
          jsx('h3', { style: { margin: 0, fontSize: 13, fontWeight: 600, color: TEXT }, children: title }),
          aside ? jsx('span', { style: { fontSize: 12, color: DIM }, children: aside }) : null
        ]
      }),
      ...(body || [])
    ]
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
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      fontVariantNumeric: 'tabular-nums'
    },
    children: [
      jsx('div', {
        style: {
          fontSize: 'min(30cqh, 17cqw)',
          fontWeight: 200,
          lineHeight: 0.95,
          letterSpacing: '-0.05em',
          color: TEXT,
          whiteSpace: 'nowrap',
          textShadow: `0 0 90px ${GLOW}`
        },
        children: time
      }),
      jsx('div', {
        style: { fontSize: 'min(3.6cqh, 2cqw)', color: DIM, marginTop: '1cqh', whiteSpace: 'nowrap' },
        children: date
      })
    ]
  })
}

function WeatherLine({ w }) {
  const temp = w.temperature != null ? `${fmt(w.temperature, 1)}°` : '–'
  const parts = [w.state, w.humidity != null ? `${fmt(w.humidity)}% humidity` : null].filter(Boolean)
  return jsx('div', {
    style: { fontSize: 'min(3.2cqh, 1.8cqw)', color: DIM, textAlign: 'center', whiteSpace: 'nowrap' },
    children: [temp, ...parts].join(' · ')
  })
}

function LightTile({ ctx, qc, light: l }) {
  const off = l.state === 'off'
  const unreachable = l.state === 'unavailable'
  const status = unreachable ? 'Unreachable' : off ? 'Off' : 'On'
  const detail = unreachable ? 'No reply' : off ? 'Light is off' : l.effect || 'On'
  return jsx(Card, {
    title: l.name,
    aside: status,
    body: [
      jsx('div', { style: { fontSize: 13, color: DIM }, children: detail }),
      jsx('div', {
        style: { marginTop: 'auto' },
        children: jsx(Button, {
          variant: 'chip',
          size: 'sm',
          disabled: unreachable,
          onClick: () => lightAction(ctx, qc, l.id, 'toggle'),
          children: off ? 'Turn on' : 'Turn off'
        })
      })
    ]
  })
}

function RoomTile({ c }) {
  return jsx(Card, {
    title: c.name,
    body: [
      jsx('div', { style: { ...NUM, marginTop: 'auto' }, children: c.temp != null ? `${fmt(c.temp, 1)}°` : '–' }),
      c.hum != null ? jsx('div', { style: { fontSize: 13, color: DIM }, children: `${fmt(c.hum)}% humidity` }) : null
    ]
  })
}

function BoxRow({ ctx, qc, lights, climate }) {
  return jsxs('div', {
    style: BOXROW,
    children: [
      ...lights.map(l => jsx(LightTile, { key: l.id, ctx, qc, light: l })),
      ...climate.map(c => jsx(RoomTile, { key: c.name, c }))
    ]
  })
}

function HomeTab({ ctx }) {
  const qc = useQueryClient()
  const snap = useDash(ctx, '/snapshot', 15000)
  const blocked = gate(snap, 'Home data')
  if (blocked) return blocked

  return jsxs('div', {
    style: HOME,
    children: [
      jsxs('div', {
        style: TOP,
        children: [
          jsx(Clock, {}),
          jsx(WeatherLine, { w: snap.data.weather })
        ]
      }),
      jsx(BoxRow, { ctx, qc, lights: snap.data.lights || [], climate: snap.data.climate || [] })
    ]
  })
}

function Spark({ points }) {
  const box = { flex: 1, minHeight: 0, position: 'relative' }
  if (!points || points.length < 2) {
    return jsx('div', {
      style: { ...box, display: 'grid', placeItems: 'center', color: FAINT, fontSize: 12 },
      children: 'No history yet'
    })
  }
  const vals = points.map(p => p[1])
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const W = 300
  const H = 100
  const line = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * W
      const y = H - ((p[1] - min) / span) * (H - 8) - 4
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return jsx('div', {
    style: box,
    children: jsxs('svg', {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: 'none',
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
      children: [
        jsx('path', { d: `${line} L${W},${H} L0,${H} Z`, style: { fill: ACCENT, opacity: 0.14 } }),
        jsx('path', {
          d: line,
          fill: 'none',
          style: { stroke: ACCENT },
          strokeWidth: 1.5,
          strokeLinejoin: 'round',
          vectorEffect: 'non-scaling-stroke'
        })
      ]
    })
  })
}

function Stats({ stats, unit = '' }) {
  if (!stats) return null
  const cell = (label, v) =>
    jsxs('div', {
      children: [
        jsx('div', {
          style: { fontSize: 10, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em' },
          children: label
        }),
        jsx('div', {
          style: { fontSize: 12, fontVariantNumeric: 'tabular-nums', marginTop: 1 },
          children: `${fmt(v, 1)}${unit}`
        })
      ]
    })
  return jsxs('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 },
    children: [cell('min', stats.min), cell('avg', stats.avg), cell('max', stats.max)]
  })
}

function PlugCard({ plug: p, series: s }) {
  return jsx(Card, {
    title: p.name,
    aside: p.state === 'on' ? 'On' : p.state === 'off' ? 'Off' : p.state,
    body: [
      jsxs('div', {
        style: { display: 'flex', alignItems: 'baseline', gap: 8 },
        children: [
          jsx('div', { style: NUM, children: p.watts != null ? fmt(p.watts) : '–' }),
          jsx('div', { style: { fontSize: 14, color: DIM }, children: 'W' })
        ]
      }),
      jsx('div', {
        style: { fontSize: 12, color: DIM },
        children: `${fmt(p.kwh_today, 2)} kWh today · ${fmt(p.kwh_month, 1)} kWh this month`
      }),
      jsx(Spark, { points: s.points }),
      jsx(Stats, { stats: s.stats, unit: ' W' })
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
    style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 },
    children: [
      jsxs('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
        children: [
          jsx('div', {
            style: { fontSize: 13, color: DIM },
            children: `Monitored total ${fmt(total)} W · ${fmt(todayKwh, 2)} kWh today`
          }),
          jsx(SegmentedControl, { options: RANGES, value: range, onChange: setRange })
        ]
      }),
      jsx('div', {
        style: {
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          gap: 16
        },
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
      jsx('div', {
        style: { display: 'flex', justifyContent: 'flex-end', flex: 'none' },
        children: jsx(SegmentedControl, { options: TABS, value: tab, onChange: setTab })
      }),
      jsx('div', {
        style: BODY,
        children: tab === 'home' ? jsx(HomeTab, { ctx }) : jsx(EnergyTab, { ctx })
      })
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
