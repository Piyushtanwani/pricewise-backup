import { useState, useRef, useEffect, useCallback } from "react"
import { Link, useNavigate, useLocation } from "react-router"
import {
  Search, Heart, Bell, User, ChevronDown, GitCompare, X,
  Home, Compass, BarChart2, Sparkles, Settings, LogOut, ListChecks,
  AlertCircle, Check, Loader2
} from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import { api } from "../../services/api"
import type { NotificationItem } from "../../types/user"

const navLinks = [
  { to: "/", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/compare", label: "Compare", icon: GitCompare },
  { to: "/price-intelligence", label: "Price Intelligence", icon: BarChart2 },
  { to: "/for-you", label: "For You", icon: Sparkles },
]

export default function Navbar() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifLoading, setNotifLoading] = useState(false)

  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const searchRef = useRef<HTMLInputElement>(null)

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([])
      setUnreadCount(0)
      return
    }

    try {
      setNotifLoading(true)
      const data = await api.getNotifications()
      setNotifications(data.items || [])
      setUnreadCount(data.unreadCount || 0)
    } catch {
      // Ignore if unauthenticated
    } finally {
      setNotifLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

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

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error("Failed to mark all as read:", err)
    }
  }

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch (err) {
      console.error("Failed to mark notification read:", err)
    }
  }

  const handleLogout = () => {
    logout()
    setProfileOpen(false)
    navigate("/login")
  }

  const isActive = (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to))

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "PW"

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0 hover:opacity-95 transition-opacity" aria-label="PriceWise Home">
            <img
              src="/logo.png"
              alt="PriceWise"
              className="h-8 md:h-9 w-auto object-contain select-none"
            />
          </Link>

          {/* Nav Links */}
          <div className="hidden lg:flex items-center gap-0.5">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(to)
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
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

          <div className="ml-auto flex items-center gap-2">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen(!notifOpen)
                  setProfileOpen(false)
                  if (!notifOpen) loadNotifications()
                }}
                className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-indigo-600 text-[10px] font-bold text-white rounded-full flex items-center justify-center border-2 border-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 z-50 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
                      <p className="text-xs text-slate-500">
                        {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                      </p>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifLoading ? (
                      <div className="py-8 text-center text-slate-400">
                        <Loader2 size={20} className="animate-spin mx-auto mb-2 text-indigo-600" />
                        <p className="text-xs">Loading notifications...</p>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="py-8 text-center px-4">
                        <Bell size={24} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-sm font-medium text-slate-700">No notifications yet</p>
                        <p className="text-xs text-slate-400 mt-1">
                          You'll see price drops and target alerts for your tracked products here.
                        </p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => !n.read && handleMarkRead(n.id)}
                          className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex gap-3 ${
                            !n.read ? "bg-indigo-50/40" : ""
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${
                              n.type === "price_drop"
                                ? "bg-emerald-100 text-emerald-700"
                                : n.type === "target_reached"
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            <Bell size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <p className={`text-xs font-semibold ${!n.read ? "text-slate-900" : "text-slate-700"}`}>
                                {n.title}
                              </p>
                              {!n.read && (
                                <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                              {n.body}
                            </p>
                            <span className="text-[10px] text-slate-400 mt-1 block">
                              {new Date(n.time).toLocaleDateString("en-IN", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 text-center">
                    <Link
                      to="/alerts"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-indigo-600 font-semibold hover:text-indigo-800"
                    >
                      View all alerts →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Wishlist Link */}
            <Link
              to="/wishlist"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              aria-label="Wishlist"
            >
              <Heart size={18} />
            </Link>

            {/* User Profile / Auth State */}
            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => {
                    setProfileOpen(!profileOpen)
                    setNotifOpen(false)
                  }}
                  className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                    {userInitials}
                  </div>
                  <span className="text-xs font-medium text-slate-700 max-w-[100px] truncate hidden sm:block">
                    {user.name.split(" ")[0]}
                  </span>
                  <ChevronDown size={14} className="text-slate-400" />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-50">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    </div>

                    <div className="py-1">
                      <Link
                        to="/profile"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                      >
                        <User size={15} className="text-slate-400" />
                        My Profile
                      </Link>
                      <Link
                        to="/wishlist"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                      >
                        <Heart size={15} className="text-slate-400" />
                        My Wishlist
                      </Link>
                      <Link
                        to="/watchlist"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                      >
                        <ListChecks size={15} className="text-slate-400" />
                        Tracked Products
                      </Link>
                      <Link
                        to="/alerts"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                      >
                        <AlertCircle size={15} className="text-slate-400" />
                        Price Alerts
                      </Link>
                      <Link
                        to="/settings"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                      >
                        <Settings size={15} className="text-slate-400" />
                        Account Settings
                      </Link>
                    </div>

                    <div className="border-t border-slate-100 pt-1">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left"
                      >
                        <LogOut size={15} className="text-rose-400" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl transition-colors shadow-2xs"
              >
                Sign In
              </Link>
            )}
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
                isActive(to) ? "text-indigo-600 font-semibold" : "text-slate-400"
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
