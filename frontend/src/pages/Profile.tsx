import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router"
import { Heart, Bell, ListChecks, Settings, Star, TrendingDown, BarChart2, Sparkles, Loader2 } from "lucide-react"
import { api } from "../services/api"
import type { Product } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

export default function Profile() {
  const navigate = useNavigate()
  const [recentProducts, setRecentProducts] = useState<Product[]>([])
  const [totalCount, setTotalCount] = useState(140)

  useEffect(() => {
    let isMounted = true
    api.getProducts({ limit: 3, sort: "relevance" }).then((res) => {
      if (isMounted) {
        setRecentProducts(res.items || [])
        setTotalCount(res.total || 140)
      }
    }).catch(console.error)
    return () => { isMounted = false }
  }, [])

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[900px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-2xl p-6 mb-6 flex items-center gap-5 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/30 border-2 border-white/20 flex items-center justify-center text-white text-xl font-bold">
            PS
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">PriceWise User</h1>
            <p className="text-slate-400 text-sm">user@pricewise.io</p>
            <p className="text-xs text-indigo-300 mt-0.5">Connected to Supabase Live Database</p>
          </div>
          <Link to="/settings" className="ml-auto p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
            <Settings size={16} className="text-white" />
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Products in DB", value: `${totalCount}`, icon: BarChart2, color: "text-indigo-600" },
            { label: "Active Brands", value: "7 Brands", icon: Heart, color: "text-rose-600" },
            { label: "Stores Sync", value: "4 Stores", icon: Bell, color: "text-amber-600" },
            { label: "Price Intelligence", value: "Active", icon: TrendingDown, color: "text-emerald-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-2xs">
              <Icon size={18} className={`${color} mx-auto mb-1`} />
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Navigation cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { label: "My Wishlist", desc: "Saved phones & drop tracking", icon: Heart, to: "/wishlist", color: "bg-rose-50 text-rose-600" },
            { label: "Tracked Products", desc: "Target price thresholds", icon: ListChecks, to: "/watchlist", color: "bg-indigo-50 text-indigo-600" },
            { label: "Price Alerts", desc: "Notification triggers", icon: Bell, to: "/alerts", color: "bg-amber-50 text-amber-600" },
            { label: "For You", desc: "Personalized deals", icon: Sparkles, to: "/for-you", color: "bg-violet-50 text-violet-600" },
          ].map(({ label, desc, icon: Icon, to, color }) => (
            <Link
              key={label}
              to={to}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 hover:shadow-md transition-all group shadow-2xs"
            >
              <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Recently Viewed in Database */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Trending in Database</h3>
          <div className="space-y-3">
            {recentProducts.map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/product/${p.id}`)}
                className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors"
              >
                <img src={p.image} alt={p.name} className="w-12 h-12 rounded-xl object-contain bg-slate-50 p-1" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-indigo-600">{p.brand}</p>
                  <p className="text-sm font-medium text-slate-800 line-clamp-1">{p.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{fmt(p.bestPrice)}</p>
                  <div className="flex items-center gap-0.5 justify-end">
                    <Star size={10} className="fill-amber-400 text-amber-400" />
                    <span className="text-xs text-slate-500">{p.rating}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
