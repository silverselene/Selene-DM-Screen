// Typeable autocomplete: a text input with a portal-rendered dropdown of
// suggestions. Used in Party (Class is free-text + suggested) and Wizard's
// Tome (Class/School filters — restricted to known options + an empty
// "no filter" state).

import { useEffect, useRef, useState } from "react";

import { AnchoredDropdown } from "@/lib/AnchoredDropdown";

interface ComboboxProps {
  value: string;
  onChange: (v: string) => void;
  /** Suggestions to show in the dropdown. Filtered live by the input text. */
  options: readonly string[];
  placeholder?: string;
  /** When false, on blur the input snaps back to the last accepted value
   *  unless the typed text matches an option case-insensitively. Use for
   *  closed-set filters. Default: true. */
  allowCustom?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  allowCustom = true,
  ariaLabel,
  className,
}: ComboboxProps) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync internal text when the external value changes (form reset etc).
  useEffect(() => {
    setText(value);
  }, [value]);

  const q = text.trim().toLowerCase();
  const suggestions = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options.slice();

  const pick = (next: string) => {
    setText(next);
    onChange(next);
    setOpen(false);
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  return (
    <div ref={wrapperRef} className={className}>
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setOpen(true);
          if (allowCustom) onChange(v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay close so click-on-option fires `pick()` first.
          blurTimer.current = setTimeout(() => {
            setOpen(false);
            blurTimer.current = null;
            if (!allowCustom) {
              const match = options.find(
                (o) => o.toLowerCase() === text.trim().toLowerCase(),
              );
              if (match) {
                setText(match);
                onChange(match);
              } else if (text.trim() === "") {
                onChange("");
              } else {
                setText(value); // revert
              }
            }
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setText(value);
            setOpen(false);
            inputRef.current?.blur();
          } else if (e.key === "Enter" && suggestions[0]) {
            e.preventDefault();
            pick(suggestions[0]);
            inputRef.current?.blur();
          } else if (e.key === "ArrowDown") {
            setOpen(true);
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
      />
      <AnchoredDropdown
        anchor={wrapperRef.current}
        open={open && suggestions.length > 0}
      >
        {suggestions.map((o) => (
          <button
            key={o}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              pick(o);
            }}
            className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${
              o.toLowerCase() === value.toLowerCase()
                ? "bg-purple-900/40 text-purple-200"
                : "text-gray-200 hover:bg-purple-900/30"
            }`}
          >
            {o}
          </button>
        ))}
      </AnchoredDropdown>
    </div>
  );
}
