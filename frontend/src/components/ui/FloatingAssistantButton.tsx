import { Link, useLocation } from "react-router"
import { Bot, Sparkles } from "lucide-react"

export default function FloatingAssistantButton() {
  const location = useLocation()

  // Hide the floating button on the assistant page itself
  if (
    location.pathname === "/ai" ||
    location.pathname === "/assistant" ||
    location.pathname === "/shopping-assistant"
  ) {
    return null
  }

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-5 z-40">
      <Link
        to="/ai"
        className="group flex items-center gap-2.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 text-white pl-3.5 pr-4 py-2.5 rounded-full shadow-lg hover:shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 backdrop-blur-xs cursor-pointer select-none"
        aria-label="Open Shopping Assistant"
      >
        <div className="relative flex items-center justify-center w-7 h-7 rounded-full bg-white/20 text-white">
          <Bot size={17} className="group-hover:rotate-12 transition-transform duration-200" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-indigo-700 animate-pulse" />
        </div>
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold tracking-tight">Shopping Assistant</span>
            <span className="px-1.5 py-0.2 rounded-md bg-white/25 text-[9px] font-black tracking-wider uppercase">
              AI
            </span>
          </div>
          <span className="text-[10px] text-indigo-100 font-medium hidden sm:inline">
            Ask for price advice & deals
          </span>
        </div>
      </Link>
    </div>
  )
}
