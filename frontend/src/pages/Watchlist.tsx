import { useState } from "react"
import { ListChecks, TrendingDown, Bell, X, Edit } from "lucide-react"
import { trackedProducts } from "../data/mockData"
import Badge from "../components/ui/Badge"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")
const tabs = ["All", "Near Target", "Price Dropped", "Target Reached"]

export default function Watchlist() {
  const [activeTab, setActiveTab] = useState("All")

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[900px] mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <ListChecks size={22} className="text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tracked Products</h1>
            <p className="text-sm text-slate-500">{trackedProducts.length} products being tracked</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white rounded-xl border border-slate-200 p-1 w-fit overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {trackedProducts.map((item) => {
            const progress = Math.round(((item.currentPrice - item.targetPrice) / item.currentPrice) * 100)
            return (
              <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex gap-4">
                  <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-indigo-600">{item.brand}</p>
                    <p className="text-sm font-semibold text-slate-800 line-clamp-1 mb-2">{item.name}</p>

                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-slate-500">Current</p>
                        <p className="text-base font-bold text-slate-900 font-mono">{fmt(item.currentPrice)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Target</p>
                        <p className="text-base font-bold text-indigo-600 font-mono">{fmt(item.targetPrice)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Distance</p>
                        <p className="text-base font-bold text-amber-600 font-mono">{fmt(item.distance)} away</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Target: {fmt(item.targetPrice)}</span>
                        <span>Current: {fmt(item.currentPrice)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all"
                          style={{ width: `${Math.max(10, 100 - progress)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="info">
                        <Bell size={10} />
                        Alert active
                      </Badge>
                      <Badge variant="neutral">{item.bestStore}</Badge>
                      <TrendingDown size={13} className="text-emerald-600" />
                      <span className="text-xs text-slate-400">Updated 1 hr ago</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <button className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors">
                      <Edit size={12} />
                      Edit Target
                    </button>
                    <button className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-amber-700 bg-slate-100 hover:bg-amber-50 px-2.5 py-1.5 rounded-lg transition-colors">
                      <Bell size={12} />
                      Pause
                    </button>
                    <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors">
                      <X size={12} />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
