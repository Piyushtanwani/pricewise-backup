import { useState, useEffect, useCallback } from "react"
import { ListChecks, TrendingDown, Bell, X, Loader2, LogIn } from "lucide-react"
import { Link, useNavigate } from "react-router"
import Badge from "../components/ui/Badge"
import { api } from "../services/api"
import { useAuth } from "../context/AuthContext"

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")
const tabs = ["All", "Near Target", "Price Dropped"]

export default function Watchlist() {
  const [activeTab, setActiveTab] = useState("All")
  const [items, setItems] = useState<any[]>([])
  const [summary, setSummary] = useState<{
    count: number
    nearTarget: number
    priceDropped: number
    targetReached: number
  }>({
    count: 0,
    nearTarget: 0,
    priceDropped: 0,
    targetReached: 0,
  })
  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const { isAuthenticated, loading: authLoading, toggleWatchlist } = useAuth()
  const navigate = useNavigate()

  const loadWatchlist = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const res = await api.getWatchlist()
      const watchItems = res?.items || []
      setItems(watchItems)
      if (res?.summary) {
        setSummary(res.summary)
      } else {
        setSummary({
          count: watchItems.length,
          nearTarget: watchItems.filter((i: any) => i.nearTarget).length,
          priceDropped: watchItems.filter((i: any) => i.priceDropped).length,
          targetReached: watchItems.filter((i: any) => i.targetReached).length,
        })
      }
    } catch (err) {
      console.error("Failed to load watchlist:", err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!authLoading) {
      loadWatchlist()
    }
  }, [authLoading, loadWatchlist])

  const handleUntrack = async (productId: string) => {
    try {
      setActionLoadingId(productId)
      await toggleWatchlist(productId)
      setItems((prev) => prev.filter((item) => item.id !== productId && item.productId !== productId))
      setSummary((prev) => ({
        ...prev,
        count: Math.max(0, prev.count - 1),
      }))
    } catch (err: any) {
      console.error("Failed to untrack product:", err)
      alert("Failed to untrack product: " + (err.response?.data?.message || err.message))
    } finally {
      setActionLoadingId(null)
    }
  }

  const filtered = items.filter((item) => {
    if (activeTab === "All") return true
    if (activeTab === "Near Target") return Boolean(item.nearTarget)
    if (activeTab === "Price Dropped") return Boolean(item.priceDropped || (item.trend === "down"))
    return true
  })

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 text-center">
        <Loader2 size={36} className="animate-spin text-indigo-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading your tracked smartphones...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-20">
        <div className="max-w-[480px] mx-auto px-6 py-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm mt-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <ListChecks size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Sign in to View Tracked Phones</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Monitor price drops across major retailers, set target alerts, and receive instant notifications.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              to="/login"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2"
            >
              <LogIn size={16} />
              Sign In
            </Link>
            <Link
              to="/signup"
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[900px] mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <ListChecks size={22} className="text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tracked Smartphones</h1>
            <p className="text-sm text-slate-500">{items.length} products monitored for price drops</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            {
              label: "Tracked Products",
              value: summary.count || items.length,
              icon: ListChecks,
              color: "text-indigo-600",
              bg: "bg-indigo-50",
            },
            {
              label: "Price Drops Recorded",
              value: summary.priceDropped,
              icon: TrendingDown,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
            },
            {
              label: "Target Reached",
              value: summary.targetReached,
              icon: Bell,
              color: "text-indigo-600",
              bg: "bg-indigo-50",
            },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-2xs">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        {items.length > 0 && (
          <div className="flex gap-1 mb-5 bg-white rounded-xl border border-slate-200 p-1 w-fit overflow-x-auto shadow-2xs">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
            <p className="text-sm text-slate-500">Loading tracked products from database...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto">
            <ListChecks size={40} className="text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              {items.length === 0 ? "No tracked smartphones yet" : "No items match this tab filter"}
            </h3>
            <p className="text-sm text-slate-500 mb-5 max-w-sm mx-auto">
              {items.length === 0
                ? "Click 'Track' on any smartphone to monitor live prices across Amazon, Flipkart, and Croma."
                : "None of your tracked smartphones match the selected filter."}
            </p>
            <button
              onClick={() => navigate("/search")}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Find Phones to Track
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((item) => (
              <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
                <div className="flex gap-4">
                  <img
                    src={item.image}
                    alt={item.name}
                    referrerPolicy="no-referrer"
                    className="w-20 h-20 rounded-xl object-contain bg-slate-50 p-1 shrink-0 cursor-pointer"
                    onClick={() => navigate(`/product/${item.id}`)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <p className="text-xs font-semibold text-indigo-600 mb-0.5">{item.brand}</p>
                        <h3
                          className="text-sm font-semibold text-slate-800 line-clamp-1 cursor-pointer hover:text-indigo-700"
                          onClick={() => navigate(`/product/${item.id}`)}
                        >
                          {item.name}
                        </h3>
                      </div>
                      <button
                        onClick={() => handleUntrack(item.id)}
                        disabled={actionLoadingId === item.id}
                        className="text-xs text-slate-400 hover:text-red-600 p-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        title="Untrack product"
                      >
                        {actionLoadingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <X size={16} />}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-3 bg-slate-50 p-3 rounded-xl">
                      <div>
                        <p className="text-xs text-slate-500">Current Best</p>
                        <p className="text-base font-bold text-slate-900 font-mono">{fmt(item.bestPrice || item.currentPrice)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Target Price</p>
                        <p className="text-base font-bold text-indigo-600 font-mono">
                          {item.targetPrice ? fmt(item.targetPrice) : "Not set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Target Gap</p>
                        <p className={`text-base font-bold font-mono ${item.targetReached ? "text-emerald-600" : "text-amber-600"}`}>
                          {item.targetReached
                            ? "Target Reached!"
                            : item.distance !== null && item.distance !== undefined
                            ? `${fmt(item.distance)} away`
                            : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Store:</span>
                      <Badge variant="primary">{item.bestStore || "Amazon"}</Badge>
                      <button
                        onClick={() => navigate(`/product/${item.id}`)}
                        className="ml-auto text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
                      >
                        View Details →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
