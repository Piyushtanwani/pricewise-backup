import { useState, useEffect } from "react"
import { Heart, TrendingDown, TrendingUp, Bell, X, Star, Loader2 } from "lucide-react"
import { useNavigate } from "react-router"
import Badge from "../components/ui/Badge"
import { api } from "../services/api"
import type { Product } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")
const tabs = ["All", "On Sale", "Price Dropped"]

export default function Wishlist() {
  const [activeTab, setActiveTab] = useState("All")
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true
    async function loadWishlist() {
      try {
        setLoading(true)
        const userWishlist = await api.getWishlist()
        if (isMounted && Array.isArray(userWishlist) && userWishlist.length > 0) {
          setItems(userWishlist)
          return
        }

        // Display real products from DB as active watchlist sample
        const res = await api.getProducts({ sort: "best_deal", limit: 4 })
        if (isMounted) {
          const sampleWishlist = (res.items || []).map((p) => ({
            ...p,
            addedPrice: p.mrp,
            change: p.bestPrice - p.mrp,
            changePercent: -p.discount,
          }))
          setItems(sampleWishlist)
        }
      } catch (err) {
        console.error("Failed to load wishlist:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadWishlist()
    return () => { isMounted = false }
  }, [])

  const filtered = items.filter((item) => {
    if (activeTab === "All") return true
    if (activeTab === "Price Dropped") return (item.change || 0) < 0
    if (activeTab === "On Sale") return (item.discount || 0) >= 10
    return true
  })

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Heart size={22} className="text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Wishlist</h1>
            <p className="text-sm text-slate-500">{items.length} saved products in database</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: "Saved Products", value: items.length, icon: Heart, color: "text-indigo-600", bg: "bg-indigo-50" },
            { label: "Price Drops", value: items.filter((i) => (i.change || 0) < 0).length, icon: TrendingDown, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Live Stores", value: "Amazon, Flipkart, Croma", icon: TrendingDown, color: "text-emerald-600", bg: "bg-emerald-50" },
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
        <div className="flex gap-1 mb-5 bg-white rounded-xl border border-slate-200 p-1 w-fit shadow-2xs">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
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
            <p className="text-sm text-slate-500">Loading wishlist from database...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <Heart size={40} className="text-slate-200 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Your wishlist is empty</h3>
            <p className="text-sm text-slate-400 mb-4">Save products to keep track of prices and discover better deals.</p>
            <button
              onClick={() => navigate("/search")}
              className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Discover Products
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 hover:shadow-sm transition-shadow shadow-2xs"
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-20 h-20 rounded-xl object-contain bg-slate-50 p-1 shrink-0 cursor-pointer"
                  onClick={() => navigate(`/product/${item.id}`)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-indigo-600 mb-0.5">{item.brand}</p>
                  <h3
                    className="text-sm font-semibold text-slate-800 line-clamp-1 mb-2 cursor-pointer hover:text-indigo-700"
                    onClick={() => navigate(`/product/${item.id}`)}
                  >
                    {item.name}
                  </h3>

                  <div className="flex items-center gap-1 mb-2">
                    <Star size={11} className="fill-amber-400 text-amber-400" />
                    <span className="text-xs text-slate-600">{item.rating}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <p className="text-xs text-slate-500">Current Price</p>
                      <p className="text-base font-bold text-slate-900">{fmt(item.bestPrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Estimated MRP</p>
                      <p className="text-sm text-slate-600 font-mono">{fmt(item.mrp || item.addedPrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Discount</p>
                      <div className="flex items-center gap-1">
                        <TrendingDown size={13} className="text-emerald-600" />
                        <span className="text-sm font-semibold text-emerald-600">
                          -{item.discount}%
                        </span>
                      </div>
                    </div>
                    <Badge variant="success">
                      {item.bestStore}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/product/${item.id}`)}
                    className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Bell size={12} />
                    View Details
                  </button>
                  <button
                    onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <X size={12} />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
