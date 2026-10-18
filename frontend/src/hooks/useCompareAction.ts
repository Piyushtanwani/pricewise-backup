import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router"
import type { Product } from "../types/product"

export const COMPARE_STORAGE_KEY = "pricewise_compare_ids"
export const COMPARE_CLEARED_KEY = "pricewise_compare_cleared"
export const TRENDING_REMOVED_KEY = "pricewise_trending_removed"
export const TRENDING_ID_KEY = "pricewise_trending_id"
export const COMPARE_EVENT = "pricewise_compare_change"

export interface CompareState {
  ids: string[]
  isCleared: boolean
  isEmpty: boolean
  trendingRemoved: boolean
}

/**
 * Reads and returns the standardized comparison state from localStorage
 */
export function getCompareState(): CompareState {
  if (typeof window === "undefined") {
    return { ids: [], isCleared: false, isEmpty: true, trendingRemoved: false }
  }
  try {
    const isCleared = localStorage.getItem(COMPARE_CLEARED_KEY) === "true"
    const trendingRemoved = localStorage.getItem(TRENDING_REMOVED_KEY) === "true"
    const savedJson = localStorage.getItem(COMPARE_STORAGE_KEY)
    let ids: string[] = []
    if (savedJson) {
      const parsed = JSON.parse(savedJson)
      if (Array.isArray(parsed)) {
        ids = parsed.filter((id) => typeof id === "string" && id.trim().length > 0)
      }
    }
    const isEmpty = isCleared || ids.length === 0
    return { ids: isEmpty ? [] : ids, isCleared, isEmpty, trendingRemoved }
  } catch {
    return { ids: [], isCleared: false, isEmpty: true, trendingRemoved: false }
  }
}

/**
 * Broadcasts an event to synchronize compare state across components and tabs
 */
export function notifyCompareChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(COMPARE_EVENT))
  }
}

/**
 * Shared custom hook unifying compare logic across the entire application
 */
export function useCompareAction() {
  const navigate = useNavigate()
  const [compareState, setCompareState] = useState<CompareState>(getCompareState)

  useEffect(() => {
    const update = () => setCompareState(getCompareState())
    window.addEventListener(COMPARE_EVENT, update)
    window.addEventListener("storage", update)
    return () => {
      window.removeEventListener(COMPARE_EVENT, update)
      window.removeEventListener("storage", update)
    }
  }, [])

  /**
   * Unified click handler for all Compare buttons:
   * - If product passed:
   *   - If list is empty: clear flags and navigate with fromEmpty=true to trigger baseline trending pairing
   *   - If list has items: append product up to 4 items and navigate to compare
   * - If no product passed (Navbar / generic links):
   *   - If list has items: navigate to compare with existing IDs
   *   - If list is empty: navigate to /compare to initialize baseline trending phone
   */
  const handleCompare = useCallback(
    (product?: Product | { id: string } | null, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation()
      }

      const currentState = getCompareState()

      // 1. Product-specific Compare trigger (cards, product detail, recommendations)
      if (product && product.id) {
        const prodId = product.id

        if (currentState.isEmpty) {
          // Empty baseline: Clear reset flags and navigate with fromEmpty=true
          // The compare module will pair the clicked phone with the smart default Trending flagship
          try {
            localStorage.removeItem(COMPARE_CLEARED_KEY)
            localStorage.removeItem(TRENDING_REMOVED_KEY)
          } catch {}
          notifyCompareChange()
          navigate(`/compare?ids=${prodId}&fromEmpty=true`)
        } else {
          // Already has items: append without random suggestions or extra trending phones
          const updated = Array.from(new Set([...currentState.ids, prodId])).slice(0, 4)
          try {
            localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(updated))
            localStorage.removeItem(COMPARE_CLEARED_KEY)
          } catch {}
          notifyCompareChange()
          navigate(`/compare?ids=${updated.join(",")}`)
        }
        return
      }

      // 2. Generic / Navigation Compare trigger (Navbar, Mobile Nav, etc.)
      if (!currentState.isEmpty && currentState.ids.length > 0) {
        navigate(`/compare?ids=${currentState.ids.join(",")}`)
      } else {
        // When empty, navigating to /compare initializes the baseline default Trending phone with its badge
        try {
          localStorage.removeItem(COMPARE_CLEARED_KEY)
          localStorage.removeItem(TRENDING_REMOVED_KEY)
        } catch {}
        notifyCompareChange()
        navigate("/compare?trending=true")
      }
    },
    [navigate]
  )

  const isInCompare = useCallback(
    (productId?: string) => {
      if (!productId) return false
      return compareState.ids.includes(productId)
    },
    [compareState.ids]
  )

  return {
    handleCompare,
    isInCompare,
    compareIds: compareState.ids,
    compareCount: compareState.ids.length,
    isEmpty: compareState.isEmpty,
    compareState,
  }
}
