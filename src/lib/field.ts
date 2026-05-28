import type { FieldDefinition, FieldStyle, FieldType, PlacedField, TemplateDefinition } from "../types";
import { createId } from "./id";

export const DEFAULT_FIELD_STYLE: FieldStyle = {
  fontSize: 14,
  fontFamily: "Avenir Next, Segoe UI, sans-serif",
  color: "#11313b",
  align: "left",
  bold: false
};

export function createField(page: number, type: FieldType): PlacedField {
  const baseByType: Record<FieldType, Pick<PlacedField, "width" | "height" | "value" | "checked">> = {
    text: { width: 0.32, height: 0.055, value: "" },
    date: { width: 0.22, height: 0.055, value: new Date().toISOString().slice(0, 10) },
    checkbox: { width: 0.05, height: 0.05, checked: false },
    signature: { width: 0.28, height: 0.12, value: "" }
  };

  const id = createId("field");
  return {
    id,
    name: `${type}-${id.slice(-4)}`,
    page,
    type,
    x: 0.12,
    y: 0.16,
    style: DEFAULT_FIELD_STYLE,
    ...baseByType[type]
  };
}

export function cloneField(field: PlacedField): PlacedField {
  return {
    ...field,
    id: createId("field"),
    name: `${field.name}-copy`,
    x: clamp(field.x + 0.03, 0, 0.92),
    y: clamp(field.y + 0.03, 0, 0.92)
  };
}

export function fieldToTemplateDefinition(field: PlacedField): FieldDefinition {
  return {
    id: field.id,
    name: field.name,
    page: field.page,
    type: field.type,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    style: field.style,
    bindingKey: field.bindingKey,
    defaultValue:
      field.type === "checkbox"
        ? field.checked
          ? "true"
          : "false"
        : field.value ?? field.defaultValue
  };
}

export function instantiateTemplate(template: TemplateDefinition): PlacedField[] {
  return template.fieldDefinitions.map((field) => ({
    ...field,
    value: field.type === "checkbox" ? undefined : field.defaultValue ?? "",
    checked: field.type === "checkbox" ? field.defaultValue === "true" : undefined
  }));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function applyFillProfileValue(field: PlacedField, values: Record<string, string>): PlacedField {
  if (!field.bindingKey || !(field.bindingKey in values)) {
    return field;
  }

  if (field.type === "checkbox") {
    return {
      ...field,
      checked: values[field.bindingKey].toLowerCase() === "true"
    };
  }

  return {
    ...field,
    value: values[field.bindingKey]
  };
}
