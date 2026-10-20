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
    const savedJson = localStorage.getItem(COMPARE_STORAGE_KEY)
    let ids: string[] = []
    if (savedJson) {
      const parsed = JSON.parse(savedJson)
      if (Array.isArray(parsed)) {
        ids = parsed.filter((id) => typeof id === "string" && id.trim().length > 0)
      }
    }
    const isEmpty = isCleared || ids.length === 0
    return { ids: isEmpty ? [] : ids, isCleared, isEmpty, trendingRemoved: false }
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
   *   - Appends product up to 4 items and navigates to compare
   * - If no product passed (Navbar / generic links):
   *   - If list has items: navigate to compare with existing IDs
   *   - If list is empty: navigate to /compare (empty state)
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
        const currentIds = currentState.isEmpty ? [] : currentState.ids
        const updated = currentIds.includes(prodId)
          ? currentIds
          : [...currentIds, prodId].slice(0, 4)

        try {
          localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(updated))
          localStorage.removeItem(COMPARE_CLEARED_KEY)
          localStorage.removeItem(TRENDING_REMOVED_KEY)
          localStorage.removeItem(TRENDING_ID_KEY)
        } catch {}
        notifyCompareChange()
        navigate(`/compare?ids=${updated.join(",")}`)
        return
      }

      // 2. Generic / Navigation Compare trigger (Navbar, Mobile Nav, etc.)
      if (!currentState.isEmpty && currentState.ids.length > 0) {
        navigate(`/compare?ids=${currentState.ids.join(",")}`)
      } else {
        navigate("/compare")
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
