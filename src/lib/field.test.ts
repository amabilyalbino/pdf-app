import { describe, expect, it } from "vitest";
import { applyFillProfileValue, cloneField, createField, fieldToTemplateDefinition, instantiateTemplate } from "./field";

describe("field helpers", () => {
  it("creates a text field with sane defaults", () => {
    const field = createField(0, "text");

    expect(field.page).toBe(0);
    expect(field.type).toBe("text");
    expect(field.width).toBeGreaterThan(0.2);
    expect(field.value).toBe("");
  });

  it("duplicates a field with a new id and offset position", () => {
    const original = createField(1, "signature");
    const copy = cloneField(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.x).toBeGreaterThan(original.x);
    expect(copy.y).toBeGreaterThan(original.y);
  });

  it("maps fill profile data into a bound field", () => {
    const field = {
      ...createField(0, "text"),
      bindingKey: "company_name"
    };

    const updated = applyFillProfileValue(field, {
      company_name: "Acme Logistics"
    });

    expect(updated.value).toBe("Acme Logistics");
  });

  it("round-trips template definitions into editable fields", () => {
    const original = {
      ...createField(0, "checkbox"),
      checked: true,
      bindingKey: "approved"
    };

    const definition = fieldToTemplateDefinition(original);
    const [restored] = instantiateTemplate({
      id: "template_1",
      name: "Approval form",
      fingerprint: {
        pageCount: 1,
        pageSizes: [{ width: 612, height: 792 }],
        firstPageTextHash: "abc123"
      },
      pageMappings: [{ page: 0, width: 612, height: 792 }],
      fieldDefinitions: [definition],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    expect(restored.checked).toBe(true);
    expect(restored.bindingKey).toBe("approved");
  });
});
