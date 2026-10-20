import React from "react"
import { GitCompare } from "lucide-react"
import { useCompareAction } from "../../hooks/useCompareAction"
import type { Product } from "../../types/product"

export interface CompareButtonProps {
  product?: Product | { id: string }
  className?: string
  variant?: "card" | "detail" | "nav" | "primary" | "custom"
  label?: string
  icon?: boolean
  iconSize?: number
  active?: boolean
  onClick?: (e: React.MouseEvent) => void
  children?: React.ReactNode
  title?: string
}

export default function CompareButton({
  product,
  className = "",
  variant = "card",
  label = "Compare",
  icon = true,
  iconSize,
  active,
  onClick,
  children,
  title = "Compare specifications and prices",
}: CompareButtonProps) {
  const { handleCompare, isInCompare } = useCompareAction()
  const isSelected = active !== undefined ? active : (product?.id ? isInCompare(product.id) : false)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onClick) {
      onClick(e)
    } else {
      handleCompare(product, e)
    }
  }

  // Preset styles by variant
  if (variant === "card") {
    const size = iconSize ?? 11
    return (
      <button
        type="button"
        title={title}
        onClick={handleClick}
        className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
          isSelected
            ? "bg-indigo-600 text-white shadow-sm"
            : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
        } ${className}`}
      >
        {children ?? (
          <>
            {icon && <GitCompare size={size} />}
            <span>{label}</span>
          </>
        )}
      </button>
    )
  }

  if (variant === "detail") {
    const size = iconSize ?? 13
    return (
      <button
        type="button"
        title={title}
        onClick={handleClick}
        className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
          isSelected
            ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold"
            : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
        } ${className}`}
      >
        {children ?? (
          <>
            {icon && <GitCompare size={size} className={isSelected ? "text-indigo-600" : ""} />}
            <span>{label}</span>
          </>
        )}
      </button>
    )
  }

  if (variant === "primary") {
    const size = iconSize ?? 14
    return (
      <button
        type="button"
        title={title}
        onClick={handleClick}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-colors cursor-pointer ${className}`}
      >
        {children ?? (
          <>
            {icon && <GitCompare size={size} />}
            <span>{label}</span>
          </>
        )}
      </button>
    )
  }

  // Custom or nav variant
  const size = iconSize ?? 14
  return (
    <button
      type="button"
      title={title}
      onClick={handleClick}
      className={`cursor-pointer ${className}`}
    >
      {children ?? (
        <>
          {icon && <GitCompare size={size} />}
          <span>{label}</span>
        </>
      )}
    </button>
  )
}
