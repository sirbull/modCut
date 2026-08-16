// Minimal modal form. openModal({title, fields, submitLabel}) -> Promise<values|null>.
// fields: [{ key, label, type?: "text"|"number"|"select", options?, value?, placeholder?,
//           min?, max?, showIf?: (values) => boolean,
//           sync?: (values, previousValues, currentValue) => nextValue|undefined }]
let nextMessageModalId = 1;

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
        if (f.step != null) input.step = f.step;
        if (f.value != null) input.value = f.value;
      }
      if (f.required) input.required = true;
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
      for (const label of form.querySelectorAll("label.field")) {
        const f = label._field;
        if (f && f.showIf) {
          const visible = f.showIf(v);
          label.style.display = visible ? "" : "none";
          label.querySelector("input,select").required = visible && !!f.required;
        }
      }
      previousValues = { ...v };
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
