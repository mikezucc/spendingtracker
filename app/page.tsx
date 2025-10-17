'use client'

import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { Chart } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
)

interface Transaction {
  date: string // YYYY-MM-DD format
  amount: number // positive for spending, negative for credits
  description: string // merchant/transaction description
  category: string // spend category from CSV
}

type ViewMode = 'cumulative' | 'daily' | 'weekly'

const STORAGE_KEY = 'spending-tracker-data'

// Color scheme for categories - vibrant colors with good contrast
const getCategoryColor = (category: string): string => {
  const colors: Record<string, string> = {
    'Groceries': '#10b981', // Green
    'Gas': '#f59e0b', // Amber
    'Restaurants': '#ef4444', // Red
    'Entertainment': '#8b5cf6', // Purple
    'Shopping': '#ec4899', // Pink
    'Travel': '#3b82f6', // Blue
    'Bills & Utilities': '#14b8a6', // Teal
    'Healthcare': '#06b6d4', // Cyan
    'Personal': '#f97316', // Orange
    'Professional Services': '#6366f1', // Indigo
    'Home': '#84cc16', // Lime
    'Automotive': '#eab308', // Yellow
    'Education': '#0ea5e9', // Sky
    'Gifts & Donations': '#d946ef', // Fuchsia
    'Uncategorized': '#6b7280', // Gray
  }

  // If we have a specific color for this category, use it
  if (colors[category]) {
    return colors[category]
  }

  // Otherwise, generate a color based on the category name
  let hash = 0
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash)
  }

  const hue = hash % 360
  return `hsl(${hue}, 70%, 50%)`
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [enabledViews, setEnabledViews] = useState<Set<ViewMode>>(new Set(['cumulative']))
  const [isDragging, setIsDragging] = useState(false)

  // Load data from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setTransactions(parsed)
      } catch (e) {
        console.error('Failed to parse stored data:', e)
      }
    }
  }, [])

  // Save data to localStorage whenever transactions change
  useEffect(() => {
    if (transactions.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
    }
  }, [transactions])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    files.forEach((file) => {
      if (file.name.endsWith('.csv') || file.name.endsWith('.CSV')) {
        parseCSV(file)
      }
    })
  }

  const parseCSV = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newTransactions: Transaction[] = []

        results.data.forEach((row: any) => {
          // Chase CSV format: "Transaction Date", "Amount", "Description", "Category"
          const dateStr = row['Transaction Date']
          const amountStr = row['Amount']
          const description = row['Description'] || 'Unknown'
          const category = row['Category'] || 'Uncategorized'

          if (dateStr && amountStr) {
            // Parse date (MM/DD/YYYY format from Chase)
            const [month, day, year] = dateStr.split('/')
            const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`

            // Parse amount and invert: CSV has negative for spending, positive for credits
            // We invert so spending shows as positive, credits as negative
            const amount = -parseFloat(amountStr)

            if (!isNaN(amount)) {
              newTransactions.push({ date, amount, description, category })
            }
          }
        })

        // Merge with existing transactions and remove duplicates
        setTransactions((prev) => {
          const combined = [...prev, ...newTransactions]
          // Remove duplicates based on date, amount, description, and category
          const unique = combined.filter(
            (transaction, index, self) =>
              index ===
              self.findIndex(
                (t) => t.date === transaction.date && t.amount === transaction.amount && t.description === transaction.description && t.category === transaction.category
              )
          )
          // Sort by date
          return unique.sort((a, b) => a.date.localeCompare(b.date))
        })
      },
      error: (error) => {
        console.error('Error parsing CSV:', error)
      },
    })
  }

  const clearData = () => {
    setTransactions([])
    localStorage.removeItem(STORAGE_KEY)
  }

  const toggleView = (view: ViewMode) => {
    setEnabledViews((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(view)) {
        newSet.delete(view)
      } else {
        newSet.add(view)
      }
      return newSet
    })
  }

  // Calculate chart data based on enabled views
  const getChartData = () => {
    if (transactions.length === 0 || enabledViews.size === 0) {
      return {
        labels: [],
        datasets: [
          {
            label: 'No data',
            data: [],
            borderColor: '#666',
            backgroundColor: 'rgba(102, 102, 102, 0.1)',
            tension: 0,
          },
        ],
      }
    }

    const datasets: any[] = []

    // Get all unique dates from transactions for consistent x-axis
    const allDates = Array.from(new Set(transactions.map((t) => t.date))).sort()

    // Colors for different datasets (more distinct grayscale)
    const colors = {
      cumulative: { border: '#ffffff', bg: 'rgba(255, 255, 255, 0.1)' },
      daily: { border: '#aaaaaa', bg: 'rgba(170, 170, 170, 0.1)' },
      weekly: { border: '#666666', bg: 'rgba(102, 102, 102, 0.1)' },
    }

    // Prepare daily aggregation map (used by multiple views)
    const dailyMap = new Map<string, number>()
    transactions.forEach((t) => {
      const current = dailyMap.get(t.date) || 0
      dailyMap.set(t.date, current + t.amount)
    })

    if (enabledViews.has('cumulative')) {
      // Calculate cumulative spending per day (not per transaction)
      let cumulative = 0
      const data = allDates.map((date) => {
        const dailyAmount = dailyMap.get(date) || 0
        cumulative += dailyAmount
        return cumulative
      })

      datasets.push({
        label: 'Cumulative',
        data: data,
        borderColor: colors.cumulative.border,
        backgroundColor: colors.cumulative.bg,
        tension: 0,
        fill: false,
        borderWidth: 3,
      })
    }

    if (enabledViews.has('daily')) {
      // Daily spending per day, stacked by category

      // Get all unique categories
      const categories = Array.from(new Set(transactions.map((t) => t.category))).sort()

      // Create a map of date -> category -> amount
      const dailyCategoryMap = new Map<string, Map<string, number>>()
      transactions.forEach((t) => {
        if (!dailyCategoryMap.has(t.date)) {
          dailyCategoryMap.set(t.date, new Map())
        }
        const categoryMap = dailyCategoryMap.get(t.date)!
        const current = categoryMap.get(t.category) || 0
        categoryMap.set(t.category, current + t.amount)
      })

      // Create a dataset for each category
      categories.forEach((category) => {
        const data = allDates.map((date) => {
          const categoryMap = dailyCategoryMap.get(date)
          return categoryMap ? (categoryMap.get(category) || 0) : 0
        })

        const color = getCategoryColor(category)

        datasets.push({
          type: 'bar' as const,
          label: category,
          data: data,
          backgroundColor: color,
          borderColor: color,
          borderWidth: 1,
          stack: 'stack1',
          barThickness: 'flex' as const,
          maxBarThickness: 30,
          datalabels: {
            display: false, // Hide individual category labels, show total on top
          },
        })
      })

      // Add a total label dataset (invisible bars, just for showing the total)
      const totalData = allDates.map((date) => dailyMap.get(date) || 0)
      datasets.push({
        type: 'bar' as const,
        label: 'Total (Daily)',
        data: totalData,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        stack: 'total-label',
        barThickness: 'flex' as const,
        maxBarThickness: 30,
        datalabels: {
          display: true,
          color: '#e5e5e5',
          anchor: 'end' as const,
          align: 'top' as const,
          formatter: (value: number, context: any) => {
            // Calculate the total for this date from the stacked bars
            const dateIndex = context.dataIndex
            const date = allDates[dateIndex]
            const total = dailyMap.get(date) || 0
            return total !== 0 ? `$${Math.abs(total).toFixed(0)}` : ''
          },
        },
      })
    }

    if (enabledViews.has('weekly')) {
      // Weekly spending (calendar weeks starting Monday)
      const weeklyMap = new Map<string, number>()

      transactions.forEach((t) => {
        const date = new Date(t.date)
        // Get Monday of the week
        const day = date.getDay()
        const diff = date.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
        const monday = new Date(date.setDate(diff))
        const weekKey = monday.toISOString().split('T')[0]

        const current = weeklyMap.get(weekKey) || 0
        weeklyMap.set(weekKey, current + t.amount)
      })

      // Map weekly totals to daily dates
      const data = allDates.map((date) => {
        const d = new Date(date)
        const day = d.getDay()
        const diff = d.getDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(d.setDate(diff))
        const weekKey = monday.toISOString().split('T')[0]
        return weeklyMap.get(weekKey) || 0
      })

      datasets.push({
        label: 'Weekly',
        data: data,
        borderColor: colors.weekly.border,
        backgroundColor: colors.weekly.bg,
        tension: 0,
        fill: false,
        borderWidth: 3,
      })
    }

    return {
      labels: allDates,
      datasets,
    }
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      datalabels: {
        display: false, // Disable by default, enable per dataset
      },
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#e5e5e5',
          font: {
            size: 14,
          },
        },
      },
      tooltip: {
        backgroundColor: '#1a1a1a',
        titleColor: '#e5e5e5',
        bodyColor: '#e5e5e5',
        borderColor: '#333',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        bodyFont: {
          family: 'monospace',
          size: 12,
        },
        titleFont: {
          family: 'monospace',
          size: 13,
        },
        callbacks: {
          title: function (context: any) {
            // Show the date in a readable format
            const date = context[0].label
            return `Transactions on ${date}`
          },
          beforeBody: function (context: any) {
            const date = context[0].label
            // Get all transactions for this date
            const dayTransactions = transactions.filter((t) => t.date === date)

            if (dayTransactions.length === 0) {
              return ['No transactions']
            }

            return []
          },
          label: function (context: any) {
            const date = context.label
            const value = context.parsed.y
            const datasetLabel = context.dataset.label

            // Get all transactions for this date
            const dayTransactions = transactions.filter((t) => t.date === date)

            const lines: string[] = []

            // Skip the "Total (Daily)" label dataset in the main tooltip
            if (datasetLabel === 'Total (Daily)') {
              return []
            }

            // Add dataset info first (category or view type)
            lines.push(`${datasetLabel}: $${Math.abs(value).toFixed(2)}`)
            lines.push('') // Empty line for spacing

            // Group transactions by category
            const categoryMap = new Map<string, Transaction[]>()
            dayTransactions.forEach((t) => {
              if (!categoryMap.has(t.category)) {
                categoryMap.set(t.category, [])
              }
              categoryMap.get(t.category)!.push(t)
            })

            // Helper function to pad text for alignment
            const padRight = (text: string, length: number) => {
              return text + ' '.repeat(Math.max(0, length - text.length))
            }

            // Add category breakdowns
            if (categoryMap.size > 0) {
              lines.push('Category Breakdown:')
              Array.from(categoryMap.entries())
                .sort(([catA], [catB]) => catA.localeCompare(catB))
                .forEach(([category, txns]) => {
                  const categoryTotal = txns.reduce((sum, t) => sum + t.amount, 0)
                  const categoryLine = padRight(`  ${category}:`, 30)
                  lines.push(`${categoryLine}$${Math.abs(categoryTotal).toFixed(2)}`)

                  // Show individual transactions in this category
                  txns.forEach((t) => {
                    const sign = t.amount > 0 ? '+' : ''
                    const description = t.description.length > 35
                      ? t.description.substring(0, 32) + '...'
                      : t.description
                    const descLine = padRight(`    ${description}`, 40)
                    lines.push(`${descLine}${sign}$${Math.abs(t.amount).toFixed(2)}`)
                  })
                })
            }

            return lines
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: {
          color: '#1a1a1a',
        },
        ticks: {
          color: '#999',
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        stacked: true,
        grid: {
          color: '#1a1a1a',
        },
        ticks: {
          color: '#999',
          callback: function (value: any) {
            return '$' + Math.abs(value).toFixed(0)
          },
        },
      },
    },
  }

  return (
    <main className="h-screen p-8 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-4xl font-bold text-white mb-2">Spending Tracker</h1>
        <p className="text-gray-400">
          Drop Chase CSV files to track your spending
        </p>
      </div>

      {/* Controls */}
      <div className="mb-6 flex items-center justify-between flex-shrink-0">
        <div className="flex gap-2">
          <button
            onClick={() => toggleView('cumulative')}
            className={`px-6 py-2 rounded transition-colors ${
              enabledViews.has('cumulative')
                ? 'bg-white text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Cumulative
          </button>
          <button
            onClick={() => toggleView('daily')}
            className={`px-6 py-2 rounded transition-colors ${
              enabledViews.has('daily')
                ? 'bg-white text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => toggleView('weekly')}
            className={`px-6 py-2 rounded transition-colors ${
              enabledViews.has('weekly')
                ? 'bg-white text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Weekly
          </button>
        </div>

        {transactions.length > 0 && (
          <div className="flex items-center gap-4">
            <span className="text-gray-400">
              {transactions.length} transactions loaded
            </span>
            <button
              onClick={clearData}
              className="px-4 py-2 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Clear Data
            </button>
          </div>
        )}
      </div>

      {/* Chart Area */}
      <div
        className={`flex-1 rounded-lg border-2 border-dashed transition-colors overflow-hidden ${
          isDragging
            ? 'border-white bg-gray-900'
            : 'border-gray-700 bg-gray-950'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {transactions.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center">
            <div className="text-center">
              <svg
                className="mx-auto h-24 w-24 text-gray-600 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-xl text-gray-400 mb-2">
                Drop CSV files here to get started
              </p>
              <p className="text-sm text-gray-600">
                Supports Chase credit card CSV exports
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full w-full p-6">
            <div className="h-full w-full">
              <Chart type="line" data={getChartData()} options={chartOptions} />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
