import { Bell, TrendingDown, ExternalLink, CheckCircle } from "lucide-react"
import { useNavigate } from "react-router"
import { alerts } from "../data/mockData"
import Badge from "../components/ui/Badge"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

export default function Alerts() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Bell size={22} className="text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Price Alerts</h1>
            <p className="text-sm text-slate-500">Track when your saved products hit the right price</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Active Alerts", value: "12", color: "text-indigo-600", bg: "bg-indigo-50" },
            { label: "Price Drops", value: "3", color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Target Reached", value: "1", color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Potential Savings", value: "₹24,500", color: "text-indigo-600", bg: "bg-indigo-50" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className={`text-2xl font-bold font-mono ${color} mb-0.5`}>{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Alert list */}
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="bg-white rounded-xl border border-emerald-200 p-4 flex gap-4">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                <TrendingDown size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 line-clamp-1">{alert.product.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-sm text-slate-500 line-through font-mono">{fmt(alert.prevPrice)}</span>
                      <span className="text-base font-bold text-emerald-700 font-mono">{fmt(alert.newPrice)}</span>
                      <Badge variant="success">
                        <TrendingDown size={10} />
                        {alert.dropPercent}% drop
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                      <span>Target: {fmt(alert.target)}</span>
                      <span>·</span>
                      <span>{alert.date}</span>
                      {alert.newPrice <= alert.target && (
                        <div className="flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle size={11} />
                          Target reached!
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/product/${alert.product.id}`)}
                    className="bg-indigo-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1 shrink-0"
                  >
                    View Deal <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state placeholder for no more alerts */}
        <div className="mt-6 bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <Bell size={28} className="text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500 mb-1">Set more price alerts</p>
          <p className="text-xs text-slate-400">Visit any product page and click "Set a Price Alert" to get notified of drops</p>
        </div>
      </div>
    </div>
  )
}
