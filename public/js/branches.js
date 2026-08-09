// public/js/branches.js
import { api } from "./api.js";
import {
  $,
  bindRowActions,
  closeModal,
  debounce,
  emptyRow,
  esc,
  openModal,
  renderPager,
  run,
} from "./ui.js";

const state = { page: 1, limit: 10, search: "", withDeleted: false };

function rowHtml(branch) {
  const deleted = branch.available === false;

  return `
    <tr class="${deleted ? "bg-rose-50/50" : ""}">
      <td class="px-4 py-3 font-medium">${esc(branch.name)}</td>
      <td class="px-4 py-3 text-slate-600">${esc(branch.address) || "—"}</td>
      <td class="px-4 py-3 text-slate-600">${esc(branch.phone) || "—"}</td>
      <td class="px-4 py-3 text-slate-600">${esc(branch.opensAt)} – ${esc(branch.closesAt)}</td>
      <td class="px-4 py-3">
        <span class="rounded-full ${deleted ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"} px-2 py-1 text-xs font-medium">
          ${deleted ? "Eliminada" : "Activa"}
        </span>
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        ${
          deleted
            ? `<button class="btn-link" data-action="restore" data-id="${branch.id}">Restaurar</button>`
            : `<button class="btn-link" data-action="edit" data-id="${branch.id}">Editar</button>
               <button class="btn-link-danger" data-action="softDelete" data-id="${branch.id}">Eliminar</button>`
        }
        <button class="btn-link-danger" data-action="hardDelete" data-id="${branch.id}">Borrar definitivo</button>
      </td>
    </tr>`;
}

export async function loadBranches() {
  const page = await api.branches.list({
    page: state.page,
    limit: state.limit,
    search: state.search,
    withDeleted: state.withDeleted,
  });

  $("#branch-rows").innerHTML =
    page.data.length > 0 ? page.data.map(rowHtml).join("") : emptyRow(6, "No hay sucursales.");

  bindRowActions($("#branch-rows"), {
    edit: (id) => openForm(page.data.find((branch) => branch.id === id)),

    softDelete: (id) =>
      confirm(
        "Se dará de baja la sucursal y se cancelarán sus citas futuras, todo en una transacción. ¿Continuar?"
      ) &&
      run(() => api.branches.softDelete(id), {
        success: "Sucursal dada de baja",
        onDone: loadBranches,
      }),

    restore: (id) =>
      run(() => api.branches.restore(id), { success: "Sucursal restaurada", onDone: loadBranches }),

    hardDelete: (id) =>
      confirm(
        "Se borrará la sucursal Y TODAS sus citas de la base de datos, sin vuelta atrás. ¿Continuar?"
      ) &&
      run(() => api.branches.hardDelete(id), {
        success: "Sucursal eliminada definitivamente",
        onDone: loadBranches,
      }),
  });

  renderPager($("#branch-pager"), page, (next) => {
    state.page = next;
    loadBranches();
  });
}

function openForm(branch) {
  const editing = Boolean(branch);

  openModal({
    title: editing ? "Editar sucursal" : "Nueva sucursal",
    fields: `
      <label class="field">
        <span>Nombre *</span>
        <input name="name" required maxlength="100" value="${esc(branch?.name)}" />
      </label>
      <label class="field">
        <span>Dirección</span>
        <input name="address" maxlength="200" value="${esc(branch?.address)}" />
      </label>
      <label class="field">
        <span>Teléfono</span>
        <input name="phone" maxlength="30" value="${esc(branch?.phone)}" />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="field">
          <span>Abre</span>
          <input name="opensAt" type="time" value="${esc(branch?.opensAt) || "09:00"}" />
        </label>
        <label class="field">
          <span>Cierra</span>
          <input name="closesAt" type="time" value="${esc(branch?.closesAt) || "18:00"}" />
        </label>
      </div>`,
    onSubmit: async (form) => {
      const body = {
        name: form.name,
        address: form.address?.trim() || null,
        phone: form.phone?.trim() || null,
        opensAt: form.opensAt,
        closesAt: form.closesAt,
      };

      const saved = await run(
        () => (editing ? api.branches.update(branch.id, body) : api.branches.create(body)),
        { success: editing ? "Sucursal actualizada" : "Sucursal creada", onDone: loadBranches }
      );

      if (saved !== undefined) closeModal();
    },
  });
}

export function initBranches() {
  $("#branch-new").addEventListener("click", () => openForm(null));

  $("#branch-search").addEventListener(
    "input",
    debounce((event) => {
      state.search = event.target.value.trim();
      state.page = 1;
      loadBranches();
    })
  );

  $("#branch-with-deleted").addEventListener("change", (event) => {
    state.withDeleted = event.target.checked;
    state.page = 1;
    loadBranches();
  });
}

/** Sucursales activas para el formulario de citas. */
export async function fetchActiveBranches() {
  const page = await api.branches.list({ page: 1, limit: 100 });
  return page.data;
}
