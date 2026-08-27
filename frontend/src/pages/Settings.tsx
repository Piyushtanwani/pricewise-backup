import { useState } from "react"
import { Settings as SettingsIcon, Bell, Shield, User, Database } from "lucide-react"

const tabs = [
  { id: "account", label: "Account", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Privacy", icon: Shield },
  { id: "data", label: "Data", icon: Database },
]

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-10 h-6 rounded-full transition-colors ${on ? "bg-indigo-600" : "bg-slate-200"}`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  )
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState("account")
  const [notifications, setNotifications] = useState({
    priceDropEmail: true,
    priceDropInApp: true,
    priceDropPush: false,
    targetEmail: true,
    targetInApp: true,
    recommendationsInApp: true,
    weeklyDigest: false,
  })

  const toggle = (key: keyof typeof notifications) =>
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[900px] mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon size={22} className="text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        </div>

        <div className="flex gap-6">
          {/* Sidebar tabs */}
          <div className="w-44 shrink-0">
            <nav className="space-y-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === id
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 min-w-0">
            {activeTab === "account" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                <h2 className="text-base font-bold text-slate-900">Account Information</h2>
                {[
                  { label: "Full Name", value: "Arjun Sharma" },
                  { label: "Email", value: "arjun@example.com" },
                  { label: "Phone", value: "+91 98765 43210" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
                    <input
                      defaultValue={value}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all"
                    />
                  </div>
                ))}
                <div className="flex gap-3 pt-2">
                  <button className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
                    Save Changes
                  </button>
                  <button className="text-red-500 hover:text-red-700 px-5 py-2 rounded-xl text-sm font-medium border border-red-200 hover:bg-red-50 transition-colors">
                    Delete Account
                  </button>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
                <h2 className="text-base font-bold text-slate-900">Notification Preferences</h2>
                <p className="text-xs text-slate-500">Choose how and when you want to be notified. We respect your inbox.</p>

                {[
                  {
                    title: "Price Drop Alerts",
                    desc: "Get notified when tracked products drop in price",
                    keys: [
                      { label: "Email", key: "priceDropEmail" },
                      { label: "In-app", key: "priceDropInApp" },
                      { label: "Push", key: "priceDropPush" },
                    ],
                  },
                  {
                    title: "Target Price Alerts",
                    desc: "Get notified when a product reaches your target",
                    keys: [
                      { label: "Email", key: "targetEmail" },
                      { label: "In-app", key: "targetInApp" },
                    ],
                  },
                  {
                    title: "Recommendations",
                    desc: "Personalized product and deal suggestions",
                    keys: [
                      { label: "In-app", key: "recommendationsInApp" },
                      { label: "Weekly digest", key: "weeklyDigest" },
                    ],
                  },
                ].map(({ title, desc, keys }) => (
                  <div key={title} className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
                    <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
                    <p className="text-xs text-slate-500 mb-3">{desc}</p>
                    <div className="space-y-2">
                      {keys.map(({ label, key }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">{label}</span>
                          <Toggle
                            on={notifications[key as keyof typeof notifications]}
                            onChange={() => toggle(key as keyof typeof notifications)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(activeTab === "privacy" || activeTab === "data") && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">
                  {activeTab === "privacy" ? "Privacy Settings" : "Data Preferences"}
                </h2>
                <div className="space-y-4">
                  {(activeTab === "privacy"
                    ? [
                        "Allow personalized recommendations based on browsing history",
                        "Share anonymized data to improve price predictions",
                        "Show profile to other users",
                      ]
                    : [
                        "Store search history for better recommendations",
                        "Export my data",
                        "Delete all my data",
                      ]
                  ).map((item) => (
                    <div key={item} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <span className="text-sm text-slate-700">{item}</span>
                      <Toggle on={true} onChange={() => {}} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
