import { useState, useEffect, useCallback } from "react"
import { Heart, TrendingDown, Bell, X, Star, Loader2, LogIn, Sparkles } from "lucide-react"
import { Link, useNavigate } from "react-router"
import Badge from "../components/ui/Badge"
import { api } from "../services/api"
import { useAuth } from "../context/AuthContext"

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")
const tabs = ["All", "On Sale", "Price Dropped"]

export default function Wishlist() {
  const [activeTab, setActiveTab] = useState("All")
  const [items, setItems] = useState<any[]>([])
  const [summary, setSummary] = useState<{
    count: number
    priceDrops: number
    onSale: number
    totalSavings: number
  }>({
    count: 0,
    priceDrops: 0,
    onSale: 0,
    totalSavings: 0,
  })
  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const { isAuthenticated, loading: authLoading, toggleWishlist } = useAuth()
  const navigate = useNavigate()

  const loadWishlist = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const res = await api.getWishlist()
      const wishlistItems = res?.items || []
      setItems(wishlistItems)
      if (res?.summary) {
        setSummary(res.summary)
      } else {
        setSummary({
          count: wishlistItems.length,
          priceDrops: wishlistItems.filter((i: any) => (i.change || 0) < 0).length,
          onSale: wishlistItems.filter((i: any) => (i.discount || 0) >= 10).length,
          totalSavings: wishlistItems.reduce((acc: number, i: any) => acc + Math.max(0, -(i.change || 0)), 0),
        })
      }
    } catch (err) {
      console.error("Failed to load wishlist:", err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!authLoading) {
      loadWishlist()
    }
  }, [authLoading, loadWishlist])

  const handleRemove = async (productId: string) => {
    try {
      setActionLoadingId(productId)
      // Call centralized toggleWishlist or api directly
      await toggleWishlist(productId)
      setItems((prev) => prev.filter((item) => item.id !== productId && item.productId !== productId))
      setSummary((prev) => ({
        ...prev,
        count: Math.max(0, prev.count - 1),
      }))
    } catch (err: any) {
      console.error("Failed to remove item from wishlist:", err)
      alert("Failed to remove item from wishlist: " + (err.response?.data?.message || err.message))
    } finally {
      setActionLoadingId(null)
    }
  }

  const filtered = items.filter((item) => {
    if (activeTab === "All") return true
    if (activeTab === "Price Dropped") return (item.change || 0) < 0
    if (activeTab === "On Sale") return (item.discount || 0) >= 10
    return true
  })

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 text-center">
        <Loader2 size={36} className="animate-spin text-indigo-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading wishlist...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-20">
        <div className="max-w-[480px] mx-auto px-6 py-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm mt-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Heart size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Sign in to View Wishlist</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Save your favorite smartphones and keep track of price drops across Amazon, Flipkart, and Croma.
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
          <Heart size={22} className="text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Wishlist</h1>
            <p className="text-sm text-slate-500">{items.length} saved products in your account</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            {
              label: "Saved Products",
              value: summary.count || items.length,
              icon: Heart,
              color: "text-indigo-600",
              bg: "bg-indigo-50",
            },
            {
              label: "Price Drops Recorded",
              value: summary.priceDrops,
              icon: TrendingDown,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
            },
            {
              label: "Potential Savings",
              value: summary.totalSavings > 0 ? fmt(summary.totalSavings) : "₹0",
              icon: Sparkles,
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
        )}

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={36} />
            <p className="text-sm text-slate-500">Loading your saved products...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto">
            <Heart size={40} className="text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              {items.length === 0 ? "Your wishlist is empty" : "No items in this category"}
            </h3>
            <p className="text-sm text-slate-500 mb-5 max-w-sm mx-auto">
              {items.length === 0
                ? "Tap the heart icon on any smartphone to save it here and track deals over time."
                : "None of your saved products match the selected tab filter."}
            </p>
            <button
              onClick={() => navigate("/search")}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Browse Smartphones
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 hover:shadow-sm transition-shadow shadow-2xs items-center"
              >
                <img
                  src={item.image}
                  alt={item.name}
                  referrerPolicy="no-referrer"
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
                      <p className="text-xs text-slate-500">Current Best</p>
                      <p className="text-base font-bold text-slate-900">{fmt(item.bestPrice)}</p>
                    </div>
                    {item.addedPrice && (
                      <div>
                        <p className="text-xs text-slate-500">Price When Saved</p>
                        <p className="text-sm text-slate-600 font-mono">{fmt(item.addedPrice)}</p>
                      </div>
                    )}
                    {item.change !== undefined && item.change < 0 && (
                      <div>
                        <p className="text-xs text-slate-500">Price Drop</p>
                        <div className="flex items-center gap-1">
                          <TrendingDown size={13} className="text-emerald-600" />
                          <span className="text-sm font-semibold text-emerald-600">
                            Saved {fmt(Math.abs(item.change))} ({item.changePercent}%)
                          </span>
                        </div>
                      </div>
                    )}
                    {item.bestStore && (
                      <Badge variant="success">
                        {item.bestStore}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/product/${item.id}`)}
                    className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Bell size={12} />
                    View Details
                  </button>
                  <button
                    onClick={() => handleRemove(item.id)}
                    disabled={actionLoadingId === item.id}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {actionLoadingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
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
