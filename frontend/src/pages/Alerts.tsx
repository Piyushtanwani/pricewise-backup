import { useState, useEffect, useCallback } from "react"
import { Bell, TrendingDown, Trash2, Loader2, LogIn } from "lucide-react"
import { Link, useNavigate } from "react-router"
import Badge from "../components/ui/Badge"
import { api } from "../services/api"
import { useAuth } from "../context/AuthContext"

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

export default function Alerts() {
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()

  const [alerts, setAlerts] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [summary, setSummary] = useState<{
    activeAlerts: number
    priceDrops: number
    targetReached: number
    potentialSavings: number
  }>({
    activeAlerts: 0,
    priceDrops: 0,
    targetReached: 0,
    potentialSavings: 0,
  })
  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const loadAlerts = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const res = await api.getAlerts()
      const userAlerts = res?.alerts || []
      const eventItems = res?.events || []
      setAlerts(userAlerts)
      setEvents(eventItems)

      if (res?.summary) {
        setSummary(res.summary)
      } else {
        setSummary({
          activeAlerts: userAlerts.filter((a: any) => a.isActive).length,
          priceDrops: eventItems.filter((e: any) => e.status === "drop").length,
          targetReached: eventItems.filter((e: any) => e.status === "target").length,
          potentialSavings: eventItems.reduce(
            (acc: number, e: any) => acc + Math.max(0, (e.prevPrice || 0) - (e.newPrice || 0)),
            0
          ),
        })
      }
    } catch (err) {
      console.error("Failed to load alerts:", err)
      setAlerts([])
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!authLoading) {
      loadAlerts()
    }
  }, [authLoading, loadAlerts])

  const handleToggleActive = async (alertId: string, currentActive: boolean) => {
    try {
      setActionLoadingId(alertId)
      await api.updateAlert(alertId, { isActive: !currentActive })
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, isActive: !currentActive } : a))
      )
      setSummary((prev) => ({
        ...prev,
        activeAlerts: currentActive ? Math.max(0, prev.activeAlerts - 1) : prev.activeAlerts + 1,
      }))
    } catch (err: any) {
      console.error("Failed to update alert state:", err)
      alert("Failed to update alert: " + (err.response?.data?.message || err.message))
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleDeleteAlert = async (alertId: string) => {
    try {
      setActionLoadingId(alertId)
      await api.deleteAlert(alertId)
      setAlerts((prev) => prev.filter((a) => a.id !== alertId))
      setSummary((prev) => ({
        ...prev,
        activeAlerts: Math.max(0, prev.activeAlerts - 1),
      }))
    } catch (err: any) {
      console.error("Failed to delete alert:", err)
      alert("Failed to delete alert: " + (err.response?.data?.message || err.message))
    } finally {
      setActionLoadingId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 text-center">
        <Loader2 size={36} className="animate-spin text-indigo-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading price alerts...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-20">
        <div className="max-w-[480px] mx-auto px-6 py-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm mt-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Bell size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Sign in to View Price Alerts</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Create automated threshold notifications for your target smartphone prices across Amazon, Flipkart, and Croma.
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
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Bell size={22} className="text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Price Alerts</h1>
            <p className="text-sm text-slate-500">Track when your tracked smartphones hit your target price</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active Monitored", value: `${summary.activeAlerts}`, color: "text-indigo-600" },
            { label: "Price Drops Recorded", value: `${summary.priceDrops}`, color: "text-emerald-600" },
            { label: "Targets Reached", value: `${summary.targetReached}`, color: "text-indigo-600" },
            {
              label: "Potential Savings",
              value: summary.potentialSavings > 0 ? fmt(summary.potentialSavings) : "₹0",
              color: "text-emerald-600",
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
              <p className={`text-2xl font-bold font-mono ${color} mb-0.5`}>{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
            <p className="text-sm text-slate-500">Loading your alerts from database...</p>
          </div>
        ) : alerts.length === 0 && events.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 shadow-sm max-w-lg mx-auto">
            <Bell size={40} className="text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No active price alerts</h3>
            <p className="text-slate-500 text-sm mb-5 max-w-sm mx-auto">
              Set target price alerts on any smartphone detail page to be notified when prices drop.
            </p>
            <button
              onClick={() => navigate("/search")}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Discover Phones
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Alerts Section */}
            {alerts.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span>Active Target Price Monitors</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    {alerts.length}
                  </span>
                </h2>

                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`bg-white rounded-xl border p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between shadow-2xs transition-all ${
                        alert.isActive ? "border-slate-200" : "border-slate-100 opacity-70 bg-slate-50/50"
                      }`}
                    >
                      <div className="flex gap-3 items-center min-w-0">
                        <img
                          src={alert.product?.image}
                          alt={alert.product?.name}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-xl object-contain bg-slate-50 p-1 shrink-0 cursor-pointer"
                          onClick={() => navigate(`/product/${alert.product?.id}`)}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-indigo-600">{alert.product?.brand}</p>
                          <h3
                            className="text-sm font-semibold text-slate-800 line-clamp-1 cursor-pointer hover:text-indigo-700"
                            onClick={() => navigate(`/product/${alert.product?.id}`)}
                          >
                            {alert.product?.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-500">Target:</span>
                            <span className="text-sm font-bold text-indigo-600 font-mono">
                              {fmt(alert.targetPrice)}
                            </span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs text-slate-500">Current:</span>
                            <span className="text-xs font-semibold text-slate-800 font-mono">
                              {fmt(alert.currentPrice || alert.product?.bestPrice)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                        <button
                          onClick={() => handleToggleActive(alert.id, alert.isActive)}
                          disabled={actionLoadingId === alert.id}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                            alert.isActive
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {alert.isActive ? "Active" : "Paused"}
                        </button>
                        <button
                          onClick={() => handleDeleteAlert(alert.id)}
                          disabled={actionLoadingId === alert.id}
                          className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          title="Delete alert"
                        >
                          {actionLoadingId === alert.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Price Drop Events History */}
            {events.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <span>Price Drop Event History</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    {events.length}
                  </span>
                </h2>

                <div className="space-y-3">
                  {events.map((e) => (
                    <div
                      key={e.id}
                      className="bg-white rounded-xl border border-emerald-100 p-4 flex gap-4 shadow-2xs items-center"
                    >
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                        <TrendingDown size={18} className="text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 line-clamp-1">{e.product?.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {e.prevPrice && (
                            <span className="text-xs text-slate-400 line-through font-mono">
                              {fmt(e.prevPrice)}
                            </span>
                          )}
                          <span className="text-sm font-bold text-emerald-700 font-mono">{fmt(e.newPrice)}</span>
                          {e.dropPercent && (
                            <Badge variant="success">
                              <TrendingDown size={10} />
                              {e.dropPercent}% drop
                            </Badge>
                          )}
                          {e.target && (
                            <span className="text-xs text-indigo-600 font-medium">Target: {fmt(e.target)}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">
                        {new Date(e.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
