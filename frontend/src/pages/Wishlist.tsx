import { useState } from "react"
import { Heart, TrendingDown, TrendingUp, Bell, X, Star } from "lucide-react"
import { useNavigate } from "react-router"
import { wishlistItems } from "../data/mockData"
import Badge from "../components/ui/Badge"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const tabs = ["All", "On Sale", "Price Dropped", "Price Increased"]

export default function Wishlist() {
  const [activeTab, setActiveTab] = useState("All")
  const [items, setItems] = useState(wishlistItems)
  const navigate = useNavigate()

  const filtered = items.filter((item) => {
    if (activeTab === "All") return true
    if (activeTab === "Price Dropped") return item.change < 0
    if (activeTab === "Price Increased") return item.change > 0
    if (activeTab === "On Sale") return item.discount >= 10
    return true
  })

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Heart size={22} className="text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Wishlist</h1>
            <p className="text-sm text-slate-500">{items.length} saved products</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Saved Products", value: items.length, icon: Heart, color: "text-indigo-600", bg: "bg-indigo-50" },
            { label: "Price Drops", value: items.filter((i) => i.change < 0).length, icon: TrendingDown, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Potential Savings", value: "₹28,099", icon: TrendingDown, color: "text-emerald-600", bg: "bg-emerald-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
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
        <div className="flex gap-1 mb-5 bg-white rounded-xl border border-slate-200 p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <Heart size={40} className="text-slate-200 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Your wishlist is waiting</h3>
            <p className="text-sm text-slate-400 mb-4">Save products to keep track of prices and discover better deals.</p>
            <button
              onClick={() => navigate("/discover")}
              className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              Discover Products
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 hover:shadow-sm transition-shadow"
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-20 h-20 rounded-xl object-cover shrink-0 cursor-pointer"
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
                      <p className="text-xs text-slate-500">Current</p>
                      <p className="text-base font-bold text-slate-900">{fmt(item.bestPrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">When added</p>
                      <p className="text-sm text-slate-600 font-mono">{fmt(item.addedPrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Change</p>
                      <div className="flex items-center gap-1">
                        {item.change < 0 ? (
                          <TrendingDown size={13} className="text-emerald-600" />
                        ) : (
                          <TrendingUp size={13} className="text-red-500" />
                        )}
                        <span className={`text-sm font-semibold ${item.change < 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {item.change < 0 ? "" : "+"}{fmt(Math.abs(item.change))} ({item.changePercent}%)
                        </span>
                      </div>
                    </div>
                    <Badge variant={item.change < 0 ? "success" : "warning"}>
                      {item.bestStore}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <button className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors">
                    <Bell size={12} />
                    Track
                  </button>
                  <button
                    onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors"
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
