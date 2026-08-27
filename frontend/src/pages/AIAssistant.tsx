import { useState, useRef, useEffect } from "react"
import { Send, Sparkles, Star, ExternalLink, TrendingDown, Bot } from "lucide-react"
import { products, aiChatHistory } from "../data/mockData"
import Badge from "../components/ui/Badge"

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN")

const quickPrompts = [
  "Best laptop under ₹70K",
  "Should I buy now?",
  "Find cheaper alternatives",
  "Compare these products",
  "Best value headphones",
]

type Message = {
  role: "user" | "assistant"
  content: string
  products?: typeof products
  insights?: { label: string; value: string }[]
}

const sampleResponses: Message[] = [
  {
    role: "assistant",
    content: "Looking at current pricing and trends, the Sony WH-1000XM5 is an excellent buy right now:",
    products: [products[0]],
    insights: [
      { label: "Current Price", value: "₹29,999 — 14% below MRP" },
      { label: "Price Trend", value: "Consistently declining over 3 months" },
      { label: "AI Verdict", value: "Good time to buy — near 6-month low" },
      { label: "Best Store", value: "Amazon at ₹29,999 with free shipping" },
    ],
  },
  {
    role: "assistant",
    content: "Based on your query about cheaper alternatives, here are options that offer better value:",
    products: [products[5]],
    insights: [
      { label: "Alternative", value: "Google Pixel 9 Pro — ₹89,999" },
      { label: "Why it's better", value: "18% below MRP, 7 years of OS updates" },
      { label: "Trade-off", value: "Smaller display vs iPhone 16" },
      { label: "Verdict", value: "Best long-term value under ₹90K" },
    ],
  },
]

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>(aiChatHistory)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const responseIdx = useRef(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = (text: string) => {
    if (!text.trim()) return
    setMessages((prev) => [...prev, { role: "user", content: text }])
    setInput("")
    setLoading(true)

    setTimeout(() => {
      const response = sampleResponses[responseIdx.current % sampleResponses.length]
      responseIdx.current++
      setMessages((prev) => [...prev, response])
      setLoading(false)
    }, 1200)
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14 flex flex-col">
      <div className="max-w-[900px] mx-auto w-full px-6 py-6 flex flex-col flex-1">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Sparkles size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">PriceWise AI</h1>
          <p className="text-sm text-slate-500">Your intelligent shopping assistant. Ask me anything.</p>
        </div>

        {/* Quick prompts */}
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          {quickPrompts.map((p) => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
              className="text-sm bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-full transition-all"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Chat */}
        <div className="flex-1 space-y-5 mb-4 min-h-0">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={14} className="text-white" />
                </div>
              )}
              <div className={`max-w-xl ${msg.role === "user" ? "order-first" : ""}`}>
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white ml-auto"
                    : "bg-white border border-slate-200"
                }`}>
                  <p className={`text-sm leading-relaxed ${msg.role === "user" ? "text-white" : "text-slate-800"}`}>
                    {msg.content}
                  </p>
                </div>

                {msg.role === "assistant" && msg.products && (
                  <div className="mt-2 space-y-2">
                    {msg.products.map((p) => (
                      <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-3 flex gap-3">
                        <img src={p.image} alt={p.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-indigo-600">{p.brand}</p>
                          <p className="text-sm font-medium text-slate-800 line-clamp-1">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-base font-bold text-slate-900">{fmt(p.bestPrice)}</span>
                            <span className="text-xs text-slate-400 line-through">{fmt(p.mrp)}</span>
                            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 rounded-full">
                              -{p.discount}%
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Star size={11} className="fill-amber-400 text-amber-400" />
                            <span className="text-xs text-slate-600">{p.rating} · {p.bestStore}</span>
                            <TrendingDown size={11} className="text-emerald-600 ml-1" />
                          </div>
                        </div>
                        <button className="self-start bg-indigo-600 text-white text-xs font-medium px-2 py-1 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1">
                          View <ExternalLink size={10} />
                        </button>
                      </div>
                    ))}

                    {msg.insights && (
                      <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-200 rounded-xl p-3">
                        <div className="grid grid-cols-2 gap-2">
                          {msg.insights.map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-xs text-indigo-600 font-medium">{label}</p>
                              <p className="text-xs text-slate-700">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-xl flex items-center justify-center shrink-0">
                <Bot size={14} className="text-white" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="bg-white border border-slate-200 rounded-2xl p-2 flex gap-2 shadow-sm sticky bottom-20 lg:bottom-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
            placeholder="Ask about products, prices, recommendations..."
            className="flex-1 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 outline-none"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white p-2.5 rounded-xl transition-colors"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
