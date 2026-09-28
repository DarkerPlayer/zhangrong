import React, { useEffect, useRef, useState } from "react";
import { CaretDown, Sparkle } from "@phosphor-icons/react";

const ACTIONS = [
  { kind: "squat", label: "优雅下蹲" },
  { kind: "sexyWalk", label: "性感走路" },
];

export default function LookActionMenu({ look, onSelect }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const actions = ACTIONS.filter(({ kind }) => Array.isArray(look.actions?.[kind]));

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
        title="林薇的动作"
        aria-label="林薇的动作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkle size={16} weight="fill" />
        <span className="look-action-label">动作</span>
        <CaretDown className="look-action-caret" size={12} />
      </button>
      {open && (
        <div className="look-action-menu" role="menu" aria-label="角色动作">
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
