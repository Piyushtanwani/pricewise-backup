import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router"
import { Heart, Bell, ListChecks, Settings, Star, TrendingDown, BarChart2, Sparkles, Loader2, User as UserIcon, LogIn } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { api } from "../services/api"
import type { Product } from "../types/product"
import type { ProfileStats } from "../types/user"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

export default function Profile() {
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading } = useAuth()

  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [recentProducts, setRecentProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        setLoading(true)
        if (isAuthenticated) {
          const profileData = await api.getProfile().catch(() => null)
          if (isMounted && profileData) {
            setStats(profileData.stats)
          }
        }

        const recent = await api.getProducts({ limit: 4, sort: "relevance" }).catch(() => ({ items: [] }))
        if (isMounted) {
          setRecentProducts(recent.items || [])
        }
      } catch (err) {
        console.error("Failed to load profile data:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    if (!authLoading) {
      loadData()
    }

    return () => { isMounted = false }
  }, [isAuthenticated, authLoading])

  if (authLoading || (isAuthenticated && loading)) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 text-center">
        <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading your profile...</p>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-20">
        <div className="max-w-[500px] mx-auto px-6 py-12 text-center">
          <div className="w-16 h-16 rounded-3xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <UserIcon size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Sign in to View Profile</h1>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Create an account or sign in to track smartphones, manage your wishlist, and set price drop alerts.
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

  const initials = user.name
    ? user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : "PW"

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[900px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-blue-950 rounded-2xl p-6 mb-6 flex items-center gap-5 shadow-sm text-white relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/30 border-2 border-white/20 flex items-center justify-center text-white text-xl font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-white truncate">{user.name}</h1>
            <p className="text-slate-300 text-sm truncate">{user.email}</p>
            {user.phone && <p className="text-xs text-slate-400 mt-0.5">{user.phone}</p>}
            <p className="text-xs text-indigo-300 mt-1">
              Member since {new Date(user.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
            </p>
          </div>
          <Link to="/settings" className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
            <Settings size={18} className="text-white" />
          </Link>
        </div>

        {/* Real User Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Products Tracked", value: `${stats?.productsTracked ?? 0}`, icon: ListChecks, color: "text-indigo-600" },
            { label: "Wishlist Items", value: `${stats?.wishlistItems ?? 0}`, icon: Heart, color: "text-rose-600" },
            { label: "Active Alerts", value: `${stats?.activeAlerts ?? 0}`, icon: Bell, color: "text-amber-600" },
            { label: "Savings Discovered", value: fmt(stats?.savingsDiscovered ?? 0), icon: TrendingDown, color: "text-emerald-600" },
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

        {/* Catalog Showcase */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Trending in Catalog</h3>
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
