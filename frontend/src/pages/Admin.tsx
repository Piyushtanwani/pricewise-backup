import React, { useState, useEffect, useCallback } from "react"
import {
  ShieldCheck, ShieldAlert, BarChart3, Package, Users, Bell, RefreshCw, Plus,
  Search, Trash2, Edit2, CheckCircle2, AlertTriangle, X,
  TrendingDown, ExternalLink, UserCheck, UserX, Loader2, Play,
  ChevronLeft, ChevronRight
} from "lucide-react"
import { useNavigate } from "react-router"
import { useAuth } from "../context/AuthContext"
import { api } from "../services/api"
import Badge from "../components/ui/Badge"

const fmt = (n?: number | null) => (n !== undefined && n !== null ? "₹" + Math.round(n).toLocaleString("en-IN") : "—")

const resolveProductImage = (url?: string | null, brand?: string) => {
  if (url) {
    const spMatch = url.match(/(?:images\.smartprix\.com\/|rx-i)([A-Za-z0-9_-]+)(?:\.webp|-w)/)
    if (spMatch) {
      return `https://cdn1.smartprix.com/rx-i${spMatch[1]}-w280-h280/phone.webp`
    }
    if (url.startsWith("http") && !url.includes("images.smartprix.com")) {
      return url
    }
  }

  const b = (brand || "").toLowerCase()
  if (b.includes("apple")) return "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80"
  if (b.includes("samsung")) return "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80"
  if (b.includes("oneplus")) return "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80"
  if (b.includes("motorola")) return "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80"
  if (b.includes("vivo")) return "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600&auto=format&fit=crop&q=80"
  if (b.includes("realme")) return "https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=600&auto=format&fit=crop&q=80"
  if (b.includes("oppo")) return "https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=600&auto=format&fit=crop&q=80"
  return "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80"
}

