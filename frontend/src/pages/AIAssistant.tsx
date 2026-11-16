import { useState, useRef, useEffect, useCallback } from "react"
import { useNavigate, Link } from "react-router"
import ReactMarkdown from "react-markdown"
import {
  Send,
  ExternalLink,
  Bot,
  Loader2,
  RotateCcw,
  UserCheck,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Tag,
  CheckCircle2,
  LogIn,
} from "lucide-react"
import Badge from "../components/ui/Badge"
import { api } from "../services/api"
import { useAuth } from "../context/AuthContext"
import type { Product } from "../types/product"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const LEGACY_STORAGE_KEY = "pricewise_shopping_assistant_history"

const quickPrompts = [
  "Best phone under ₹30,000",
  "Should I buy iPhone 15 or Galaxy S25?",
  "Cheapest 5G phone with 12GB RAM",
  "Best camera phone with great battery",
  "Compare OnePlus and Motorola",
  "AMOLED vs OLED displays explained",
  "Snapdragon vs MediaTek Dimensity",
]

type Message = {
  role: "user" | "assistant"
  content: string
  products?: Product[]
  insights?: { label: string; value: string }[]
  suggestedFollowUps?: string[]
  isError?: boolean
}

const INITIAL_MESSAGES: Message[] = [
  {
    role: "assistant",
    content: `### Welcome to PriceWise Shopping Intelligence! 🚀

I am your context-aware **AI Shopping Intelligence Agent**, powered by real-time PriceWise catalogue data and price intelligence.

Here is what I can do for you:
- **Compare Specs & Prices**: Multi-product side-by-side spec comparison and trade-off analysis.
- **Price Trend & Forecasts**: Real historical price curves with hybrid AI price prediction.
- **Budget Recommendations**: Filter top-value phones, laptops, and gadgets within your exact budget.
- **General Technical Q&A**: Objective advice on processors, RAM, camera sensors, and displays.

*What are you looking to buy or compare today?*`,
    insights: [
      { label: "Price Intelligence", value: "Real-time multi-store price monitoring active" },
      { label: "Forecast Models", value: "Hybrid Prophet & XGBoost price trend analysis ready" },
      { label: "Anti-Hallucination", value: "Strict verification against genuine store listings" },
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
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const hasInitializedRef = useRef(false)
  const isInitialLoadRef = useRef(true)

  // 0. Ensure window starts at the top when navigating to Shopping Assistant
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [])

  // 1. Purge legacy global storage key to prevent cross-account leaks
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // Ignore storage errors
    }
  }, [])

  // 2. Load or reset session when user identity changes
  useEffect(() => {
    if (authLoading) return

    if (!hasInitializedRef.current || activeUserId !== currentUserId) {
      hasInitializedRef.current = true
      setActiveUserId(currentUserId)
      setSessionId(createSessionId(currentUserId))

      if (currentUserId) {
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

      setMessages(INITIAL_MESSAGES)
    }
  }, [authLoading, currentUserId, activeUserId])

  // 3. Persist messages strictly scoped to current user
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

  // 4. Smoothly scroll ONLY the internal chat container (never the browser window/footer)
  useEffect(() => {
    if (isInitialLoadRef.current) {
      // Don't auto-scroll on initial page view so the top header is in view
      isInitialLoadRef.current = false
      return
    }

    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      })
    }
  }, [messages, loading])

  // 4. Reset conversation: wipes user-scoped storage and mints a brand new session
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
    setLastFailedQuery(null)
  }, [currentUserId])

  const handleSend = async (text: string) => {
    if (!isAuthenticated) {
      navigate("/login")
      return
    }

    if (!text.trim() || loading) return

    const userMsg: Message = { role: "user", content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)
    setLastFailedQuery(null)

    try {
      const res = await api.askAI(text, undefined, sessionId)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.content || "Here is what I found from the PriceWise catalogue:",
          products: res.products,
          insights: res.insights,
          suggestedFollowUps: res.suggestedFollowUps,
        },
      ])
    } catch (err: any) {
      console.error("AI assistant query error:", err)
      setLastFailedQuery(text)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `**Request Failed**: Unable to reach the PriceWise AI Intelligence service right now (${err.message || 'Network error'}). Please try again.`,
          isError: true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = () => {
    if (lastFailedQuery) {
      handleSend(lastFailedQuery)
    }
  }

  // 5. Auth Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  // 6. Sign-in Barrier: AI Assistant strictly requires authentication
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-20">
        <div className="max-w-[480px] mx-auto px-6 py-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm mt-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md shadow-indigo-600/20">
            <Sparkles size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Sign in to Use PriceWise AI</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Please sign in to access personalized smartphone recommendations, live retailer price comparisons, hybrid AI price drop forecasts, and saved conversational memory.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              to="/login"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2 shadow-sm shadow-indigo-600/20 cursor-pointer"
            >
              <LogIn size={16} />
              Sign In
            </Link>
            <Link
              to="/signup"
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors cursor-pointer"
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
      <div className="max-w-[1020px] mx-auto px-4 sm:px-6 py-6 flex flex-col h-[calc(100vh-56px)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">PriceWise AI Agent</h1>
                <Badge variant="primary">AI</Badge>
                {user && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <UserCheck size={11} />
                    <span>{user.name.split(" ")[0]}'s Memory</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Contextual memory active. Multi-turn reasoning and catalogue tool calling enabled.
              </p>
            </div>
          </div>
          {messages.length > 1 && (
            <button
              type="button"
              onClick={handleClearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Reset conversation and clear session history"
            >
              <RotateCcw size={13} />
              <span>New Chat</span>
            </button>
          )}
        </div>

        {/* Message Thread */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto py-5 space-y-5 pr-1">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${msg.isError ? "bg-rose-100 text-rose-600" : "bg-gradient-to-tr from-indigo-600 to-violet-600 text-white"
                  }`}>
                  {msg.isError ? <AlertCircle size={16} /> : <Bot size={16} />}
                </div>
              )}

              <div className={`max-w-3xl rounded-2xl p-4 sm:p-5 shadow-xs ${msg.role === "user"
                ? "bg-indigo-600 text-white"
                : msg.isError
                  ? "bg-rose-50 border border-rose-200 text-rose-900"
                  : "bg-white border border-slate-200 text-slate-800"
                }`}>
                {/* Message Body with Markdown */}
                <div className="text-sm leading-relaxed prose prose-slate max-w-none prose-p:my-2 prose-headings:my-2 prose-ul:my-2 prose-li:my-0.5">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2.5 last:mb-0 text-sm leading-relaxed">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                      h3: ({ children }) => <h3 className="text-base font-bold text-slate-900 mt-3 mb-1.5">{children}</h3>,
                      h4: ({ children }) => <h4 className="text-sm font-bold text-slate-900 mt-2 mb-1">{children}</h4>,
                      ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-slate-700">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-slate-700">{children}</ol>,
                      li: ({ children }) => <li className="text-sm text-slate-700 leading-normal">{children}</li>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>

                {/* Error Retry Option */}
                {msg.isError && lastFailedQuery && (
                  <div className="mt-3 pt-3 border-t border-rose-200 flex items-center justify-between">
                    <span className="text-xs text-rose-700">Failed to get response from AI Assistant</span>
                    <button
                      onClick={handleRetry}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-xs"
                    >
                      <RefreshCw size={12} />
                      Retry Query
                    </button>
                  </div>
                )}

                {/* Attached Rich Product Cards */}
                {msg.products && msg.products.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Tag size={13} className="text-indigo-600" />
                      Verified Catalogue Matches ({msg.products.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {msg.products.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => navigate(`/product/${p.id}`)}
                          className="bg-slate-50/80 hover:bg-white border border-slate-200 hover:border-indigo-400 rounded-xl p-3 flex gap-3 items-center transition-all cursor-pointer shadow-2xs hover:shadow-xs group"
                        >
                          <img
                            src={p.image}
                            alt={p.name}
                            className="w-14 h-14 rounded-lg object-contain bg-white p-1.5 border border-slate-100 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80"
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                              {p.brand}
                            </span>
                            <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                              {p.name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm font-bold text-slate-900">{fmt(p.bestPrice)}</span>
                              {p.discount > 0 && (
                                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  -{p.discount}% at {p.bestStore}
                                </span>
                              )}
                            </div>
                            {p.aiVerdict && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                <span className="font-medium text-slate-700">Verdict:</span> {p.aiVerdict}
                              </p>
                            )}
                          </div>
                          <ExternalLink size={14} className="text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attached Insight Chips */}
                {msg.insights && msg.insights.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                    {msg.insights.map((ins, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1 text-xs"
                      >
                        <CheckCircle2 size={12} className="text-indigo-500" />
                        <span className="font-semibold text-slate-600">{ins.label}:</span>
                        <span className="text-slate-800 font-medium">{ins.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggested Follow-Ups (shown only on the latest assistant response) */}
                {i === messages.length - 1 && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Suggested Follow-Ups:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.suggestedFollowUps.map((prompt, pIdx) => (
                        <button
                          key={pIdx}
                          onClick={() => handleSend(prompt)}
                          className="text-xs bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg px-2.5 py-1 transition-colors cursor-pointer text-left font-medium"
                        >
                          → {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 items-center">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-xs">
                <Bot size={16} />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3 text-slate-600 text-sm shadow-xs">
                <Loader2 size={16} className="animate-spin text-indigo-600 shrink-0" />
                <span className="animate-pulse">
                  Analyzing catalogue & evaluating real-time prices...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Prompts Bar (shown only on initial start so there is never duplicate prompt clutter) */}
        {messages.length <= 1 && (
          <div className="py-2 flex gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
            {quickPrompts.map((qp) => (
              <button
                key={qp}
                onClick={() => handleSend(qp)}
                className="text-xs bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 rounded-full px-3 py-1.5 whitespace-nowrap transition-colors cursor-pointer shadow-2xs font-medium"
              >
                {qp}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend(input)
          }}
          className="flex gap-2 pt-1 shrink-0"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about prices, specs comparison, 'AMOLED vs OLED', or best phones under ₹30,000..."
            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-xs transition-all"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-medium text-sm transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-600/20 shrink-0"
          >
            <Send size={15} /> Send
          </button>
        </form>
      </div>
    </div>
  )
}
