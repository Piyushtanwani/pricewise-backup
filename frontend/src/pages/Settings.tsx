import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router"
import { Settings as SettingsIcon, Bell, Shield, User, Database, Loader2, CheckCircle2, AlertCircle, Trash2 } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { api } from "../services/api"
import type { NotificationPrefs } from "../types/user"

const tabs = [
  { id: "account", label: "Account", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "data", label: "Data & Privacy", icon: Database },
]

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
        on ? "bg-indigo-600" : "bg-slate-200"
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
          on ? "translate-x-4" : ""
        }`}
      />
    </button>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading, logout, refreshUser } = useAuth()

  const [activeTab, setActiveTab] = useState("account")

  // Account Form State
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountMsg, setAccountMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Notification Preferences State
  const [notifications, setNotifications] = useState<NotificationPrefs>({
    priceDropEmail: true,
    priceDropInApp: true,
    priceDropPush: false,
    targetEmail: true,
    targetInApp: true,
    recommendationsInApp: true,
    weeklyDigest: false,
  })
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null)

  // Account Deletion Confirmation
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name || "")
      setPhone(user.phone || "")
    }
  }, [user])

  useEffect(() => {
    let isMounted = true
    if (isAuthenticated) {
      api.getNotificationSettings()
        .then((prefs) => {
          if (isMounted && prefs) setNotifications(prefs)
        })
        .catch(console.error)
    }
    return () => { isMounted = false }
  }, [isAuthenticated])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setAccountMsg(null)

    if (!name.trim()) {
      setAccountMsg({ type: "error", text: "Name cannot be empty." })
      return
    }

    try {
      setSavingAccount(true)
      await api.updateProfile({
        name: name.trim(),
        phone: phone.trim() ? phone.trim() : null,
      })
      await refreshUser()
      setAccountMsg({ type: "success", text: "Profile updated successfully." })
    } catch (err: any) {
      setAccountMsg({
        type: "error",
        text: err.response?.data?.message || err.message || "Failed to update profile.",
      })
    } finally {
      setSavingAccount(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordMsg(null)

    if (newPassword.length < 8) {
      setPasswordMsg({ type: "error", text: "New password must be at least 8 characters long." })
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Passwords do not match." })
      return
    }

    try {
      setSavingPassword(true)
      await api.changePassword({ currentPassword, newPassword })
      setPasswordMsg({ type: "success", text: "Password changed successfully." })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: any) {
      setPasswordMsg({
        type: "error",
        text: err.response?.data?.message || err.message || "Failed to change password.",
      })
    } finally {
      setSavingPassword(false)
    }
  }

  const togglePref = async (key: keyof NotificationPrefs) => {
    const updated = { ...notifications, [key]: !notifications[key] }
    setNotifications(updated)

    try {
      setSavingPrefs(true)
      await api.updateNotificationSettings(updated)
      setPrefsMsg("Preferences saved")
      setTimeout(() => setPrefsMsg(null), 2500)
    } catch (err) {
      console.error("Failed to update notification preferences:", err)
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleDeleteAccount = async () => {
    try {
      setDeleting(true)
      await api.deleteAccount()
      logout()
      navigate("/")
    } catch (err: any) {
      alert("Failed to delete account: " + (err.response?.data?.message || err.message))
      setDeleting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-24 text-center">
        <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading settings...</p>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] pt-20 text-center">
        <div className="max-w-[450px] mx-auto p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <SettingsIcon size={32} className="text-indigo-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Account Settings</h2>
          <p className="text-sm text-slate-500 mb-6">Please sign in to manage your account and preferences.</p>
          <Link
            to="/login"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold inline-block"
          >
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] pt-14">
      <div className="max-w-[900px] mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon size={22} className="text-indigo-600" />
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar tabs */}
          <div className="w-full md:w-48 shrink-0">
            <nav className="space-y-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                    activeTab === id
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 min-w-0">
            {/* Account Tab */}
            {activeTab === "account" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-2xs">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Account Information</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Manage your personal information and contact details.</p>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={user.email}
                      disabled
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 cursor-not-allowed"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Email address cannot be changed.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone Number (Optional)</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>

                  {accountMsg && (
                    <div
                      className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                        accountMsg.type === "success"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {accountMsg.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                      {accountMsg.text}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      type="submit"
                      disabled={savingAccount}
                      className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                      {savingAccount && <Loader2 size={15} className="animate-spin" />}
                      Save Changes
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(true)}
                      className="text-rose-600 hover:text-rose-700 text-xs font-medium hover:underline cursor-pointer"
                    >
                      Delete Account
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === "notifications" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Notification Preferences</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Choose how you receive alerts and price drop updates.
                    </p>
                  </div>
                  {prefsMsg && (
                    <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={13} /> {prefsMsg}
                    </span>
                  )}
                </div>

                {[
                  {
                    title: "Price Drop Alerts",
                    desc: "Get notified when tracked smartphones drop in price",
                    keys: [
                      { label: "Email notifications", key: "priceDropEmail" as const },
                      { label: "In-app notifications", key: "priceDropInApp" as const },
                    ],
                  },
                  {
                    title: "Target Price Alerts",
                    desc: "Get notified the moment a product reaches your target price",
                    keys: [
                      { label: "Email notifications", key: "targetEmail" as const },
                      { label: "In-app notifications", key: "targetInApp" as const },
                    ],
                  },
                  {
                    title: "Recommendations & Updates",
                    desc: "Occasional suggestions for price drops in your budget",
                    keys: [
                      { label: "In-app deal highlights", key: "recommendationsInApp" as const },
                      { label: "Weekly price digest", key: "weeklyDigest" as const },
                    ],
                  },
                ].map(({ title, desc, keys }) => (
                  <div key={title} className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
                    <h3 className="text-sm font-semibold text-slate-800 mb-0.5">{title}</h3>
                    <p className="text-xs text-slate-400 mb-3">{desc}</p>
                    <div className="space-y-2.5">
                      {keys.map(({ label, key }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-slate-700">{label}</span>
                          <Toggle
                            on={Boolean(notifications[key])}
                            onChange={() => togglePref(key)}
                            disabled={savingPrefs}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Security Tab */}
            {activeTab === "security" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 shadow-2xs">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Change Password</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Ensure your account is using a long, random password.</p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder="At least 8 characters"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>

                  {passwordMsg && (
                    <div
                      className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                        passwordMsg.type === "success"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {passwordMsg.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                      {passwordMsg.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingPassword && <Loader2 size={15} className="animate-spin" />}
                    Update Password
                  </button>
                </form>
              </div>
            )}

            {/* Data & Privacy Tab */}
            {activeTab === "data" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-2xs">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Data & Privacy Policy</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Control how your browsing data is stored.</p>
                </div>

                <div className="divide-y divide-slate-100">
                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">Store price alert history</p>
                      <p className="text-xs text-slate-400">Keep history of reached price targets</p>
                    </div>
                    <Toggle on={true} onChange={() => {}} />
                  </div>
                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">Deterministic recommendations</p>
                      <p className="text-xs text-slate-400">Suggest products based on saved brands</p>
                    </div>
                    <Toggle on={true} onChange={() => {}} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Account</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              Are you sure you want to delete your account? All your tracked products, wishlist items, and price alerts will be permanently removed. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors flex items-center gap-2"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
