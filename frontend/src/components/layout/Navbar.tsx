import { useState, useRef, useEffect } from "react"
import { Link, useNavigate, useLocation } from "react-router"
import {
  Search, Heart, Bell, User, ChevronDown, Zap, GitCompare, X,
  Home, Compass, BarChart2, Sparkles, Settings, LogOut, ListChecks, AlertCircle
} from "lucide-react"

const navLinks = [
  { to: "/", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/compare", label: "Compare", icon: GitCompare },
  { to: "/price-intelligence", label: "Price Intelligence", icon: BarChart2 },
  { to: "/for-you", label: "For You", icon: Sparkles },
]

const profileLinks = [
  { to: "/profile", label: "Profile", icon: User },
  { to: "/wishlist", label: "My Wishlist", icon: Heart },
  { to: "/watchlist", label: "Tracked Products", icon: ListChecks },
  { to: "/alerts", label: "Price Alerts", icon: AlertCircle },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/login", label: "Logout", icon: LogOut },
]

export default function Navbar() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(true)
        searchRef.current?.focus()
      }
      if (e.key === "Escape") {
        setSearchOpen(false)
        setProfileOpen(false)
        setNotifOpen(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
      setQuery("")
      setSearchOpen(false)
    }
  }

  const isActive = (to: string) => to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900">
              Price<span className="text-indigo-600">Wise</span>
            </span>
          </Link>

          {/* Nav Links */}
          <div className="hidden lg:flex items-center gap-0.5">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(to)
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Search Bar */}
          <form
            onSubmit={handleSearch}
            className="flex-1 max-w-xl hidden md:flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-1.5 border border-transparent focus-within:border-indigo-300 focus-within:bg-white transition-all"
          >
            <button type="submit" className="text-slate-400 hover:text-indigo-600 shrink-0 cursor-pointer">
              <Search size={15} />
            </button>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products, brands, categories..."
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
            />
            <span className="text-xs text-slate-400 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 font-mono hidden lg:block">
              ⌘K
            </span>
          </form>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full border-2 border-white" />
            </button>

            <Link to="/wishlist" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">
              <Heart size={18} />
            </Link>

            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <img
                  src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=40&h=40&fit=crop"
                  alt="Profile"
                  className="w-7 h-7 rounded-full object-cover"
                />
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl border border-slate-200 shadow-xl py-1 z-50">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-800">Arjun Sharma</p>
                    <p className="text-xs text-slate-500">arjun@example.com</p>
                  </div>
                  {profileLinks.map(({ to, label, icon: Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <Icon size={14} className="text-slate-400" />
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white/95 backdrop-blur-md border-t border-slate-200">
        <div className="grid grid-cols-5 h-14">
          {[
            { to: "/", label: "Home", icon: Home },
            { to: "/discover", label: "Discover", icon: Compass },
            { to: "/compare", label: "Compare", icon: GitCompare },
            { to: "/alerts", label: "Alerts", icon: Bell },
            { to: "/profile", label: "Profile", icon: User },
          ].map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                isActive(to) ? "text-indigo-600" : "text-slate-400"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {profileOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
      )}
      {notifOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
      )}
    </>
  )
}
