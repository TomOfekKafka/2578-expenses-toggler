import { useState, useMemo, useEffect, useRef } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { callMcpTool, credentialsReady } from './api'

type Period = 'month' | 'quarter' | 'year'

interface CategoryData {
  category: string
  original: number
  adjusted: number
}

const COLORS = [
  '#4F81BD',
  '#C0504D',
  '#9BBB59',
  '#8064A2',
  '#4BACC6',
  '#F79646',
  '#2C4770',
]

const MOCK_DATA: Record<Period, CategoryData[]> = {
  month: [
    { category: 'Salaries', original: 42000, adjusted: 42000 },
    { category: 'Marketing', original: 8500, adjusted: 8500 },
    { category: 'Software', original: 3200, adjusted: 3200 },
    { category: 'Travel', original: 2100, adjusted: 2100 },
    { category: 'Office', original: 1400, adjusted: 1400 },
    { category: 'Utilities', original: 900, adjusted: 900 },
    { category: 'Misc', original: 600, adjusted: 600 },
  ],
  quarter: [
    { category: 'Salaries', original: 126000, adjusted: 126000 },
    { category: 'Marketing', original: 25500, adjusted: 25500 },
    { category: 'Software', original: 9600, adjusted: 9600 },
    { category: 'Travel', original: 6300, adjusted: 6300 },
    { category: 'Office', original: 4200, adjusted: 4200 },
    { category: 'Utilities', original: 2700, adjusted: 2700 },
    { category: 'Misc', original: 1800, adjusted: 1800 },
  ],
  year: [
    { category: 'Salaries', original: 504000, adjusted: 504000 },
    { category: 'Marketing', original: 102000, adjusted: 102000 },
    { category: 'Software', original: 38400, adjusted: 38400 },
    { category: 'Travel', original: 25200, adjusted: 25200 },
    { category: 'Office', original: 16800, adjusted: 16800 },
    { category: 'Utilities', original: 10800, adjusted: 10800 },
    { category: 'Misc', original: 7200, adjusted: 7200 },
  ],
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const pct = (adjusted: number, original: number) => {
  if (original === 0) return 0
  return Math.round(((adjusted - original) / original) * 100)
}

interface AggregateRow {
  "DR_ACC_L1.5"?: string
  DR_ACC_L2?: string
  Amount?: number
  [key: string]: unknown
}

function parseApiData(rows: AggregateRow[]): CategoryData[] {
  return rows
    .map((row) => {
      const category = String(row["DR_ACC_L1.5"] ?? row.DR_ACC_L2 ?? 'Unknown')
      const amount = Number(row.Amount ?? 0)
      return { category, original: Math.abs(amount), adjusted: Math.abs(amount) }
    })
    .filter((d) => d.original > 0)
    .sort((a, b) => b.original - a.original)
}

export default function App() {
  const [period, setPeriod] = useState<Period>('month')
  const [adjustments, setAdjustments] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiData, setApiData] = useState<Record<Period, CategoryData[] | null>>({
    month: null,
    quarter: null,
    year: null,
  })
  const tableIdRef = useRef<string | null>(null)

  const fetchData = async (p: Period) => {
    setLoading(true)
    setError(null)
    try {
      await credentialsReady
      // Discover table ID if we haven't yet
      if (!tableIdRef.current) {
        const tables = await callMcpTool('list_finance_tables', {}) as { tables?: Array<{ id: string; name: string }> }
        const tableList = tables?.tables ?? (Array.isArray(tables) ? tables as Array<{ id: string; name: string }> : [])
        if (tableList.length === 0) throw new Error('No tables found')
        // Pick first table or one that looks like expenses
        const expenseTable = tableList.find(
          (t) => /^financials$/i.test(t.name)
        ) ?? tableList.find(
          (t) => /expense|p&l|pl|budget/i.test(t.name)
        ) ?? tableList[0]
        tableIdRef.current = String(expenseTable.id)
      }

      const result = await callMcpTool('aggregate_table_data', {
        table_id: tableIdRef.current,
        dimensions: ['DR_ACC_L1.5'],
        metrics: [{ field: 'Amount', agg: 'SUM' }],
        filters: [
          { name: 'Scenario', values: ['Actuals'], is_excluded: false },
          { name: 'DR_ACC_L0', values: ['P&L'], is_excluded: false },
        ],
      }) as { rows?: AggregateRow[] } | AggregateRow[]

      const rows: AggregateRow[] = Array.isArray(result)
        ? (result as AggregateRow[])
        : ((result as { rows?: AggregateRow[] })?.rows ?? [])

      const parsed = parseApiData(rows)
      if (parsed.length === 0) throw new Error('No data returned from API')

      setApiData((prev) => ({ ...prev, [p]: parsed }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`API error: ${msg}. Showing mock data.`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(period)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  const baseData: CategoryData[] = apiData[period] ?? MOCK_DATA[period]

  const data: CategoryData[] = useMemo(
    () =>
      baseData.map((item) => ({
        ...item,
        adjusted:
          adjustments[`${period}:${item.category}`] !== undefined
            ? adjustments[`${period}:${item.category}`]
            : item.original,
      })),
    [baseData, adjustments, period]
  )

  const totalOriginal = data.reduce((s, d) => s + d.original, 0)
  const totalAdjusted = data.reduce((s, d) => s + d.adjusted, 0)

  const handleSlider = (category: string, value: number) => {
    setAdjustments((prev) => ({
      ...prev,
      [`${period}:${category}`]: value,
    }))
  }

  const handlePeriodChange = (p: Period) => {
    setPeriod(p)
  }

  const pieData = data.map((d) => ({ name: d.category, value: d.adjusted }))

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) => {
    if (active && payload && payload.length) {
      const item = payload[0]
      return (
        <div className="pie-tooltip">
          <p className="pie-tooltip-label">{item.name}</p>
          <p className="pie-tooltip-value">{fmt(item.value)}</p>
          <p className="pie-tooltip-pct">
            {((item.value / totalAdjusted) * 100).toFixed(1)}% of total
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Expenses Toggler</h1>
          <p className="subtitle">Adjust and visualize expense allocations</p>
        </div>
      </header>

      <main className="app-main">
        {/* Period Picker */}
        <div className="period-section">
          <div className="period-toggle">
            {(['month', 'quarter', 'year'] as Period[]).map((p) => (
              <button
                key={p}
                className={`period-btn${period === p ? ' active' : ''}`}
                onClick={() => handlePeriodChange(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="error-banner" role="alert">
            <span className="error-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <span>Loading data…</span>
          </div>
        )}

        {!loading && (
          <>
            {/* Summary Cards */}
            <div className="summary-cards">
              <div className="card">
                <span className="card-label">Original Total</span>
                <span className="card-value">{fmt(totalOriginal)}</span>
              </div>
              <div className={`card${totalAdjusted !== totalOriginal ? (totalAdjusted > totalOriginal ? ' card-up' : ' card-down') : ''}`}>
                <span className="card-label">Adjusted Total</span>
                <span className="card-value">{fmt(totalAdjusted)}</span>
                {totalAdjusted !== totalOriginal && (
                  <span className="card-delta">
                    {totalAdjusted > totalOriginal ? '+' : ''}{pct(totalAdjusted, totalOriginal)}%
                  </span>
                )}
              </div>
            </div>

            {/* Pie Chart */}
            <div className="chart-section">
              <h2>Expense Breakdown</h2>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={360}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={140}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={10}
                      formatter={(value) => <span className="legend-label">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Sliders */}
            <div className="sliders-section">
              <h2>Adjust by Category</h2>
              <div className="sliders-grid">
                {data.map((item, index) => {
                  const sliderMax = Math.round(item.original * 2)
                  const sliderVal = item.adjusted
                  const diff = pct(item.adjusted, item.original)
                  const hasChange = item.adjusted !== item.original

                  return (
                    <div className="slider-card" key={item.category}>
                      <div className="slider-header">
                        <div className="slider-category">
                          <span
                            className="category-dot"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="category-name">{item.category}</span>
                        </div>
                        {hasChange && (
                          <span className={`delta-badge${diff > 0 ? ' up' : ' down'}`}>
                            {diff > 0 ? '+' : ''}{diff}%
                          </span>
                        )}
                      </div>

                      <div className="slider-values">
                        <div className="value-row">
                          <span className="value-label">Original</span>
                          <span className="value-amount original">{fmt(item.original)}</span>
                        </div>
                        <div className="value-row">
                          <span className="value-label">Adjusted</span>
                          <span className={`value-amount adjusted${hasChange ? (diff > 0 ? ' up' : ' down') : ''}`}>
                            {fmt(item.adjusted)}
                          </span>
                        </div>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={sliderMax}
                        step={Math.max(100, Math.round(item.original / 100))}
                        value={sliderVal}
                        onChange={(e) => handleSlider(item.category, Number(e.target.value))}
                        className="slider"
                        style={{ '--thumb-color': COLORS[index % COLORS.length] } as React.CSSProperties}
                      />

                      <div className="slider-range-labels">
                        <span>$0</span>
                        <span>{fmt(sliderMax)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
