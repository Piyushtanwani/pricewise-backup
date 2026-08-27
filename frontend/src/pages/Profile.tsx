import { Link } from "react-router"
import { Heart, Bell, ListChecks, Settings, Star, TrendingDown, BarChart2, Sparkles } from "lucide-react"
import { products } from "../data/mockData"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

export default function Profile() {
  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[900px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-2xl p-6 mb-6 flex items-center gap-5">
          <img
            src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop"
            alt="Profile"
            className="w-16 h-16 rounded-2xl object-cover border-2 border-white/20"
          />
          <div>
            <h1 className="text-xl font-bold text-white">Arjun Sharma</h1>
            <p className="text-slate-400 text-sm">arjun@example.com</p>
            <p className="text-xs text-slate-500 mt-0.5">Member since January 2024</p>
          </div>
          <Link to="/settings" className="ml-auto p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
            <Settings size={16} className="text-white" />
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Products Tracked", value: "24", icon: BarChart2, color: "text-indigo-600" },
            { label: "Wishlist Items", value: "12", icon: Heart, color: "text-rose-600" },
            { label: "Alerts Received", value: "47", icon: Bell, color: "text-amber-600" },
            { label: "Savings Discovered", value: "₹34,299", icon: TrendingDown, color: "text-emerald-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <Icon size={18} className={`${color} mx-auto mb-1`} />
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Navigation cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { label: "My Wishlist", desc: "12 saved products", icon: Heart, to: "/wishlist", color: "bg-rose-50 text-rose-600" },
            { label: "Tracked Products", desc: "3 being tracked", icon: ListChecks, to: "/watchlist", color: "bg-indigo-50 text-indigo-600" },
            { label: "Price Alerts", desc: "12 active alerts", icon: Bell, to: "/alerts", color: "bg-amber-50 text-amber-600" },
            { label: "For You", desc: "New recommendations", icon: Sparkles, to: "/for-you", color: "bg-violet-50 text-violet-600" },
          ].map(({ label, desc, icon: Icon, to, color }) => (
            <Link
              key={label}
              to={to}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 hover:shadow-md transition-all group"
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

        {/* Recently Viewed */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Recently Viewed</h3>
          <div className="space-y-3">
            {products.slice(0, 3).map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <img src={p.image} alt={p.name} className="w-12 h-12 rounded-xl object-cover" />
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
