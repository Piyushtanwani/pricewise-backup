import { createBrowserRouter, Outlet } from "react-router"
import Navbar from "../components/layout/Navbar"
import Home from "../pages/Home"
import Discover from "../pages/Discover"
import Search from "../pages/Search"
import ProductDetail from "../pages/ProductDetail"
import Compare from "../pages/Compare"
import PriceIntelligence from "../pages/PriceIntelligence"
import AIAssistant from "../pages/AIAssistant"
import ForYou from "../pages/ForYou"
import Wishlist from "../pages/Wishlist"
import Watchlist from "../pages/Watchlist"
import Alerts from "../pages/Alerts"
import Profile from "../pages/Profile"
import Settings from "../pages/Settings"
import Login from "../pages/Login"

import FloatingAssistantButton from "../components/ui/FloatingAssistantButton"
import Footer from "../components/layout/Footer"

function Root() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f4f6fb]">
      <Navbar />
      <main className="flex-1 pb-16 lg:pb-0">
        <Outlet />
      </main>
      <Footer />
      <FloatingAssistantButton />
    </div>
  )
}

function AuthLayout() {
  return <Outlet />
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Home },
      { path: "discover", Component: Discover },
      { path: "search", Component: Search },
      { path: "product/:id", Component: ProductDetail },
      { path: "compare", Component: Compare },
      { path: "price-intelligence", Component: PriceIntelligence },
      { path: "ai", Component: AIAssistant },
      { path: "assistant", Component: AIAssistant },
      { path: "shopping-assistant", Component: AIAssistant },
      { path: "for-you", Component: ForYou },
      { path: "wishlist", Component: Wishlist },
      { path: "watchlist", Component: Watchlist },
      { path: "alerts", Component: Alerts },
      { path: "profile", Component: Profile },
      { path: "settings", Component: Settings },
    ],
  },
  {
    Component: AuthLayout,
    children: [
      { path: "login", Component: Login },
      { path: "signup", Component: Login },
    ],
  },
])
