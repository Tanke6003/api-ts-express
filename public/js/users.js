// public/js/users.js
import { api } from "./api.js";
import {
  $,
  bindRowActions,
  closeModal,
  emptyRow,
  esc,
  openModal,
  renderPager,
  run,
} from "./ui.js";

const state = { page: 1, limit: 10 };

function rowHtml(user) {
  return `
    <tr>
      <td class="px-4 py-3 font-medium">${esc(user.name)}</td>
      <td class="px-4 py-3 text-slate-600">${esc(user.email) || "—"}</td>
      <td class="px-4 py-3 text-slate-600">${esc(user.phone) || "—"}</td>
      <td class="px-4 py-3">
        <span class="rounded-full ${user.isClient ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"} px-2 py-1 text-xs font-medium">
          ${user.isClient ? "Cliente" : "Staff"}
        </span>
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <button class="btn-link" data-action="edit" data-id="${user.id}">Editar</button>
        <button class="btn-link-danger" data-action="softDelete" data-id="${user.id}">Eliminar</button>
      </td>
    </tr>`;
}

export async function loadUsers() {
  const page = await api.users.list({ page: state.page, limit: state.limit });

  $("#user-rows").innerHTML =
    page.data.length > 0 ? page.data.map(rowHtml).join("") : emptyRow(5, "No hay usuarios.");

  bindRowActions($("#user-rows"), {
    edit: (id) => openForm(page.data.find((user) => user.id === id)),
    softDelete: (id) =>
      confirm("¿Eliminar este usuario?") &&
      run(() => api.users.softDelete(id), { success: "Usuario eliminado", onDone: loadUsers }),
  });

  renderPager($("#user-pager"), page, (next) => {
    state.page = next;
    loadUsers();
  });
}

function openForm(user) {
  const editing = Boolean(user);

  openModal({
    title: editing ? "Editar usuario" : "Nuevo usuario",
    fields: `
      <label class="field">
        <span>Nombre *</span>
        <input name="name" required maxlength="100" value="${esc(user?.name)}" />
      </label>
      <label class="field">
        <span>Email</span>
        <input name="email" type="email" maxlength="150" value="${esc(user?.email)}" />
      </label>
      <label class="field">
        <span>Teléfono</span>
        <input name="phone" maxlength="30" value="${esc(user?.phone)}" />
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input name="isClient" type="checkbox" class="h-4 w-4 rounded border-slate-300" ${
          !editing || user.isClient ? "checked" : ""
        } />
        Puede ser titular de una cita (cliente)
      </label>`,
    onSubmit: async (form) => {
      const body = {
        name: form.name,
        // El backend valida el formato de email, así que un campo vacío se
        // manda como null en lugar de como cadena vacía.
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        isClient: form.isClient === "on",
      };

      const saved = await run(
        () => (editing ? api.users.update(user.id, body) : api.users.create(body)),
        { success: editing ? "Usuario actualizado" : "Usuario creado", onDone: loadUsers }
      );

      if (saved !== undefined) closeModal();
    },
  });
}

export function initUsers() {
  $("#user-new").addEventListener("click", () => openForm(null));
}

/** Clientes disponibles para el formulario de citas. */
export async function fetchClients() {
  const page = await api.users.list({ page: 1, limit: 100 });
  return page.data.filter((user) => user.isClient !== false);
}
