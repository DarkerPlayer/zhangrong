import React from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { LOOK_FILTERS, LOOK_COUNT } from "./looks.mjs";

export default function WardrobeFilters({
  query,
  setQuery,
  category,
  setCategory,
  count,
  view = "active",
  setView,
  availableCount = LOOK_COUNT,
  removedCount = 0,
  total = LOOK_COUNT,
  compact = false,
  searchLabel = "搜索伙伴或穿搭",
  searchPlaceholder = "搜索名字、穿搭或风格",
  resultHint,
}) {
  return (
    <div className={`wardrobe-tools ${compact ? "is-compact" : ""}`}>
      <div className="wardrobe-search">
        <MagnifyingGlass size={15} aria-hidden="true" />
        <input
          type="search"
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            aria-label="清空衣橱搜索"
            onClick={() => setQuery("")}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="wardrobe-filter-row" role="group" aria-label="衣橱风格">
        {LOOK_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            aria-label={`筛选：${filter}`}
            aria-pressed={category === filter}
            onClick={() => setCategory(filter)}
          >
            {filter}
          </button>
        ))}
      </div>
      {setView && (
        <div
          className="wardrobe-view-toggle"
          role="group"
          aria-label="造型状态"
        >
          <button
            type="button"
            aria-pressed={view === "active"}
            onClick={() => setView("active")}
          >
            可用造型 <span>{availableCount}</span>
          </button>
          <button
            type="button"
            aria-pressed={view === "removed"}
            onClick={() => setView("removed")}
          >
            已移除 <span>{removedCount}</span>
          </button>
        </div>
      )}
      <div className="wardrobe-result-count" aria-live="polite">
        <span>
          {count} / {total} 套穿搭
        </span>
        <span>{resultHint ?? (view === "active" ? "新伙伴优先" : "可随时恢复")}</span>
      </div>
    </div>
  );
}

export function WardrobeEmpty({
  reset,
  title = "没有找到匹配的造型",
  actionLabel = "清除筛选",
}) {
  return (
    <div className="wardrobe-empty">
      <p>{title}</p>
      <button type="button" onClick={reset}>
        {actionLabel}
      </button>
    </div>
  );
}
