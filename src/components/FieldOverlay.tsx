import { useEffect, useMemo, useRef } from "react";
import type { FillProfile, PlacedField, SignatureProfile } from "../types";
import { clamp } from "../lib/field";

type FieldOverlayProps = {
  field: PlacedField;
  selected: boolean;
  signatureProfiles: SignatureProfile[];
  signatureAssets: Record<string, string>;
  fillProfiles: FillProfile[];
  onSelect: () => void;
  onChange: (field: PlacedField) => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function FieldOverlay({
  field,
  selected,
  signatureProfiles,
  signatureAssets,
  fillProfiles,
  onSelect,
  onChange,
  onDuplicate,
  onDelete
}: FieldOverlayProps) {
  const dragMode = useRef<"move" | "resize" | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const startRef = useRef<{
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const resolvedSignature = useMemo(() => {
    if (!field.signatureProfileId) {
      return null;
    }

    const profile = signatureProfiles.find((item) => item.id === field.signatureProfileId);
    if (!profile) {
      return null;
    }

    return {
      label: profile.displayName,
      image: signatureAssets[profile.assetRef] ?? null
    };
  }, [field.signatureProfileId, signatureAssets, signatureProfiles]);

  const displayValue = useMemo(() => {
    if (field.bindingKey) {
      const profile = fillProfiles.find((item) => item.values[field.bindingKey ?? ""]);
      return profile?.values[field.bindingKey] ?? field.value ?? "";
    }

    return field.value ?? "";
  }, [field.bindingKey, field.value, fillProfiles]);

  const previewValue = useMemo(() => {
    if (field.type === "date" && field.value) {
      const [year, month, day] = field.value.split("-");
      if (year && month && day) {
        return `${day}/${month}/${year}`;
      }
    }

    return displayValue;
  }, [displayValue, field.type, field.value]);

  useEffect(() => {
    if (!selected || (field.type !== "text" && field.type !== "date")) {
      return;
    }

    inputRef.current?.focus();
    if (field.type === "text") {
      inputRef.current?.setSelectionRange(field.value?.length ?? 0, field.value?.length ?? 0);
    }
  }, [field.id, field.type, selected]);

  function beginDrag(
    event: React.PointerEvent<HTMLButtonElement | HTMLDivElement>,
    mode: "move" | "resize"
  ) {
    event.stopPropagation();
    if (event.button !== 0) {
      return;
    }
    dragMode.current = mode;
    startRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height
    };

    const target = event.currentTarget as Element;
    target.setPointerCapture(event.pointerId);
  }

  function updateDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragMode.current || !startRef.current) {
      return;
    }

    const container = event.currentTarget.parentElement;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const deltaX = (event.clientX - startRef.current.pointerX) / rect.width;
    const deltaY = (event.clientY - startRef.current.pointerY) / rect.height;

    if (dragMode.current === "move") {
      onChange({
        ...field,
        x: clamp(startRef.current.x + deltaX, 0, 1 - field.width),
        y: clamp(startRef.current.y + deltaY, 0, 1 - field.height)
      });
      return;
    }

    onChange({
      ...field,
      width: clamp(startRef.current.width + deltaX, 0.04, 1 - field.x),
      height: clamp(startRef.current.height + deltaY, 0.035, 1 - field.y)
    });
  }

  function endDrag() {
    dragMode.current = null;
    startRef.current = null;
  }

  function renderFieldContent() {
    if (field.type === "checkbox") {
      return (
        <div className={`field-box__checkbox ${field.checked ? "is-checked" : ""}`}>
          {field.checked ? "✓" : ""}
        </div>
      );
    }

    if (field.type === "signature") {
      return (
        <div className={`field-box__signature ${resolvedSignature?.image ? "has-image" : "is-placeholder"}`}>
          {resolvedSignature?.image ? (
            <img src={resolvedSignature.image} alt={resolvedSignature.label} />
          ) : (
            <span>Signature</span>
          )}
        </div>
      );
    }

    if (field.type === "date") {
      if (selected) {
        return (
          <input
            ref={inputRef}
            className="field-box__input field-box__input--date"
            type="date"
            value={field.value ?? ""}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              onChange({
                ...field,
                value: event.target.value
              })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        );
      }

      return (
        <div className={`field-box__preview ${previewValue ? "" : "is-placeholder"}`}>
          {previewValue || "Date"}
        </div>
      );
    }

    if (selected) {
      return (
        <input
          ref={inputRef}
          className="field-box__input"
          type="text"
          value={displayValue}
          placeholder="Text"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChange({
              ...field,
              value: event.target.value
            })
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      );
    }

    return (
      <div className={`field-box__preview ${previewValue ? "" : "is-placeholder"}`}>
        {previewValue || "Text"}
      </div>
    );
  }

  return (
    <div
      className={`field-box field-box--${field.type} ${selected ? "is-selected" : ""}`}
      style={{
        left: `${field.x * 100}%`,
        top: `${field.y * 100}%`,
        width: `${field.width * 100}%`,
        height: `${field.height * 100}%`,
        color: field.style.color,
        fontSize: `${field.style.fontSize}px`,
        fontFamily: field.style.fontFamily,
        fontWeight: field.style.bold ? 700 : 500,
        textAlign: field.style.align
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerMove={updateDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="field-box__content">{renderFieldContent()}</div>
      {selected ? (
        <>
          <button
            type="button"
            className="field-box__move-handle"
            aria-label="Move field"
            onPointerDown={(event) => beginDrag(event, "move")}
          />
          <div className="field-box__toolbar">
            <button
              type="button"
              className="field-box__toolbar-action"
              aria-label="Duplicate field"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDuplicate();
              }}
            >
              ⧉
            </button>
            <button
              type="button"
              className="field-box__toolbar-action danger"
              aria-label="Delete field"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              ✕
            </button>
          </div>
          <button
            type="button"
            className="field-box__resize"
            onPointerDown={(event) => beginDrag(event, "resize")}
          />
        </>
      ) : null}
    </div>
  );
}
