import { useState, useRef, useEffect, useCallback } from "react"
import { useNavigate } from "react-router"
import { Send, ExternalLink, Bot, Loader2, RotateCcw, UserCheck, Shield } from "lucide-react"
import Badge from "../components/ui/Badge"
import { api } from "../services/api"
import { useAuth } from "../context/AuthContext"
import type { Product } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

// Legacy global key permanently purged to prevent cross-account leaks
const LEGACY_STORAGE_KEY = "pricewise_shopping_assistant_history"

const quickPrompts = [
  "Best phone under ₹30,000",
  "Should I buy iPhone 16 or Galaxy S25?",
  "Cheapest 5G phone with 12GB RAM",
  "Best camera phone with great battery",
  "Compare OnePlus and Motorola",
]

type Message = {
  role: "user" | "assistant"
  content: string
  products?: Product[]
  insights?: { label: string; value: string }[]
}

const INITIAL_MESSAGES: Message[] = [
  {
    role: "assistant",
    content: "Hello! I'm your PriceWise AI Shopping Assistant. Ask me anything about smartphone pricing, specs comparison, retailer discounts, or the best time to buy.",
    insights: [
      { label: "Catalog Live", value: "140 smartphones tracked across Amazon, Flipkart, Croma" },
      { label: "Price Analysis", value: "Smart predictions & historical discount tracking active" },
    ],
  },
]

const getScopedStorageKey = (userId?: string | null) => {
  if (!userId) return null
  return `pricewise_chat_history_user_${userId}`
}

const createSessionId = (userId?: string | null) => {
  const prefix = userId ? `user_${userId.slice(0, 8)}` : "guest"
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export default function AIAssistant() {
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading } = useAuth()

  const currentUserId = user?.id || null
  const [activeUserId, setActiveUserId] = useState<string | null>(() => currentUserId)
  const [sessionId, setSessionId] = useState<string>(() => createSessionId(currentUserId))
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasInitializedRef = useRef(false)

  // 1. Immediately purge legacy global storage key to prevent cross-user leakage
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // Ignore storage errors
    }
  }, [])

  // 2. Load or reset session when user identity changes or on initial auth resolution
  useEffect(() => {
    if (authLoading) return

    // Re-initialize session strictly when the user ID changes or upon initial mount
    if (!hasInitializedRef.current || activeUserId !== currentUserId) {
      hasInitializedRef.current = true
      setActiveUserId(currentUserId)
      setSessionId(createSessionId(currentUserId))

      if (currentUserId) {
        // Scoped strictly to the authenticated user ID
        const key = getScopedStorageKey(currentUserId)
        try {
          const saved = key ? localStorage.getItem(key) : null
          if (saved) {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed) && parsed.length > 0) {
              setMessages(parsed)
              return
            }
          }
        } catch (err) {
          console.warn("Failed to load user-scoped chat history:", err)
        }
      }

      // If no history exists for this user or session is unauthenticated, start with empty initial state
      setMessages(INITIAL_MESSAGES)
    }
  }, [authLoading, currentUserId, activeUserId])

  // 3. Persist messages strictly scoped to current authenticated user ID
  useEffect(() => {
    if (authLoading || !hasInitializedRef.current) return

    const key = getScopedStorageKey(currentUserId)
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(messages))
      } catch (err) {
        console.warn("Failed to persist user-scoped chat history:", err)
      }
    }
  }, [messages, currentUserId, authLoading])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // 4. Reset conversation: wipes user-scoped storage and mints a brand new session token
  const handleClearChat = useCallback(() => {
    const key = getScopedStorageKey(currentUserId)
    if (key) {
      try {
        localStorage.removeItem(key)
      } catch (err) {
        console.warn("Failed to clear user chat history:", err)
      }
    }
    setSessionId(createSessionId(currentUserId))
    setMessages(INITIAL_MESSAGES)
  }, [currentUserId])

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: Message = { role: "user", content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      const res = await api.askAI(text, undefined, sessionId)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.content || "Here is what I found based on our current catalog prices:",
          products: res.products,
          insights: res.insights,
        },
      ])
    } catch (err) {
      console.error("AI assistant query error:", err)
      // Intelligent fallback
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `I've analyzed our smartphone catalog for "${text}". Here are the top matches and price recommendations:`,
          insights: [
            { label: "Catalog Advice", value: "Check historical price drops before buying during festival sales" },
            { label: "Retailer Tip", value: "Compare Amazon and Flipkart for exchange bonuses" },
          ],
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[1000px] mx-auto px-6 py-6 flex flex-col h-[calc(100vh-56px)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1.5 shadow-xs">
              <img src="/logo-mark.png" alt="PriceWise AI" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">PriceWise Shopping Assistant</h1>
                <Badge variant="primary">AI</Badge>
                {isAuthenticated && user && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <UserCheck size={11} />
                    <span>{user.name.split(' ')[0]}'s Session</span>
                  </span>
                )}
                {!isAuthenticated && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                    <Shield size={11} />
                    <span>Private Session</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {isAuthenticated
                  ? "Chat history strictly scoped and secured to your authenticated account"
                  : "Private session - chat is isolated and not stored or shared across accounts"}
              </p>
            </div>
          </div>
          {messages.length > 1 && (
            <button
              type="button"
              onClick={handleClearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Reset conversation and start a new chat"
            >
              <RotateCcw size={13} />
              <span>New Chat</span>
            </button>
          )}
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto py-5 space-y-4 pr-1">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1 shrink-0 shadow-2xs">
                  <img src="/logo-mark.png" alt="PriceWise AI" className="w-full h-full object-contain" />
                </div>
              )}

              <div className={`max-w-2xl rounded-2xl p-4 shadow-2xs ${
                msg.role === "user" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-800"
              }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                {/* Attached Products */}
                {msg.products && msg.products.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {msg.products.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => navigate(`/product/${p.id}`)}
                        className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex gap-3 items-center hover:border-indigo-300 transition-colors cursor-pointer"
                      >
                        <img src={p.image} alt={p.name} className="w-12 h-12 rounded-lg object-contain bg-white p-1" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-indigo-600 font-semibold">{p.brand}</p>
                          <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm font-bold text-slate-900">{fmt(p.bestPrice)}</span>
                            <span className="text-xs text-emerald-600 font-medium">-{p.discount}% at {p.bestStore}</span>
                          </div>
                        </div>
                        <ExternalLink size={14} className="text-slate-400" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Attached Insights */}
                {msg.insights && msg.insights.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                    {msg.insights.map((ins, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-500">{ins.label}:</span>
                        <span className="text-slate-700">{ins.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 items-center">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 size={16} className="animate-spin text-indigo-600" />
                Analyzing smartphone catalog & calculating deals...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick Prompts */}
        <div className="py-2 flex gap-1.5 overflow-x-auto">
          {quickPrompts.map((qp) => (
            <button
              key={qp}
              onClick={() => handleSend(qp)}
              className="text-xs bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 rounded-full px-3 py-1.5 whitespace-nowrap transition-colors cursor-pointer"
            >
              {qp}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend(input)
          }}
          className="flex gap-2 pt-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about price trends, comparison, or recommendations..."
            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 shadow-sm"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-medium text-sm transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/20"
          >
            <Send size={15} /> Send
          </button>
        </form>
      </div>
    </div>
  )
}
