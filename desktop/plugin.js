/**
 * Home dashboard page for the Hermes desktop app.
 * Data comes from the plugin backend (plugin_api.py) via ctx.rest. The HA token never reaches this file.
 * Three tabs: Today (clock, weather), Home (lights, climate), Energy (plugs).
 * Colours come from app theme variables only. Plain ESM, no JSX.
 */

import { PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, useQuery, useQueryClient, host } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useState } from 'react'

const ID = 'hermes-dashboard'
const PATH = '/home-dashboard'
const TABS = ['Today', 'Home', 'Energy']

const SURFACE = 'var(--ui-stroke-secondary)'
const DIM = 'var(--ui-text-secondary)'
const FAINT = 'var(--ui-text-quaternary)'
const ACCENT = 'var(--ui-accent)'

// ── data ───────────────────────────────────────────────────────────────────
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

// ── small pieces ───────────────────────────────────────────────────────────
function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
  return jsxs('div', {
    style: { textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
    children: [
      jsx('div', { style: { fontSize: '96px', fontWeight: 600, lineHeight: 1 }, children: time }),
      jsx('div', { style: { fontSize: '20px', color: DIM, marginTop: 12 }, children: date })
    ]
  })
}

function Card({ title, children, style }) {
  return jsxs('div', {
    style: { border: `1px solid ${SURFACE}`, borderRadius: 12, padding: 16, ...style },
    children: [
      title ? jsx('div', { style: { fontSize: 13, color: DIM, marginBottom: 10 }, children: title }) : null,
      children
    ]
  })
}

