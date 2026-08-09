// public/js/ui.js
// Utilidades compartidas por las tres vistas: escapado, avisos, modal y paginador.

import { ApiError } from "./api.js";

/**
 * Escapa antes de interpolar en HTML. Los nombres de invitado y los detalles son
 * texto libre, así que sin esto una comilla o un `<script>` acabarían en el DOM.
 */
export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export const $ = (selector) => document.querySelector(selector);

// ------------------------------------------------------------------ avisos --

export function toast(message, kind = "info") {
  const palette = {
    info: "bg-slate-900",
    success: "bg-emerald-600",
    error: "bg-rose-600",
  };

  const node = document.createElement("div");
  node.className = `${palette[kind]} rounded-lg px-4 py-3 text-sm text-white shadow-lg`;
  node.textContent = message;
  $("#toasts").append(node);

  setTimeout(() => node.remove(), 4000);
}

/** Traduce el error del backend a un aviso legible, incluidos los de validación. */
export function reportError(error) {
  if (error instanceof ApiError && error.issues.length > 0) {
    toast(error.issues.map((issue) => `${issue.field}: ${issue.message}`).join(" · "), "error");
    return;
  }
  toast(error.message || "Error inesperado", "error");
}

/** Envuelve una acción: muestra el resultado y refresca, o reporta el error. */
export async function run(action, { success, onDone } = {}) {
  try {
    const result = await action();
    if (success) toast(success, "success");
    await onDone?.();
    return result;
  } catch (error) {
    reportError(error);
    return undefined;
  }
}

// ------------------------------------------------------------------- modal --

let submitHandler = null;

export function openModal({ title, fields, onSubmit }) {
  $("#modal-title").textContent = title;
  $("#modal-form").innerHTML = fields;
  $("#modal").classList.remove("hidden");
  $("#modal").classList.add("flex");
  submitHandler = onSubmit;
  $("#modal-form").querySelector("input, select, textarea")?.focus();
}

export function closeModal() {
  $("#modal").classList.add("hidden");
  $("#modal").classList.remove("flex");
  submitHandler = null;
}

export function initModal() {
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-cancel").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (event) => {
    if (event.target === $("#modal")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  $("#modal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!submitHandler) return;

    const data = Object.fromEntries(new FormData(event.target).entries());
    const button = $("#modal-submit");
    button.disabled = true;
    try {
      await submitHandler(data, event.target);
    } finally {
      button.disabled = false;
    }
  });
}

// --------------------------------------------------------------- paginador --

/** Dibuja el paginador y devuelve el control al callback cuando se cambia de página. */
export function renderPager(container, page, onChange) {
  const { total, pages, page: current, limit } = page;

  if (total === 0) {
    container.innerHTML = "<p class=\"text-sm text-slate-500\">Sin resultados.</p>";
    return;
  }

  const from = (current - 1) * limit + 1;
  const to = Math.min(current * limit, total);

  container.innerHTML = `
    <div class="flex items-center gap-3 text-sm text-slate-600">
      <span>${from}–${to} de ${total}</span>
      <div class="ml-auto flex gap-1">
        <button class="btn-ghost" data-page="${current - 1}" ${current <= 1 ? "disabled" : ""}>Anterior</button>
        <button class="btn-ghost" data-page="${current + 1}" ${current >= pages ? "disabled" : ""}>Siguiente</button>
      </div>
    </div>`;

  for (const button of container.querySelectorAll("button[data-page]")) {
    button.addEventListener("click", () => onChange(Number(button.dataset.page)));
  }
}

/** Retrasa la búsqueda mientras se escribe, para no lanzar una petición por tecla. */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function emptyRow(colspan, message = "Nada por aquí todavía.") {
  return `<tr><td colspan="${colspan}" class="px-4 py-10 text-center text-sm text-slate-500">${esc(message)}</td></tr>`;
}

/** Conecta los botones de acción de una tabla con sus manejadores. */
export function bindRowActions(container, handlers) {
  for (const button of container.querySelectorAll("button[data-action]")) {
    button.addEventListener("click", () => {
      handlers[button.dataset.action]?.(Number(button.dataset.id));
    });
  }
}
