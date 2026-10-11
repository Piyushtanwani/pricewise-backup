import { useState, useEffect } from "react"
import { ListChecks, TrendingDown, Bell, X, Loader2 } from "lucide-react"
import { useNavigate } from "react-router"
import Badge from "../components/ui/Badge"
import { api } from "../services/api"
import type { Product } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")
const tabs = ["All", "Near Target", "Price Dropped"]

export default function Watchlist() {
  const [activeTab, setActiveTab] = useState("All")
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true
    async function loadWatchlist() {
      try {
        setLoading(true)
        const userWatchlist = await api.getWatchlist()
        if (isMounted && Array.isArray(userWatchlist) && userWatchlist.length > 0) {
          setItems(userWatchlist)
          return
        }

        // Display real products from DB as active watchlist
        const res = await api.getProducts({ sort: "relevance", limit: 3 })
        if (isMounted) {
          const sampleWatchlist = (res.items || []).map((p) => {
            const targetPrice = Math.round(p.bestPrice * 0.92)
            return {
              ...p,
              currentPrice: p.bestPrice,
              targetPrice,
              distance: p.bestPrice - targetPrice,
            }
          })
          setItems(sampleWatchlist)
        }
      } catch (err) {
        console.error("Failed to load watchlist:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadWatchlist()
    return () => { isMounted = false }
  }, [])

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

        {/* Tabs */}
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

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
            <p className="text-sm text-slate-500">Loading tracked products from database...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <ListChecks size={40} className="text-slate-200 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No tracked products yet</h3>
            <p className="text-sm text-slate-400 mb-4">Set target prices on any smartphone to track price drops.</p>
            <button
              onClick={() => navigate("/search")}
              className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Find Phones to Track
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
                <div className="flex gap-4">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-16 h-16 rounded-xl object-contain bg-slate-50 p-1 shrink-0 cursor-pointer"
                    onClick={() => navigate(`/product/${item.id}`)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-indigo-600">{item.brand}</p>
                    <p
                      className="text-sm font-semibold text-slate-800 line-clamp-1 mb-2 cursor-pointer hover:text-indigo-600"
                      onClick={() => navigate(`/product/${item.id}`)}
                    >
                      {item.name}
                    </p>

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

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Retailer:</span>
                      <Badge variant="primary">{item.bestStore}</Badge>
                      <button
                        onClick={() => navigate(`/product/${item.id}`)}
                        className="ml-auto text-xs text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer"
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