function Spark({ points, height = 56 }) {
  if (!points || points.length < 2) {
    return jsx('div', { style: { height, color: FAINT, fontSize: 12 }, children: 'no data' })
  }
  const vals = points.map(p => p[1])
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const W = 300
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W
    const y = height - ((p[1] - min) / span) * (height - 4) - 2
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return jsx('svg', {
    viewBox: `0 0 ${W} ${height}`, preserveAspectRatio: 'none',
    style: { width: '100%', height },
    children: jsx('path', { d, fill: 'none', stroke: ACCENT, strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke' })
  })
}

function Stats({ stats, unit }) {
  if (!stats) return null
  const f = v => (v == null ? '–' : `${v}${unit}`)
  return jsx('div', {
    style: { display: 'flex', gap: 16, fontSize: 12, color: FAINT, marginTop: 6 },
    children: [
      jsx('span', { key: 'min', children: `min ${f(stats.min)}` }),
      jsx('span', { key: 'avg', children: `avg ${f(stats.avg)}` }),
      jsx('span', { key: 'max', children: `max ${f(stats.max)}` })
    ]
  })
}

function Seg({ value, onChange }) {
  return jsx('div', {
    style: { display: 'inline-flex', border: `1px solid ${SURFACE}`, borderRadius: 8, overflow: 'hidden' },
    children: [24, 168].map(h => jsx('button', {
      key: h, type: 'button', onClick: () => onChange(h),
      style: {
        padding: '4px 12px', fontSize: 12, border: 0, cursor: 'pointer', background: 'transparent',
        color: value === h ? ACCENT : DIM
      },
      children: h === 24 ? '24 h' : '7 days'
    }))
  })
}

// ── tabs ───────────────────────────────────────────────────────────────────
function TodayTab({ ctx }) {
  const snap = useDash(ctx, '/snapshot', 15000)
  const w = snap.data?.weather
  const days = (w?.forecast || []).slice(0, 6)
  return jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', gap: 24, height: '100%' },
    children: [
      jsx('div', { style: { paddingTop: 16 }, children: jsx(Clock, {}) }),
      jsxs(Card, {
        title: 'Weather · Home',
        children: [
          w ? jsxs('div', {
            style: { display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 12 },
            children: [
              jsx('div', { style: { fontSize: 40, fontWeight: 600 }, children: w.temperature != null ? `${w.temperature}°` : '–' }),
              jsx('div', { style: { color: DIM }, children: `${w.state || ''} · ${w.humidity ?? '–'}% humidity · wind ${w.wind_speed ?? '–'}` })
            ]
          }) : jsx('div', { style: { color: FAINT }, children: snap.isError ? 'Weather unavailable' : 'Loading…' }),
          jsx('div', {
            style: { display: 'grid', gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0,1fr))`, gap: 8 },
            children: days.map((d, i) => jsxs('div', {
              key: i, style: { textAlign: 'center', fontSize: 13 },
              children: [
                jsx('div', { style: { color: DIM }, children: new Date(d.datetime).toLocaleDateString([], { weekday: 'short' }) }),
                jsx('div', { style: { fontWeight: 600, marginTop: 4 }, children: `${Math.round(d.temperature)}°` }),
                jsx('div', { style: { color: FAINT }, children: d.templow != null ? `${Math.round(d.templow)}°` : '' })
              ]
            }))
          })
        ]
      })
    ]
  })
}

function HomeTab({ ctx }) {
  const qc = useQueryClient()
  const snap = useDash(ctx, '/snapshot', 15000)
  const hist = useDash(ctx, '/history?hours=24', 240000)
  const lights = snap.data?.lights || []
  const climate = snap.data?.climate || []
  const series = hist.data?.series || {}
  return jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', gap: 16 },
    children: [
      jsx('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 },
        children: lights.map(l => jsxs(Card, {
          key: l.id, title: l.name,
          children: [
            jsx('div', { style: { fontSize: 22, fontWeight: 600 }, children: l.state === 'on' ? 'On' : l.state === 'off' ? 'Off' : 'Unreachable' }),
            l.effect ? jsx('div', { style: { color: DIM, fontSize: 13, marginTop: 4 }, children: l.state === 'on' && l.brightness != null ? `${l.effect} · ${Math.round((l.brightness / 255) * 100)}%` : l.effect }) : null,
            jsxs('div', {
              style: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
              children: [
                jsx('button', { type: 'button', onClick: () => lightAction(ctx, qc, l.id, 'toggle'), style: btn(), children: l.state === 'on' ? 'Turn off' : 'Turn on' }),
                jsx('button', { type: 'button', onClick: () => lightAction(ctx, qc, l.id, 'effect', 'Daylight'), style: btn(), children: 'Daylight' }),
                jsx('button', { type: 'button', onClick: () => lightAction(ctx, qc, l.id, 'effect', 'Night light'), style: btn(), children: 'Night light' })
              ]
            })
          ]
        }))
      }),
      jsx('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 },
        children: climate.map(c => {
          const t = series[c.series] || {}
          return jsxs(Card, {
            key: c.name, title: `${c.name} · temperature`,
            children: [
              jsx('div', { style: { fontSize: 28, fontWeight: 600 }, children: c.temp != null ? `${c.temp}°` : '–' }),
              c.hum != null ? jsx('div', { style: { color: DIM, fontSize: 13 }, children: `${c.hum}% humidity` }) : null,
              jsx(Spark, { points: t.points }),
              jsx(Stats, { stats: t.stats, unit: '°' })
            ]
          })
        })
      })
    ]
  })
}

function EnergyTab({ ctx }) {
  const [hours, setHours] = useState(24)
  const snap = useDash(ctx, '/snapshot', 15000)
  const hist = useDash(ctx, `/history?hours=${hours}`, 240000)
  const plugs = snap.data?.plugs || []
  const series = hist.data?.series || {}
  return jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', gap: 16 },
    children: [
      jsx('div', { style: { display: 'flex', justifyContent: 'flex-end' }, children: jsx(Seg, { value: hours, onChange: setHours }) }),
      jsx('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 },
        children: plugs.map(p => {
          const s = series[p.series] || {}
          return jsxs(Card, {
            key: p.id, title: p.name,
            children: [
              jsx('div', { style: { fontSize: 28, fontWeight: 600 }, children: p.watts != null ? `${Math.round(p.watts)} W` : '–' }),
              jsx('div', { style: { color: DIM, fontSize: 13 }, children: `${p.kwh_today != null ? p.kwh_today.toFixed(2) : '–'} kWh today · ${p.kwh_month != null ? p.kwh_month.toFixed(1) : '–'} kWh this month` }),
              jsx(Spark, { points: s.points }),
              jsx(Stats, { stats: s.stats, unit: ' W' })
            ]
          })
        })
      })
    ]
  })
}

function btn() {
  return {
    padding: '6px 12px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${SURFACE}`, background: 'transparent', color: 'inherit'
  }
}

// ── page ───────────────────────────────────────────────────────────────────
function DashboardPage({ ctx }) {
  const [tab, setTab] = useState('Today')
  return jsxs('div', {
    style: { height: '100%', overflow: 'auto', padding: 24, boxSizing: 'border-box' },
    children: [
      jsx('div', {
        style: { display: 'flex', gap: 8, marginBottom: 20 },
        children: TABS.map(t => jsx('button', {
          key: t, type: 'button', onClick: () => setTab(t),
          style: {
            padding: '6px 14px', fontSize: 14, borderRadius: 8, cursor: 'pointer', border: 0,
            background: 'transparent', color: tab === t ? ACCENT : DIM
          },
          children: t
        }))
      }),
      tab === 'Today' ? jsx(TodayTab, { ctx }) : null,
      tab === 'Home' ? jsx(HomeTab, { ctx }) : null,
      tab === 'Energy' ? jsx(EnergyTab, { ctx }) : null
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
