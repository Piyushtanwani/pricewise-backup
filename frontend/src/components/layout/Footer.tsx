import { Link } from "react-router"

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
]

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 mt-16 border-t border-slate-800">
      <div className="max-w-[1440px] mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-start gap-10">
          {/* Brand Info */}
          <div className="max-w-md">
            <Link to="/" className="inline-block mb-3 hover:opacity-90 transition-opacity" aria-label="PriceWise Home">
              <img
                src="/logo-dark.png"
                alt="PriceWise"
                className="h-8 md:h-9 w-auto object-contain select-none"
              />
            </Link>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-400">
              Shop smarter with AI-powered price intelligence. Compare, track, and predict smartphone prices across all major stores.
            </p>
          </div>

          {/* Navigation Links (Product & Account) */}
          <div className="flex flex-row gap-16 sm:gap-24">
            {cols.map((col) => (
              <div key={col.title} className="min-w-[120px]">
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
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-slate-800 mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>© 2025 PriceWise. All rights reserved.</p>
          <p>
            Price data is for informational purposes only. Verify prices before purchase.
          </p>
        </div>
      </div>
    </footer>
  )
}
