// Minimal modal form. openModal({title, fields, submitLabel}) -> Promise<values|null>.
// fields: [{ key, label, type?: "text"|"number"|"select", options?, value?, placeholder?,
//           min?, max?, showIf?: (values) => boolean }]  // showIf hides a field live
export function openModal({ title, fields, submitLabel = "Save" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal panel"><div class="panel__header">${title}</div>
      <div class="panel__body"><form></form></div></div>`;
    const form = overlay.querySelector("form");

    for (const f of fields) {
      const label = document.createElement("label");
      label.className = "field";
      label.innerHTML = `<span>${f.label}</span>`;
      let input;
      if (f.type === "select") {
        input = document.createElement("select");
        input.className = "select";
        input.innerHTML = f.options
          .map((o) => `<option value="${o.value ?? o}">${o.label ?? o}</option>`)
          .join("");
        if (f.value != null) input.value = f.value;
      } else if (f.type === "checkbox") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!f.value;
        label.classList.add("field--check");
      } else {
        input = document.createElement("input");
        input.className = "input";
        input.type = f.type || "text";
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.min != null) input.min = f.min;
        if (f.max != null) input.max = f.max;
        if (f.value != null) input.value = f.value;
      }
      input.name = f.key;
      label.append(input);
      form.append(label);
      label._field = f;
    }

    // live show/hide for fields with showIf
    const currentValues = () => {
      const v = {};
      for (const f of fields) { const el = form.elements[f.key]; if (el) v[f.key] = f.type === "checkbox" ? el.checked : el.value; }
      return v;
    };
    const applyVisibility = () => {
      const v = currentValues();
      for (const label of form.querySelectorAll("label.field")) {
        const f = label._field;
        if (f && f.showIf) label.style.display = f.showIf(v) ? "" : "none";
      }
    };
    form.addEventListener("input", applyVisibility);
    applyVisibility();

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    actions.innerHTML = `<button type="button" class="btn btn--ghost btn--sm" data-x="cancel">Cancel</button>
      <button type="submit" class="btn btn--primary btn--sm">${submitLabel}</button>`;
    form.append(actions);

    const close = (v) => { overlay.remove(); resolve(v); };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = {};
      for (const f of fields) {
        const el = form.elements[f.key];
        v[f.key] = f.type === "checkbox" ? el.checked : f.type === "number" ? Number(el.value) : el.value;
      }
      close(v);
    });
    actions.querySelector('[data-x="cancel"]').addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    document.body.append(overlay);
    form.querySelector("input,select")?.focus();
  });
}
