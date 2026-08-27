import { Link } from "react-router"
import { Zap } from "lucide-react"

const cols = [
  {
    title: "Product",
    links: [
      { label: "Home", to: "/" },
      { label: "Discover", to: "/discover" },
      { label: "Compare", to: "/compare" },
      { label: "Price Intelligence", to: "/price-intelligence" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Profile", to: "/profile" },
      { label: "Wishlist", to: "/wishlist" },
      { label: "Price Alerts", to: "/alerts" },
      { label: "Settings", to: "/settings" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "#" },
      { label: "Blog", to: "#" },
      { label: "Careers", to: "#" },
      { label: "Press", to: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "#" },
      { label: "Terms of Service", to: "#" },
      { label: "Cookie Policy", to: "#" },
      { label: "Contact", to: "#" },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 mt-16">
      <div className="max-w-[1440px] mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center">
                <Zap size={14} className="text-white" />
              </div>
              <span className="text-base font-bold text-white">
                Price<span className="text-indigo-400">Wise</span>
              </span>
            </Link>
            <p className="text-xs leading-relaxed text-slate-500">
              Shop smarter with AI-powered price intelligence. Compare, track, and predict prices across all major stores.
            </p>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-sm hover:text-white transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-800 mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-600">© 2025 PriceWise. All rights reserved.</p>
          <p className="text-xs text-slate-600">
            Price data is for informational purposes only. Verify prices before purchase.
          </p>
        </div>
      </div>
    </footer>
  )
}
