// Typeable autocomplete: a text input with a portal-rendered dropdown of
// suggestions. Used in Party (Class is free-text + suggested) and Wizard's
// Tome (Class/School filters — restricted to known options + an empty
// "no filter" state).
//
// Implements the ARIA combobox + listbox pattern: ArrowUp/Down move a visible
// highlight, Enter picks the highlighted option (or the first match), and
// `aria-activedescendant` points screen readers at the active option without
// moving DOM focus off the input.

import { useEffect, useId, useRef, useState } from "react";

import { AnchoredDropdown } from "@/lib/AnchoredDropdown";
import { isImeComposing } from "@/lib/keyboard";

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
  // Index of the highlighted suggestion, or -1 for "none highlighted" (Enter
  // then falls back to the first match, preserving the prior behavior).
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  // Re-sync internal text when the external value changes (form reset etc).
  useEffect(() => {
    setText(value);
  }, [value]);

  const q = text.trim().toLowerCase();
  const suggestions = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options.slice();

  const listOpen = open && suggestions.length > 0;

  // Keep the highlight in range as the filtered list shrinks/grows.
  useEffect(() => {
    setHighlight((h) => (h >= suggestions.length ? -1 : h));
  }, [suggestions.length]);

  const pick = (next: string) => {
    setText(next);
    onChange(next);
    setOpen(false);
    setHighlight(-1);
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
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listOpen ? listboxId : undefined}
        aria-activedescendant={
          listOpen && highlight >= 0 ? optionId(highlight) : undefined
        }
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setOpen(true);
          setHighlight(-1);
          if (allowCustom) onChange(v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay close so click-on-option fires `pick()` first.
          blurTimer.current = setTimeout(() => {
            setOpen(false);
            setHighlight(-1);
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
          if (isImeComposing(e)) return;
          if (e.key === "Escape") {
            setText(value);
            setOpen(false);
            setHighlight(-1);
            inputRef.current?.blur();
          } else if (e.key === "Enter") {
            const chosen =
              highlight >= 0 ? suggestions[highlight] : suggestions[0];
            if (chosen) {
              e.preventDefault();
              pick(chosen);
              inputRef.current?.blur();
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!listOpen) {
              setOpen(true);
              return;
            }
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            if (!listOpen) return;
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
      />
      <AnchoredDropdown anchor={wrapperRef.current} open={listOpen} role="listbox" id={listboxId}>
        {suggestions.map((o, i) => {
          const isHighlighted = i === highlight;
          const isSelected = o.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={o}
              id={optionId(i)}
              role="option"
              aria-selected={isSelected}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${
                isHighlighted
                  ? "bg-purple-900/50 text-purple-100"
                  : isSelected
                    ? "bg-purple-900/40 text-purple-200"
                    : "text-gray-200 hover:bg-purple-900/30"
              }`}
            >
              {o}
            </button>
          );
        })}
      </AnchoredDropdown>
    </div>
  );
}
