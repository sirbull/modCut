// Minimal modal form. openModal({title, fields, submitLabel}) -> Promise<values|null>.
// fields: [{ key, label, type?: "text"|"number"|"select", options?, value?, placeholder?,
//           min?, max?, showIf?: (values) => boolean,
//           sync?: (values, previousValues, currentValue) => nextValue|undefined }]
let nextMessageModalId = 1;
let nextFormId = 1;
const appearanceIcons = {
  system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21h8m-4-5v5"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  dark: '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
};

export function openModal({ title, fields, submitLabel = "Save", className = "" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal panel"><div class="panel__header">${title}</div>
      <div class="panel__body"><form></form></div></div>`;
    const form = overlay.querySelector("form");
    if (className) overlay.querySelector(".modal").classList.add(className);
    const formId = nextFormId++;

    for (const f of fields) {
      if (f.section) {
        const section = document.createElement("h3");
        section.className = "form-section";
        section.textContent = f.section;
        form.append(section);
      }
      const label = document.createElement(f.type === "segmented" ? "fieldset" : "label");
      label.className = "field";
      const heading = document.createElement(f.type === "segmented" ? "legend" : "span");
      heading.textContent = f.label;
      label.append(heading);
      const descriptionId = `form-${formId}-${f.key}-description`;
      let input;
      if (f.type === "segmented") {
        const segments = document.createElement("div");
        segments.className = "field-segments";
        if (f.options.some((option) => option.swatch)) segments.classList.add("field-segments--swatches");
        for (const option of f.options) {
          const segment = document.createElement("label");
          segment.className = "field-segments__option";
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = f.key;
          radio.value = option.value;
          radio.checked = option.value === f.value;
          if (f.description) radio.setAttribute("aria-describedby", descriptionId);
          const face = document.createElement("span");
          if (appearanceIcons[option.icon]) {
            face.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${appearanceIcons[option.icon]}</svg>`;
          }
          if (option.swatch) {
            const swatch = document.createElement("i");
            swatch.className = "field-segments__swatch";
            swatch.style.backgroundColor = option.swatch;
            swatch.setAttribute("aria-hidden", "true");
            face.append(swatch);
          }
          face.append(document.createTextNode(option.label));
          segment.append(radio, face);
          segments.append(segment);
        }
        label.append(segments);
      } else if (f.type === "select") {
        input = document.createElement("select");
        input.className = "select";
        input.innerHTML = f.options
          .map((o) => `<option value="${o.value ?? o}">${o.label ?? o}</option>`)
          .join("");
        if (f.value != null) input.value = f.value;
        if (f.readOnly) input.readOnly = true;
      } else if (f.type === "checkbox" || f.type === "switch") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!f.value;
        label.classList.add("field--check");
        if (f.type === "switch") {
          input.setAttribute("role", "switch");
          label.classList.add("field--switch");
        }
      } else {
        input = document.createElement("input");
        input.className = "input";
        input.type = f.type || "text";
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.min != null) input.min = f.min;
        if (f.max != null) input.max = f.max;
        if (f.step != null) input.step = f.step;
        if (f.value != null) input.value = f.value;
      }
      if (input) {
        if (f.required) input.required = true;
        input.name = f.key;
        if (f.description) input.setAttribute("aria-describedby", descriptionId);
        label.append(input);
      }
      if (f.description) {
        const description = document.createElement("small");
        description.className = "field__description";
        description.id = descriptionId;
        description.textContent = f.description;
        label.append(description);
      }
      form.append(label);
      label._field = f;
    }

    // live show/hide for fields with showIf
    const currentValues = () => {
      const v = {};
      for (const f of fields) { const el = form.elements[f.key]; if (el) v[f.key] = ["checkbox", "switch"].includes(f.type) ? el.checked : el.value; }
      return v;
    };
    let previousValues = null;
    const applyVisibility = () => {
      const v = currentValues();
      for (const f of fields) {
        if (!f.sync) continue;
        const el = form.elements[f.key];
        const next = f.sync(v, previousValues, el?.value);
        if (el && next != null) {
          el.value = next;
          v[f.key] = String(next);
        }
      }
      for (const label of form.querySelectorAll(".field")) {
        const f = label._field;
        if (f && f.showIf) {
          const visible = f.showIf(v);
          label.style.display = visible ? "" : "none";
          // Hidden conditional fields must not participate in native form
          // validation. They remain available through form.elements so their
          // defaults can still be included when the form is submitted.
          for (const input of label.querySelectorAll("input,select")) {
            input.disabled = !visible;
            input.required = visible && !!f.required;
          }
        }
      }
      previousValues = { ...v };
    };
    form.addEventListener("input", applyVisibility);
    form.addEventListener("change", (event) => {
      const field = fields.find((entry) => entry.key === event.target.name);
      if (field?.onChange) field.onChange(currentValues()[field.key]);
    });
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
        v[f.key] = ["checkbox", "switch"].includes(f.type) ? el.checked : f.type === "number" ? Number(el.value) : el.value;
      }
      close(v);
    });
    actions.querySelector('[data-x="cancel"]').addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    document.body.append(overlay);
    (form.querySelector('input[type="radio"]:checked:not(:disabled)') || form.querySelector("input:not(:disabled),select:not(:disabled)"))?.focus();
  });
}

export function showMessageModal({ title, paragraphs = [], sections = [], buttonLabel = "OK" }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "modal panel message-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const header = document.createElement("div");
    header.className = "panel__header";
    header.id = `message-modal-title-${nextMessageModalId++}`;
    header.textContent = title;
    modal.setAttribute("aria-labelledby", header.id);
    const body = document.createElement("div");
    body.className = "panel__body";
    for (const value of paragraphs) {
      const paragraph = document.createElement("p");
      paragraph.textContent = value;
      body.append(paragraph);
    }
    for (const section of sections) {
      const heading = document.createElement("h4");
      heading.textContent = section.title;
      body.append(heading);
      const list = document.createElement(section.ordered ? "ol" : "ul");
      for (const value of section.items) {
        const item = document.createElement("li");
        item.textContent = value;
        list.append(item);
      }
      body.append(list);
    }
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn btn--primary btn--sm";
    closeButton.textContent = buttonLabel;
    actions.append(closeButton);
    body.append(actions);
    modal.append(header, body);
    overlay.append(modal);
    const close = () => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      previousFocus?.focus?.();
      resolve();
    };
    const onKey = (event) => { if (event.key === "Escape" || event.key === "Enter") close(); };
    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    document.addEventListener("keydown", onKey);
    document.body.append(overlay);
    closeButton.focus();
  });
}
