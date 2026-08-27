import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { Zap, Eye, EyeOff, Sparkles, BarChart2, Bell, TrendingDown } from "lucide-react"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate("/")
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gradient-to-br from-indigo-950 via-slate-900 to-blue-950 p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: "radial-gradient(circle at center, rgba(148,163,184,0.08) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative">
          <Link to="/" className="flex items-center gap-2 mb-12">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-xl font-bold text-white">
              Price<span className="text-indigo-400">Wise</span>
            </span>
          </Link>
          <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
            Shop smarter.<br />Know the right price.
          </h2>
          <p className="text-slate-400 leading-relaxed">
            Compare prices across 50+ stores, track price history, get AI-powered buy/wait recommendations, and never overpay again.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: BarChart2, text: "Compare prices across all major stores in one view" },
              { icon: Bell, text: "Set price alerts and get notified instantly" },
              { icon: TrendingDown, text: "Track historical pricing and predict future trends" },
              { icon: Sparkles, text: "AI-powered shopping recommendations tailored to you" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-indigo-500/20 border border-indigo-500/30 rounded-lg flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-indigo-400" />
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-600">
          Trusted by 2.4M+ smart shoppers
        </p>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">
              Price<span className="text-indigo-600">Wise</span>
            </span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-sm text-slate-500 mb-6">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="text-sm text-slate-600">Remember me</span>
              </label>
              <button type="button" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
            >
              Sign in
            </button>

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-slate-200" />
              <span className="px-3 text-xs text-slate-400">or</span>
              <div className="flex-1 border-t border-slate-200" />
            </div>

            <button
              type="button"
              className="w-full bg-white hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-xl border border-slate-200 transition-colors text-sm flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            Don't have an account?{" "}
            <Link to="/signup" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
