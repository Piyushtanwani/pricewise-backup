import React, { useState, useEffect } from "react"
import { Bell, X, Mail, Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { api } from "../../services/api"
import type { Product } from "../../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

interface PriceAlertModalProps {
  isOpen: boolean
  onClose: () => void
  product: Product | null
  onAlertActivated?: (productId: string) => void
}

export default function PriceAlertModal({
  isOpen,
  onClose,
  product,
  onAlertActivated,
}: PriceAlertModalProps) {
  const [notifyEmail, setNotifyEmail] = useState(() => localStorage.getItem("pricewise_user_email") || "")
  const [notifyName, setNotifyName] = useState(() => localStorage.getItem("pricewise_user_name") || "")
  const [targetPrice, setTargetPrice] = useState<number>(0)
  const [selectedDiscount, setSelectedDiscount] = useState<number>(5)
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [notifySuccessMsg, setNotifySuccessMsg] = useState<string | null>(null)
  const [notifyErrorMsg, setNotifyErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (product) {
      const base = product.bestPrice || (product as any).price || 0
      setTargetPrice(Math.round(base * 0.95))
      setSelectedDiscount(5)
      setNotifySuccessMsg(null)
      setNotifyErrorMsg(null)
    }
  }, [product, isOpen])

  if (!isOpen || !product) return null

  const basePrice = product.bestPrice || (product as any).price || 0
  const storeName = product.bestStore || product.storePrices?.[0]?.store || "Amazon"

  const handleDiscountSelect = (pct: number) => {
    setSelectedDiscount(pct)
    if (pct > 0 && basePrice > 0) {
      setTargetPrice(Math.round(basePrice * (1 - pct / 100)))
    }
  }

  const handleSubmitPriceAlert = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!notifyEmail || !notifyEmail.includes("@")) {
      setNotifyErrorMsg("Please enter a valid email address.")
      return
    }
    if (!targetPrice || targetPrice <= 0) {
      setNotifyErrorMsg("Please enter a valid target price.")
      return
    }

    try {
      setNotifyLoading(true)
      setNotifyErrorMsg(null)
      setNotifySuccessMsg(null)

      localStorage.setItem("pricewise_user_email", notifyEmail)
      if (notifyName) localStorage.setItem("pricewise_user_name", notifyName)

      const res = await api.setPriceAlert({
        productId: product.id,
        targetPrice,
        email: notifyEmail,
        userName: notifyName || undefined,
      })

      onAlertActivated?.(product.id)
      setNotifySuccessMsg(res.message || `Price alert activated for ${product.name}! Confirmation email sent to ${notifyEmail}.`)
    } catch (err: any) {
      console.error("Failed to set price alert:", err)
      setNotifyErrorMsg(err?.response?.data?.message || err?.message || "Failed to set price alert. Please try again.")
    } finally {
      setNotifyLoading(false)
    }
  }

  const handleSendTestEmail = async () => {
    if (!notifyEmail || !notifyEmail.includes("@")) {
      setNotifyErrorMsg("Please enter a valid email address first.")
      return
    }

    try {
      setTestSending(true)
      setNotifyErrorMsg(null)
      setNotifySuccessMsg(null)

      await api.testPriceAlert({
        productId: product.id,
        email: notifyEmail,
        userName: notifyName || undefined,
      })

      setNotifySuccessMsg(`✓ Test notification sent to ${notifyEmail} for ${product.name} via Nodemailer! Check your inbox or spam.`)
    } catch (err: any) {
      console.error("Test email failed:", err)
      setNotifyErrorMsg(err?.response?.data?.message || err?.message || "Failed to send test email.")
    } finally {
      setTestSending(false)
    }
  }

  const resolvedImage = (() => {
    const img = product.image || (product as any).imageUrl
    if (img) {
      const spMatch = img.match(/(?:images\.smartprix\.com\/|rx-i)([A-Za-z0-9_-]+)(?:\.webp|-w)/)
      if (spMatch) {
        return `https://cdn1.smartprix.com/rx-i${spMatch[1]}-w280-h280/phone.webp`
      }
      return img
    }
    const b = (product.brand || "").toLowerCase()
    if (b.includes("apple")) return "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80"
    if (b.includes("samsung")) return "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80"
    if (b.includes("oneplus")) return "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80"
    return "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80"
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <Bell size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Track Price & Get Email Alert</h3>
              <p className="text-xs text-indigo-200">Nodemailer Service (pricewise.noreply@gmail.com)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Product Summary */}
          <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0">
              <img
                src={resolvedImage}
                alt={product.name}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const b = (product.brand || "").toLowerCase()
                  if (b.includes("apple")) e.currentTarget.src = "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80"
                  else if (b.includes("samsung")) e.currentTarget.src = "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600&auto=format&fit=crop&q=80"
                  else if (b.includes("oneplus")) e.currentTarget.src = "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80"
                  else e.currentTarget.src = "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80"
                }}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">{product.brand}</span>
              <h4 className="text-sm font-bold text-slate-900 truncate">{product.name}</h4>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-sm font-extrabold text-slate-900">{fmt(basePrice)}</span>
                <span className="text-xs text-slate-500">at {storeName}</span>
                {product.mrp && product.mrp > basePrice && (
                  <span className="text-xs text-slate-400 line-through">{fmt(product.mrp)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Target Price Configuration */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Target Price (₹)
              </label>
              <span className="text-xs font-semibold text-emerald-600">
                Target Save: {fmt(Math.max(0, basePrice - targetPrice))}
              </span>
            </div>

            {/* Quick percentage discount chips */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[5, 10, 15, 20].map((pct) => {
                const dropVal = Math.round(basePrice * (1 - pct / 100))
                const isSelected = selectedDiscount === pct && targetPrice === dropVal
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleDiscountSelect(pct)}
                    className={`py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/30"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    -{pct}% Drop
                  </button>
                )
              })}
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
              <input
                type="number"
                value={targetPrice || ""}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0
                  setTargetPrice(val)
                  setSelectedDiscount(0)
                }}
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm font-semibold text-slate-800"
                placeholder="e.g. 24999"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              We will send an email immediately when the price drops to or below <strong className="text-slate-700">{fmt(targetPrice)}</strong>.
            </p>
          </div>

          {/* Email Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Your Email Address <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="e.g. yourname@gmail.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm text-slate-800"
                required
              />
            </div>
          </div>

          {/* Optional Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Your Name <span className="text-slate-400 text-[10px] font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={notifyName}
              onChange={(e) => setNotifyName(e.target.value)}
              placeholder="e.g. Piyush"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm text-slate-800"
            />
          </div>

          {/* Status Messages */}
          {notifySuccessMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{notifySuccessMsg}</p>
            </div>
          )}

          {notifyErrorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{notifyErrorMsg}</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-2.5">
          <button
            type="button"
            onClick={handleSendTestEmail}
            disabled={testSending || notifyLoading}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Test sending an alert email right now via Nodemailer"
          >
            {testSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
            Send Test Email
          </button>
          <button
            type="button"
            onClick={handleSubmitPriceAlert}
            disabled={notifyLoading || testSending}
            className="w-full sm:flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-60"
          >
            {notifyLoading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Activating Alert & Sending Email...
              </>
            ) : (
              <>
                <Bell size={15} />
                Set Alert & Email Me
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