// -----------------------------------------------------------------------------
// Access Denied Screen with 5-Second Auto-Redirect
// -----------------------------------------------------------------------------
function AdminAccessDenied() {
  const navigate = useNavigate()
  const [secondsLeft, setSecondsLeft] = useState(5)

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          navigate("/")
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-rose-200 shadow-xl text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600" />

        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldAlert size={36} />
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 mb-2">
          Access Restricted
        </span>

        <h1 className="text-2xl font-black text-slate-900 mb-2">
          Admin Not Allowed
        </h1>

        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          You do not have administrative permissions to view or manage the PriceWise administration console.
        </p>

        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 mb-6 flex items-center justify-center gap-3">
          <div className="w-9 h-9 rounded-full bg-rose-600 text-white font-extrabold text-sm flex items-center justify-center shrink-0 shadow-sm animate-pulse">
            {secondsLeft}s
          </div>
          <p className="text-xs text-slate-600 font-medium text-left">
            Redirecting to <span className="font-bold text-slate-900">Home page</span> automatically in{" "}
            <span className="font-bold text-rose-600">{secondsLeft} seconds</span>...
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button
            onClick={() => navigate("/")}
            className="w-full sm:w-auto flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            Go to Home Now
          </button>
          <button
            onClick={() => navigate("/login")}
            className="w-full sm:w-auto flex-1 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            Switch Account
          </button>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Reusable Table Pagination Bar
// -----------------------------------------------------------------------------
function AdminPagination({
  currentPage,
  totalItems,
  limit,
  onPageChange,
  onLimitChange,
  itemLabel = "items",
}: {
  currentPage: number
  totalItems: number
  limit: number
  onPageChange: (newPage: number) => void
  onLimitChange?: (newLimit: number) => void
  itemLabel?: string
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / limit))
  if (totalItems <= 0) return null

  const from = (currentPage - 1) * limit + 1
  const to = Math.min(currentPage * limit, totalItems)

  const getPages = () => {
    const pages: (number | string)[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", totalPages)
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
      } else {
        pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages)
      }
    }
    return pages
  }

  return (
    <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
      <div className="flex items-center gap-2">
        <span>
          Showing <span className="font-bold text-slate-800">{from}</span>–<span className="font-bold text-slate-800">{to}</span> of{" "}
          <span className="font-bold text-slate-800">{totalItems}</span> {itemLabel}
        </span>
        {onLimitChange && (
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[11px] text-slate-400">Per page:</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="py-0.5 px-1.5 rounded border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700 cursor-pointer transition-colors"
        >
          <ChevronLeft size={13} /> Prev
        </button>

        <div className="flex items-center gap-1">
          {getPages().map((p, idx) =>
            typeof p === "number" ? (
              <button
                key={idx}
                onClick={() => onPageChange(p)}
                className={`min-w-7 h-7 px-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  p === currentPage
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "border border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
                }`}
              >
                {p}
              </button>
            ) : (
              <span key={idx} className="px-1 text-slate-400 font-bold">
                ...
              </span>
            )
          )}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700 cursor-pointer transition-colors"
        >
          Next <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

export default function Admin() {
  const { user, isAuthenticated, isAdmin, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<"reports" | "products" | "users" | "queue">("reports")
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 1. Reports Data
  const [reports, setReports] = useState<any>(null)

  // 2. Products Data
  const [products, setProducts] = useState<any[]>([])
  const [prodTotal, setProdTotal] = useState(0)
  const [prodPage, setProdPage] = useState(1)
  const [prodLimit, setProdLimit] = useState(15)
  const [prodSearch, setProdSearch] = useState("")
  const [prodStockFilter, setProdStockFilter] = useState("all")
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any | null>(null)

  // Product Form state
  const [pName, setPName] = useState("")
  const [pBrand, setPBrand] = useState("")
  const [pCategory, setPCategory] = useState("Mobiles")
  const [pMrp, setPMrp] = useState<number | "">("")
  const [pImage, setPImage] = useState("")
  const [pDesc, setPDesc] = useState("")
  const [pRam, setPRam] = useState("")
  const [pStorage, setPStorage] = useState("")
  const [pBattery, setPBattery] = useState("")
  const [pProcessor, setPProcessor] = useState("")
  // Store listings in product form
  const [storeRows, setStoreRows] = useState<Array<{ storeName: string; currentPrice: number | ""; productUrl: string; stockStatus: string }>>([
    { storeName: "Amazon", currentPrice: "", productUrl: "", stockStatus: "IN_STOCK" },
    { storeName: "Flipkart", currentPrice: "", productUrl: "", stockStatus: "IN_STOCK" },
  ])

  // 3. Users Data
  const [usersList, setUsersList] = useState<any[]>([])
  const [userTotal, setUserTotal] = useState(0)
  const [userPage, setUserPage] = useState(1)
  const [userLimit, setUserLimit] = useState(15)
  const [userSearch, setUserSearch] = useState("")
  const [userRoleFilter, setUserRoleFilter] = useState("all")

  // 4. Queue Data
  const [queueJobs, setQueueJobs] = useState<any[]>([])
  const [queueTotal, setQueueTotal] = useState(0)
  const [queuePage, setQueuePage] = useState(1)
  const [queueLimit, setQueueLimit] = useState(15)
  const [queueStatus, setQueueStatus] = useState("all")

  const clearMsgs = () => {
    setSuccessMsg(null)
    setErrorMsg(null)
  }

  // Load Reports
  const loadReports = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.getAdminReports()
      setReports(data)
    } catch (err: any) {
      setErrorMsg("Failed to load reports: " + (err?.response?.data?.message || err.message))
    } finally {
      setLoading(false)
    }
  }, [])

  // Load Products
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.getAdminProducts({
        page: prodPage,
        limit: prodLimit,
        q: prodSearch || undefined,
        stock: prodStockFilter !== "all" ? prodStockFilter : undefined,
      })
      setProducts(res.products || [])
      setProdTotal(res.pagination?.total || 0)
    } catch (err: any) {
      setErrorMsg("Failed to load products: " + (err?.response?.data?.message || err.message))
    } finally {
      setLoading(false)
    }
  }, [prodPage, prodLimit, prodSearch, prodStockFilter])

  // Load Users
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.getAdminUsers({
        page: userPage,
        limit: userLimit,
        q: userSearch || undefined,
        role: userRoleFilter !== "all" ? userRoleFilter : undefined,
      })
      setUsersList(res.users || [])
      setUserTotal(res.pagination?.total || 0)
    } catch (err: any) {
      setErrorMsg("Failed to load users: " + (err?.response?.data?.message || err.message))
    } finally {
      setLoading(false)
    }
  }, [userPage, userLimit, userSearch, userRoleFilter])

  // Load Notification Queue
  const loadQueue = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.getAdminNotificationQueue({
        page: queuePage,
        limit: queueLimit,
        status: queueStatus !== "all" ? queueStatus : undefined,
      })
      setQueueJobs(res.jobs || [])
      setQueueTotal(res.pagination?.total || 0)
    } catch (err: any) {
      setErrorMsg("Failed to load queue: " + (err?.response?.data?.message || err.message))
    } finally {
      setLoading(false)
    }
  }, [queuePage, queueLimit, queueStatus])

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      return
    }
    if (activeTab === "reports") loadReports()
    if (activeTab === "products") loadProducts()
    if (activeTab === "users") loadUsers()
    if (activeTab === "queue") loadQueue()
  }, [authLoading, isAuthenticated, isAdmin, activeTab, loadReports, loadProducts, loadUsers, loadQueue])

  const handleTriggerMonitor = async () => {
    try {
      setActionLoading(true)
      clearMsgs()
      const res = await api.triggerAdminMonitorCycle()
      setSuccessMsg(`Monitoring cycle executed: ${res.result?.checked || 0} alerts checked, ${res.result?.eligible || 0} eligible, ${res.result?.sent || 0} sent.`)
      loadReports()
    } catch (err: any) {
      setErrorMsg("Failed to trigger monitor: " + (err?.response?.data?.message || err.message))
    } finally {
      setActionLoading(false)
    }
  }

  // Open Product Modal (New or Edit)
  const openProductModal = (prod?: any) => {
    clearMsgs()
    if (prod) {
      setEditingProduct(prod)
      setPName(prod.name || "")
      setPBrand(prod.brand || "")
      setPCategory(prod.category || "Mobiles")
      setPMrp(prod.mrp || "")
      setPImage(prod.imageUrl || "")
      setPDesc(prod.description || "")
      setPRam(prod.techSpecs?.RAM || prod.techSpecs?.ram || "")
      setPStorage(prod.techSpecs?.Storage || prod.techSpecs?.storage || "")
      setPBattery(prod.techSpecs?.Battery || prod.techSpecs?.battery || "")
      setPProcessor(prod.techSpecs?.Processor || prod.techSpecs?.processor || "")
      if (prod.stores && prod.stores.length > 0) {
        setStoreRows(
          prod.stores.map((s: any) => ({
            storeName: s.storeName || s.store?.name || "Amazon",
            currentPrice: s.currentPrice || "",
            productUrl: s.productUrl || "",
            stockStatus: s.stockStatus || "IN_STOCK",
          }))
        )
      } else {
        setStoreRows([{ storeName: "Amazon", currentPrice: prod.bestPrice || "", productUrl: "", stockStatus: "IN_STOCK" }])
      }
    } else {
      setEditingProduct(null)
      setPName("")
      setPBrand("")
      setPCategory("Mobiles")
      setPMrp("")
      setPImage("")
      setPDesc("")
      setPRam("")
      setPStorage("")
      setPBattery("")
      setPProcessor("")
      setStoreRows([
        { storeName: "Amazon", currentPrice: "", productUrl: "", stockStatus: "IN_STOCK" },
        { storeName: "Flipkart", currentPrice: "", productUrl: "", stockStatus: "IN_STOCK" },
      ])
    }
    setProductModalOpen(true)
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pName || !pBrand) {
      setErrorMsg("Product Name and Brand are required.")
      return
    }

    try {
      setActionLoading(true)
      clearMsgs()

      const techSpecs: Record<string, string> = {}
      if (pRam) techSpecs["RAM"] = pRam
      if (pStorage) techSpecs["Storage"] = pStorage
      if (pBattery) techSpecs["Battery"] = pBattery
      if (pProcessor) techSpecs["Processor"] = pProcessor

      const specs = [pRam && `${pRam} RAM`, pStorage && `${pStorage} Storage`, pBattery && `${pBattery} Battery`, pProcessor].filter(Boolean) as string[]

      const payload = {
        name: pName,
        brand: pBrand,
        category: pCategory,
        mrp: pMrp ? Number(pMrp) : undefined,
        imageUrl: pImage || undefined,
        description: pDesc || undefined,
        techSpecs,
        specs,
        stores: storeRows.filter((s) => s.storeName && s.currentPrice !== ""),
      }

      if (editingProduct) {
        await api.updateAdminProduct(editingProduct.id, payload)
        setSuccessMsg(`Product "${pName}" successfully updated!`)
      } else {
        await api.createAdminProduct(payload)
        setSuccessMsg(`Product "${pName}" successfully created!`)
      }

      setProductModalOpen(false)
      loadProducts()
    } catch (err: any) {
      setErrorMsg("Failed to save product: " + (err?.response?.data?.message || err.message))
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteProduct = async (prodId: string, prodName: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${prodName}"? This will clean up alerts, watchlists, and price history.`)) {
      return
    }
    try {
      setActionLoading(true)
      clearMsgs()
      await api.deleteAdminProduct(prodId)
      setSuccessMsg(`Product "${prodName}" deleted.`)
      loadProducts()
    } catch (err: any) {
      setErrorMsg("Failed to delete product: " + (err?.response?.data?.message || err.message))
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleProductStock = async (prod: any) => {
    try {
      setActionLoading(true)
      clearMsgs()
      const isCurrentlyIn = prod.stockStatus === "IN_STOCK"
      const newStatus = isCurrentlyIn ? "OUT_OF_STOCK" : "IN_STOCK"

      const updatedStores = (prod.stores || []).map((s: any) => ({
        storeName: s.storeName,
        currentPrice: s.currentPrice,
        stockStatus: newStatus,
        productUrl: s.productUrl,
      }))

      await api.updateAdminProduct(prod.id, { stores: updatedStores })
      setSuccessMsg(`Stock status for "${prod.name}" changed to ${newStatus}.`)
      loadProducts()
    } catch (err: any) {
      setErrorMsg("Failed to update stock: " + (err?.response?.data?.message || err.message))
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdateRole = async (userId: string, currentRole: string) => {
    const nextRole = currentRole === "ADMIN" ? "USER" : "ADMIN"
    if (!window.confirm(`Change this user's role to ${nextRole}?`)) return

    try {
      setActionLoading(true)
      clearMsgs()
      await api.updateAdminUserRole(userId, nextRole as "USER" | "ADMIN")
      setSuccessMsg(`User role updated to ${nextRole}.`)
      loadUsers()
    } catch (err: any) {
      setErrorMsg("Failed to update role: " + (err?.response?.data?.message || err.message))
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleBan = async (userId: string, isBanned: boolean) => {
    if (!window.confirm(isBanned ? "Reactivate this user account?" : "Suspend this user account?")) return

    try {
      setActionLoading(true)
      clearMsgs()
      await api.toggleAdminUserBan(userId)
      setSuccessMsg(`User account status updated.`)
      loadUsers()
    } catch (err: any) {
      setErrorMsg("Failed to update status: " + (err?.response?.data?.message || err.message))
    } finally {
      setActionLoading(false)
    }
  }

  const handleRetryJob = async (jobId: string) => {
    try {
      setActionLoading(true)
      clearMsgs()
      await api.retryAdminNotificationJob(jobId)
      setSuccessMsg(`Job reset to PENDING. It will dispatch in the next 60s monitor cycle.`)
      loadQueue()
    } catch (err: any) {
      setErrorMsg("Failed to retry job: " + (err?.response?.data?.message || err.message))
    } finally {
      setActionLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 text-center">
        <Loader2 size={36} className="animate-spin text-indigo-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Verifying administrator credentials...</p>
      </div>
    )
  }

  if (!isAuthenticated || !isAdmin) {
    return <AdminAccessDenied />
  }

  if (!isAuthenticated || !isAdmin) {
    return <AdminAccessDenied />
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-16 pb-12">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 rounded-2xl p-6 text-white mb-6 shadow-md border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldCheck size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">PriceWise Administration Console</h1>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Logged in as <strong className="text-amber-300">{user?.email}</strong> • Full system access to catalog, users & reports.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleTriggerMonitor}
              disabled={actionLoading}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title="Execute 60-second price alert monitor cycle now"
            >
              <Play size={13} className="text-emerald-400 fill-emerald-400" />
              <span>Run Alert Monitor Now</span>
            </button>
            <button
              onClick={() => openProductModal()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-indigo-600/30 cursor-pointer"
            >
              <Plus size={15} />
              <span>Add New Product</span>
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {successMsg && (
          <div className="p-3.5 mb-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 mb-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-700 hover:text-rose-900 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "reports"
                ? "bg-white text-indigo-600 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <BarChart3 size={16} />
            <span>Reports & Overview</span>
          </button>

          <button
            onClick={() => setActiveTab("products")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "products"
                ? "bg-white text-indigo-600 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Package size={16} />
            <span>Product Catalog ({prodTotal || reports?.summary?.totalProducts || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "users"
                ? "bg-white text-indigo-600 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Users size={16} />
            <span>User Directory ({userTotal || reports?.summary?.totalUsers || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("queue")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "queue"
                ? "bg-white text-indigo-600 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
            }`}
          >
            <Bell size={16} />
            <span>Alert Queue & Jobs ({reports?.summary?.totalAlerts || 0})</span>
          </button>
        </div>

        {/* =========================================================================
            TAB 1: REPORTS & ANALYTICS OVERVIEW
        ========================================================================== */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Users</span>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{reports?.summary?.totalUsers?.toLocaleString() || 0}</p>
                <span className="text-[10px] text-emerald-600 font-semibold mt-1 inline-block">Registered accounts</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Catalog Phones</span>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{reports?.summary?.totalProducts?.toLocaleString() || 0}</p>
                <span className="text-[10px] text-indigo-600 font-semibold mt-1 inline-block">{reports?.summary?.totalListings || 0} store rates</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Alerts</span>
                <p className="text-2xl font-extrabold text-indigo-600 mt-1">{reports?.summary?.activeAlerts?.toLocaleString() || 0}</p>
                <span className="text-[10px] text-slate-500 font-medium mt-1 inline-block">of {reports?.summary?.totalAlerts || 0} total</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Price Drops</span>
                <p className="text-2xl font-extrabold text-emerald-600 mt-1">{reports?.notifications?.priceDrops?.toLocaleString() || 0}</p>
                <span className="text-[10px] text-emerald-700 font-medium mt-1 inline-block">Drops notified</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Back In Stock</span>
                <p className="text-2xl font-extrabold text-sky-600 mt-1">{reports?.notifications?.backInStock?.toLocaleString() || 0}</p>
                <span className="text-[10px] text-sky-700 font-medium mt-1 inline-block">Restocks notified</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Monitor Status</span>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${reports?.systemHealth?.monitorRunning ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                  <span className="text-xs font-bold text-slate-800">{reports?.systemHealth?.monitorRunning ? "60s Active" : "Stopped"}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono mt-1 inline-block">0s overlap guard</span>
              </div>
            </div>

            {/* Middle Grid: Top Tracked Phones & Retailer Spread */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top Tracked Products */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <TrendingDown size={16} className="text-indigo-600" />
                    <span>Most Tracked Smartphones</span>
                  </h3>
                  <span className="text-xs text-slate-400">By user price alerts</span>
                </div>

                <div className="space-y-3">
                  {reports?.topTracked?.length > 0 ? (
                    reports.topTracked.map((item: any, idx: number) => (
                      <div key={item.product?.id || idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-5 text-xs font-bold text-slate-400 font-mono">#{idx + 1}</span>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-800 truncate">{item.product?.name}</h4>
                            <p className="text-[11px] text-slate-500 font-mono">{fmt(item.product?.bestPrice)} current best</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
                            {item.alertsCount} {item.alertsCount === 1 ? "alert" : "alerts"}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-6">No price alerts tracked yet.</p>
                  )}
                </div>
              </div>

              {/* Retailer Store Coverage */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Package size={16} className="text-indigo-600" />
                    <span>Retailer Coverage & Best Price Deals</span>
                  </h3>
                  <span className="text-xs text-slate-400">{reports?.stores?.length || 0} Stores Connected</span>
                </div>

                <div className="space-y-3">
                  {reports?.stores?.map((st: any) => (
                    <div key={st.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{st.name}</p>
                        <span className="text-[11px] text-slate-500">{st.totalListings} total phone listings</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {st.bestPriceDeals} Lowest Deals
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Row: Recent Notifications Log */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Bell size={16} className="text-indigo-600" />
                <span>Recent System Price Alerts & Notifications</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Title & Message</th>
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-3">Sent At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports?.recentNotifications?.map((n: any) => (
                      <tr key={n.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-semibold">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            n.type === "BACK_IN_STOCK"
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}>
                            {n.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-800">{n.title}</p>
                          <p className="text-slate-500 text-[11px] line-clamp-1">{n.body}</p>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{n.user?.email || "—"}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">{n.product?.name || "—"}</td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: PRODUCT MANAGEMENT (CRUD)
        ========================================================================== */}
        {activeTab === "products" && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search phone name, brand, category..."
                  value={prodSearch}
                  onChange={(e) => {
                    setProdSearch(e.target.value)
                    setProdPage(1)
                  }}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <select
                  value={prodStockFilter}
                  onChange={(e) => {
                    setProdStockFilter(e.target.value)
                    setProdPage(1)
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
                >
                  <option value="all">All Stock Statuses</option>
                  <option value="IN_STOCK">In Stock Only</option>
                  <option value="OUT_OF_STOCK">Out of Stock Only</option>
                </select>

                <button
                  onClick={() => openProductModal()}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0"
                >
                  <Plus size={14} /> Add Product
                </button>
              </div>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Device</th>
                      <th className="py-3 px-3">Brand</th>
                      <th className="py-3 px-3">Current Best Price</th>
                      <th className="py-3 px-3">MRP</th>
                      <th className="py-3 px-3">Stores Listed</th>
                      <th className="py-3 px-3">Stock Status</th>
                      <th className="py-3 px-3">Alerts Tracked</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.length > 0 ? (
                      products.map((p) => {
                        const inStock = p.stockStatus === "IN_STOCK"
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={resolveProductImage(p.imageUrl, p.brand)}
                                  alt={p.name}
                                  referrerPolicy="no-referrer"
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.onerror = null
                                    e.currentTarget.src = resolveProductImage(null, p.brand)
                                  }}
                                  className="w-10 h-10 object-contain rounded-lg bg-slate-50 border border-slate-200 p-0.5 shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900 truncate max-w-xs">{p.name}</p>
                                  <span className="text-[10px] text-slate-400 font-mono">ID: {p.id.slice(0, 8)}...</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 font-semibold text-slate-700">{p.brand}</td>
                            <td className="py-3 px-3 font-bold font-mono text-indigo-600">
                              {fmt(p.bestPrice)}
                              <span className="block text-[10px] text-slate-400 font-normal">at {p.bestStore || "Amazon"}</span>
                            </td>
                            <td className="py-3 px-3 text-slate-400 line-through font-mono">{fmt(p.mrp)}</td>
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[11px]">
                                {p.listingsCount} {p.listingsCount === 1 ? "store" : "stores"}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <button
                                onClick={() => handleToggleProductStock(p)}
                                title="Click to toggle stock status"
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                                  inStock
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                    : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                                }`}
                              >
                                {inStock ? "● In Stock" : "○ Out of Stock"}
                              </button>
                            </td>
                            <td className="py-3 px-3 font-semibold text-slate-700">
                              {p.alertsCount > 0 ? (
                                <span className="text-indigo-600 font-bold">{p.alertsCount} subscribers</span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => openProductModal(p)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 cursor-pointer"
                                  title="Edit phone details & store prices"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteProduct(p.id, p.name)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Delete product"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          {loading ? "Loading products..." : "No products found matching criteria."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <AdminPagination
                currentPage={prodPage}
                totalItems={prodTotal}
                limit={prodLimit}
                onPageChange={(p) => setProdPage(p)}
                onLimitChange={(l) => {
                  setProdLimit(l)
                  setProdPage(1)
                }}
                itemLabel="smartphones"
              />
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: USER MANAGEMENT
        ========================================================================== */}
        {activeTab === "users" && (
          <div className="space-y-4">
            {/* User Search & Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search user name or email..."
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value)
                    setUserPage(1)
                  }}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={userRoleFilter}
                  onChange={(e) => {
                    setUserRoleFilter(e.target.value)
                    setUserPage(1)
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
                >
                  <option value="all">All Roles</option>
                  <option value="ADMIN">Admin Only</option>
                  <option value="USER">User Only</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Active Alerts</th>
                      <th className="py-3 px-3">Tracked Phones</th>
                      <th className="py-3 px-3">Joined Date</th>
                      <th className="py-3 px-4 text-right">Moderation Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usersList.length > 0 ? (
                      usersList.map((u) => {
                        const isSelf = user?.id === u.id
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0">
                                  {u.name?.slice(0, 2).toUpperCase() || "U"}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900 truncate">{u.name}</p>
                                  <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                  u.role === "ADMIN"
                                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {u.role}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  u.isBanned
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {u.isBanned ? "Suspended" : "Active"}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-semibold text-slate-700">{u.alertsCount} alerts</td>
                            <td className="py-3 px-3 text-slate-500">{u.watchlistCount} in watchlist</td>
                            <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                              {new Date(u.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {!isSelf && (
                                  <>
                                    <button
                                      onClick={() => handleUpdateRole(u.id, u.role)}
                                      className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                                      title={u.role === "ADMIN" ? "Demote to User" : "Promote to Admin"}
                                    >
                                      {u.role === "ADMIN" ? "Make User" : "Make Admin"}
                                    </button>
                                    <button
                                      onClick={() => handleToggleBan(u.id, u.isBanned)}
                                      className={`p-1.5 rounded-lg cursor-pointer ${
                                        u.isBanned ? "text-emerald-600 hover:bg-emerald-50" : "text-amber-600 hover:bg-amber-50"
                                      }`}
                                      title={u.isBanned ? "Reactivate user" : "Suspend user"}
                                    >
                                      {u.isBanned ? <UserCheck size={14} /> : <UserX size={14} />}
                                    </button>
                                  </>
                                )}
                                {isSelf && (
                                  <span className="text-[11px] text-slate-400 font-medium">You (Current)</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          {loading ? "Loading users..." : "No users found."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <AdminPagination
                currentPage={userPage}
                totalItems={userTotal}
                limit={userLimit}
                onPageChange={(p) => setUserPage(p)}
                onLimitChange={(l) => {
                  setUserLimit(l)
                  setUserPage(1)
                }}
                itemLabel="users"
              />
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: NOTIFICATION QUEUE & JOBS
        ========================================================================== */}
        {activeTab === "queue" && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Filter Job Status:</span>
                <select
                  value={queueStatus}
                  onChange={(e) => setQueueStatus(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
                >
                  <option value="all">All Jobs</option>
                  <option value="PENDING">PENDING</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="SENT">SENT</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </div>

              <button
                onClick={loadQueue}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh Queue
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Event Type</th>
                      <th className="py-3 px-3">Device & Target</th>
                      <th className="py-3 px-3">Trigger Price</th>
                      <th className="py-3 px-3">Recipient Email</th>
                      <th className="py-3 px-3">Job Status</th>
                      <th className="py-3 px-3">Attempts</th>
                      <th className="py-3 px-3">Created</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {queueJobs.length > 0 ? (
                      queueJobs.map((j) => (
                        <tr key={j.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                j.jobType === "BACK_IN_STOCK"
                                  ? "bg-sky-50 text-sky-700 border border-sky-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}
                            >
                              {j.jobType}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800">
                            {j.product?.name || "—"}
                            {j.targetPrice && (
                              <span className="block text-[10px] text-slate-400 font-mono">Target: {fmt(j.targetPrice)}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-bold font-mono text-indigo-600">{fmt(j.triggerPrice)}</td>
                          <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">{j.user?.email || "—"}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                j.status === "SENT"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : j.status === "FAILED"
                                  ? "bg-rose-100 text-rose-800"
                                  : j.status === "PROCESSING"
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {j.status}
                            </span>
                            {j.error && <span className="block text-[10px] text-rose-600 mt-0.5 truncate max-w-xs">{j.error}</span>}
                          </td>
                          <td className="py-3 px-3 text-slate-500 font-mono">
                            {j.attempts} / {j.maxAttempts}
                          </td>
                          <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                            {new Date(j.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {j.status === "FAILED" && (
                              <button
                                onClick={() => handleRetryJob(j.id)}
                                className="px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 font-semibold text-[11px] cursor-pointer"
                              >
                                Retry
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          No notification jobs found in queue.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <AdminPagination
                currentPage={queuePage}
                totalItems={queueTotal}
                limit={queueLimit}
                onPageChange={(p) => setQueuePage(p)}
                onLimitChange={(l) => {
                  setQueueLimit(l)
                  setQueuePage(1)
                }}
                itemLabel="notification jobs"
              />
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          PRODUCT ADD / EDIT MODAL
      ========================================================================== */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Package size={20} className="text-amber-400" />
                <h3 className="font-bold text-base">{editingProduct ? "Edit Smartphone Listing" : "Add New Smartphone"}</h3>
              </div>
              <button onClick={() => setProductModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Phone Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apple iPhone 16 Pro (128 GB)"
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Brand <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apple, Samsung, OnePlus"
                    value={pBrand}
                    onChange={(e) => setPBrand(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
                  <input
                    type="text"
                    value={pCategory}
                    onChange={(e) => setPCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Official MRP (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 119900"
                    value={pMrp}
                    onChange={(e) => setPMrp(e.target.value ? Number(e.target.value) : "")}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Image URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      placeholder="https://..."
                      value={pImage}
                      onChange={(e) => setPImage(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                    />
                    {pImage && (
                      <img
                        src={resolveProductImage(pImage, pBrand)}
                        alt="Preview"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.onerror = null
                          e.currentTarget.src = resolveProductImage(null, pBrand)
                        }}
                        className="w-8 h-8 rounded-lg object-contain bg-slate-50 border border-slate-200 p-0.5 shrink-0"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">Key Tech Specs</span>
                <div className="grid grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">RAM</label>
                    <input
                      type="text"
                      placeholder="e.g. 8 GB"
                      value={pRam}
                      onChange={(e) => setPRam(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Storage</label>
                    <input
                      type="text"
                      placeholder="e.g. 256 GB"
                      value={pStorage}
                      onChange={(e) => setPStorage(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Battery</label>
                    <input
                      type="text"
                      placeholder="e.g. 5000 mAh"
                      value={pBattery}
                      onChange={(e) => setPBattery(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Processor</label>
                    <input
                      type="text"
                      placeholder="e.g. A18 Pro / Snapdragon 8"
                      value={pProcessor}
                      onChange={(e) => setPProcessor(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Store Pricing rows */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase">Store Retailer Prices</label>
                  <button
                    type="button"
                    onClick={() => setStoreRows([...storeRows, { storeName: "Croma", currentPrice: "", productUrl: "", stockStatus: "IN_STOCK" }])}
                    className="text-[11px] text-indigo-600 font-bold hover:text-indigo-800 cursor-pointer"
                  >
                    + Add Another Store
                  </button>
                </div>

                {storeRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-2 items-center p-2 rounded-xl bg-slate-50 border border-slate-200">
                    <input
                      type="text"
                      placeholder="Store (e.g. Amazon)"
                      value={row.storeName}
                      onChange={(e) => {
                        const copy = [...storeRows]
                        copy[idx].storeName = e.target.value
                        setStoreRows(copy)
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
                    />

                    <input
                      type="number"
                      placeholder="Current Price (₹)"
                      value={row.currentPrice}
                      onChange={(e) => {
                        const copy = [...storeRows]
                        copy[idx].currentPrice = e.target.value ? Number(e.target.value) : ""
                        setStoreRows(copy)
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold bg-white text-slate-800"
                    />

                    <select
                      value={row.stockStatus}
                      onChange={(e) => {
                        const copy = [...storeRows]
                        copy[idx].stockStatus = e.target.value
                        setStoreRows(copy)
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700"
                    >
                      <option value="IN_STOCK">In Stock</option>
                      <option value="OUT_OF_STOCK">Out of Stock</option>
                    </select>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="url"
                        placeholder="Product URL"
                        value={row.productUrl}
                        onChange={(e) => {
                          const copy = [...storeRows]
                          copy[idx].productUrl = e.target.value
                          setStoreRows(copy)
                        }}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] bg-white text-slate-700"
                      />
                      {storeRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setStoreRows(storeRows.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  <span>Save Smartphone</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

