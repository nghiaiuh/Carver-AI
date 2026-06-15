"use client";

import { useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";
import type { PenSettings } from "../../types/canvas";
import { clamp, formatRgbLabel, hueToHex, hsvToHex, normalizeHexColor, rgbToHsv } from "../widgets/colorPickerUtils";

type PenSettingsPopoverProps = {
  settings: PenSettings;
  onChange: (settings: PenSettings) => void;
  onClose: () => void;
};

const PRESET_COLORS = ["transparent", "#000000", "#FFFFFF", "#19F000", "#9B5CF6", "#D7C4F7"] as const;

export default function PenSettingsPopover({ settings, onChange, onClose }: PenSettingsPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const colorFieldPointerId = useRef<number | null>(null);
  const huePointerId = useRef<number | null>(null);
  const normalizedColor = normalizeHexColor(settings.color);
  const colorHsv = useMemo(() => rgbToHsv({
    r: parseInt(normalizedColor.slice(1, 3), 16),
    g: parseInt(normalizedColor.slice(3, 5), 16),
    b: parseInt(normalizedColor.slice(5, 7), 16),
  }), [normalizedColor]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const opacityPercent = Math.round(settings.opacity * 100);
  const previewBackground = useMemo(
    () => ({
      backgroundColor: normalizedColor,
      opacity: settings.opacity,
    }),
    [normalizedColor, settings.opacity],
  );
  const rgbLabel = useMemo(() => formatRgbLabel(normalizedColor), [normalizedColor]);

  const updatePenColorFromField = (clientX: number, clientY: number, rect: DOMRect) => {
    const saturation = clamp((clientX - rect.left) / rect.width, 0, 1);
    const value = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
    onChange({ ...settings, color: hsvToHex({ h: colorHsv.h, s: saturation, v: value }) });
  };

  const updatePenHue = (clientX: number, rect: DOMRect) => {
    const hue = clamp((clientX - rect.left) / rect.width, 0, 1) * 360;
    onChange({ ...settings, color: hsvToHex({ h: hue, s: colorHsv.s, v: colorHsv.v }) });
  };

  return (
    <div
      ref={rootRef}
      className="absolute bottom-20 left-1/2 z-[70] w-[272px] -translate-x-1/2 overflow-hidden rounded-[28px] border border-[#E6E7EB] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
      data-canvas-ui="true"
    >
      <div className="flex items-center justify-between border-b border-[#ECEEF2] px-4 py-4">
        <h2 className="text-[13px] font-semibold text-[#111827]">Pen</h2>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="grid h-8 w-8 place-items-center rounded-full text-[#111827] transition hover:bg-[#F3F4F6]"
          title="Close pen settings"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div
          className="relative block h-[140px] overflow-hidden rounded-2xl"
          style={{
            background: `linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, transparent), ${hueToHex(colorHsv.h)}`,
          }}
          role="slider"
          tabIndex={0}
          aria-label="Pick pen color"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(colorHsv.s * 100)}
          onPointerDown={(event) => {
            event.stopPropagation();
            colorFieldPointerId.current = event.pointerId;
            updatePenColorFromField(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (colorFieldPointerId.current !== event.pointerId) return;
            updatePenColorFromField(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
          }}
          onPointerUp={(event) => {
            if (colorFieldPointerId.current !== event.pointerId) return;
            colorFieldPointerId.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (colorFieldPointerId.current !== event.pointerId) return;
            colorFieldPointerId.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          <span
            className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-black shadow-[0_0_0_1px_rgba(17,24,39,0.12)]"
            style={{
              left: `${colorHsv.s * 100}%`,
              top: `${(1 - colorHsv.v) * 100}%`,
              backgroundColor: normalizedColor,
            }}
          />
        </div>

        <div className="space-y-3">
          <div
            className="relative block h-3 rounded-full bg-[linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)]"
            role="slider"
            tabIndex={0}
            aria-label="Adjust pen hue"
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(colorHsv.h)}
            onPointerDown={(event) => {
              event.stopPropagation();
              huePointerId.current = event.pointerId;
              updatePenHue(event.clientX, event.currentTarget.getBoundingClientRect());
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (huePointerId.current !== event.pointerId) return;
              updatePenHue(event.clientX, event.currentTarget.getBoundingClientRect());
            }}
            onPointerUp={(event) => {
              if (huePointerId.current !== event.pointerId) return;
              huePointerId.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={(event) => {
              if (huePointerId.current !== event.pointerId) return;
              huePointerId.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          >
            <span
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(17,24,39,0.2)]"
              style={{
                left: `${(colorHsv.h / 360) * 100}%`,
                backgroundColor: hueToHex(colorHsv.h),
              }}
            />
          </div>

          <label
            className="relative block h-3 overflow-hidden rounded-full"
            style={{
              backgroundImage: `linear-gradient(90deg, transparent, ${normalizedColor})`,
            }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(45deg,#E5E7EB_25%,transparent_25%,transparent_50%,#E5E7EB_50%,#E5E7EB_75%,transparent_75%,transparent)] bg-[length:12px_12px]" />
            <input
              type="range"
              min="0"
              max="100"
              value={opacityPercent}
              onChange={(event) => onChange({ ...settings, opacity: clamp(Number(event.target.value) / 100, 0, 1) })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Adjust pen opacity"
            />
            <span
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-black shadow-[0_0_0_1px_rgba(17,24,39,0.2)]"
              style={{ left: `calc(${opacityPercent}% - 8px)` }}
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          {PRESET_COLORS.map((color) => {
            const isTransparent = color === "transparent";
            const selected = isTransparent ? settings.opacity === 0 : settings.color.toUpperCase() === color && settings.opacity > 0;

            return (
              <button
                key={color}
                type="button"
                title={isTransparent ? "Transparent" : color}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isTransparent) {
                    onChange({ ...settings, opacity: 0 });
                    return;
                  }

                  onChange({ ...settings, color: color.toUpperCase(), opacity: settings.opacity === 0 ? 1 : settings.opacity });
                }}
                className={[
                  "relative h-8 w-8 rounded-full border transition",
                  selected ? "border-[#1F7AFF] ring-2 ring-[#1F7AFF]/25" : "border-[#E5E7EB]",
                ].join(" ")}
                style={isTransparent ? undefined : { backgroundColor: color }}
              >
                {isTransparent ? <span className="absolute inset-0 rounded-full bg-[linear-gradient(45deg,#E5E7EB_25%,transparent_25%,transparent_50%,#E5E7EB_50%,#E5E7EB_75%,transparent_75%,transparent)] bg-[length:12px_12px]" /> : null}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-10 flex-1 items-center rounded-2xl bg-[#F3F4F6] px-3 text-sm text-[#111827]">
            <span className="mr-2 text-[#6B7280]">#</span>
            <input
              value={normalizedColor.replace("#", "")}
              onChange={(event) => {
                const nextValue = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
                if (nextValue.length === 6) {
                  onChange({ ...settings, color: `#${nextValue}` });
                }
              }}
              className="w-full bg-transparent font-mono uppercase outline-none"
              aria-label="Pen hex color"
            />
            <span className="whitespace-nowrap text-xs text-[#6B7280]">{rgbLabel}</span>
          </div>

          <label className="flex h-10 w-[78px] items-center justify-center gap-1 rounded-2xl bg-[#F3F4F6] px-3 text-sm text-[#111827]">
            <input
              type="number"
              min="0"
              max="100"
              value={opacityPercent}
              onChange={(event) => onChange({ ...settings, opacity: clamp(Number(event.target.value) / 100, 0, 1) })}
              className="w-9 bg-transparent text-right outline-none"
              aria-label="Pen opacity percent"
            />
            <span className="text-[#6B7280]">%</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#F3F4F6]">
            <span className="h-4 w-4 rounded-full border border-[#111827]" style={previewBackground} />
          </div>
          <label className="flex h-10 items-center gap-2 rounded-2xl bg-[#F3F4F6] px-3 text-sm text-[#111827]">
            <span className="inline-block h-[3px] w-6 rounded-full bg-[#111827]" />
            <input
              type="number"
              min="1"
              max="200"
              value={settings.strokeWidth}
              onChange={(event) => onChange({ ...settings, strokeWidth: clamp(Number(event.target.value), 1, 200) })}
              className="w-10 bg-transparent text-right outline-none"
              aria-label="Pen stroke width"
            />
            <span className="text-[#6B7280]">Px</span>
          </label>
        </div>
      </div>
    </div>
  );
}
