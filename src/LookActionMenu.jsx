import React, { useEffect, useRef, useState } from "react";
import { CaretDown, Sparkle } from "@phosphor-icons/react";
import { AUTHORED_ACTIONS } from "../server/authored-actions.mjs";

import { CUTE_MESH_ACTIONS, CUTE_FRAME_ACTIONS } from "../server/cute-actions.mjs";

const ACTIONS = [
  ...CUTE_MESH_ACTIONS.map(({kind,label})=>({kind,label,requiresMotion:kind})),
  ...CUTE_FRAME_ACTIONS.map(({kind,label})=>({kind,label,requires:kind})),
  ...AUTHORED_ACTIONS.map(({kind, label}) => ({kind, label, requires: kind})),
  { kind: "spit", label: "吐口水", requires: "spit" },
  { kind: "walk_feminine", label: "轻盈走路", requires: "sexyWalk" },
  { kind: "walk_confident", label: "自信走路", requires: "sexyWalk" },
  { kind: "crouch_enter", label: "自然蹲下", requires: "squat" },
  { kind: "crouch_exit", label: "慢慢起身", requires: "squat" },
  { kind: "idle_weight_shift", label: "变换重心" },
  { kind: "idle_hair_touch", label: "整理头发" },
  { kind: "idle_neutral", label: "恢复待机" },
];

export default function LookActionMenu({ look, onSelect }) {
  const [open, setOpen] = useState(false);
  const [menuHeight, setMenuHeight] = useState(320);
  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const actions = ACTIONS.filter(({ requires, requiresMotion }) => requiresMotion ? look.cuteMotions?.includes(requiresMotion) : !requires || (Array.isArray(look.actions?.[requires]) && look.actions[requires].length));

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!actions.length) return null;

  return (
    <div className="look-action-control" ref={rootRef}>
      <button
        ref={toggleRef}
        className="look-action-toggle"
        type="button"
        title={`${look.character || "角色"}的动作`}
        aria-label={`${look.character || "角色"}的动作`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          const top = toggleRef.current?.getBoundingClientRect().top ?? 420;
          setMenuHeight(Math.max(80, Math.min(360, top - 108)));
          setOpen((value) => !value);
        }}
      >
        <Sparkle size={16} weight="fill" />
        <span className="look-action-label">动作</span>
        <CaretDown className="look-action-caret" size={12} />
      </button>
      {open && (
        <div className="look-action-menu" role="menu" aria-label="角色动作" style={{maxHeight:menuHeight}}>
          {actions.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(kind);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
