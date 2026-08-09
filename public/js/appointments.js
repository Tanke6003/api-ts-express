// public/js/appointments.js
import { api } from "./api.js";
import { fetchActiveBranches } from "./branches.js";
import { fetchClients } from "./users.js";
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

const state = {
  page: 1,
  limit: 10,
  search: "",
  branchId: "",
  status: "",
  from: "",
  to: "",
  onlyGuests: false,
  withDeleted: false,
};

const STATUS_STYLES = {
  PENDING: { label: "Pendiente", css: "bg-amber-100 text-amber-800" },
  CONFIRMED: { label: "Confirmada", css: "bg-emerald-100 text-emerald-700" },
  DONE: { label: "Atendida", css: "bg-sky-100 text-sky-700" },
  CANCELLED: { label: "Cancelada", css: "bg-slate-200 text-slate-600" },
};

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** `datetime-local` sólo acepta `YYYY-MM-DDTHH:mm` en hora local. */
function toLocalInputValue(iso) {
  const date = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function rowHtml(appointment) {
  const deleted = appointment.available === false;
  const status = STATUS_STYLES[appointment.status] ?? {
    label: appointment.status,
    css: "bg-slate-100",
  };

  // El backend ya resolvió con quién es la cita: cliente registrado o invitado.
  const party = appointment.clientId
    ? "<span class=\"rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700\">CLIENTE</span>"
    : "<span class=\"rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700\">SIN CLIENTE</span>";

  return `
    <tr class="${deleted ? "bg-rose-50/50" : ""}">
      <td class="px-4 py-3 whitespace-nowrap">${esc(dateFormat.format(new Date(appointment.scheduledAt)))}</td>
      <td class="px-4 py-3">
        <div class="font-medium">${esc(appointment.displayName)}</div>
        <div class="mt-1">${party}</div>
      </td>
      <td class="px-4 py-3 text-slate-600">${esc(appointment.branchName) || "—"}</td>
      <td class="px-4 py-3 text-slate-600">${appointment.durationMin} min</td>
      <td class="px-4 py-3">
        <span class="rounded-full ${status.css} px-2 py-1 text-xs font-medium">${esc(status.label)}</span>
      </td>
      <td class="px-4 py-3 max-w-xs truncate text-slate-600" title="${esc(appointment.details)}">
        ${esc(appointment.details) || "—"}
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        ${
          deleted
            ? `<button class="btn-link" data-action="restore" data-id="${appointment.id}">Restaurar</button>`
            : `<button class="btn-link" data-action="edit" data-id="${appointment.id}">Editar</button>
               <button class="btn-link-danger" data-action="softDelete" data-id="${appointment.id}">Eliminar</button>`
        }
        <button class="btn-link-danger" data-action="hardDelete" data-id="${appointment.id}">Borrar definitivo</button>
      </td>
    </tr>`;
}

async function loadStats() {
  const { data } = await api.appointments.stats(state.branchId || undefined);
  const totals = Object.fromEntries(data.map((row) => [row.status, row.total]));

  $("#appointment-stats").innerHTML = Object.entries(STATUS_STYLES)
    .map(
      ([key, meta]) => `
        <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">${esc(meta.label)}</p>
          <p class="mt-1 text-2xl font-semibold">${totals[key] ?? 0}</p>
        </div>`
    )
    .join("");
}

export async function loadAppointments() {
  const page = await api.appointments.list({
    page: state.page,
    limit: state.limit,
    search: state.search,
    branchId: state.branchId,
    status: state.status,
    // El input `date` da un día suelto; se amplía al rango completo de ese día.
    from: state.from ? `${state.from}T00:00:00` : "",
    to: state.to ? `${state.to}T23:59:59` : "",
    onlyGuests: state.onlyGuests,
    withDeleted: state.withDeleted,
  });

  $("#appt-rows").innerHTML =
    page.data.length > 0
      ? page.data.map(rowHtml).join("")
      : emptyRow(7, "No hay citas con esos filtros.");

  bindRowActions($("#appt-rows"), {
    edit: (id) => openForm(page.data.find((appointment) => appointment.id === id)),

    softDelete: (id) =>
      confirm("¿Eliminar esta cita? Podrás restaurarla después.") &&
      run(() => api.appointments.softDelete(id), { success: "Cita eliminada", onDone: refresh }),

    restore: (id) =>
      run(() => api.appointments.restore(id), { success: "Cita restaurada", onDone: refresh }),

    hardDelete: (id) =>
      confirm("Se borrará la cita de la base de datos, sin vuelta atrás. ¿Continuar?") &&
      run(() => api.appointments.hardDelete(id), {
        success: "Cita eliminada definitivamente",
        onDone: refresh,
      }),
  });

  renderPager($("#appt-pager"), page, (next) => {
    state.page = next;
    loadAppointments();
  });
}

async function refresh() {
  await Promise.all([loadAppointments(), loadStats()]);
}

async function openForm(appointment) {
  const editing = Boolean(appointment);
  const [branches, clients] = await Promise.all([fetchActiveBranches(), fetchClients()]);

  const withClient = editing ? Boolean(appointment.clientId) : true;

  const branchOptions = branches
    .map(
      (branch) =>
        `<option value="${branch.id}" ${branch.id === appointment?.branchId ? "selected" : ""}>${esc(branch.name)}</option>`
    )
    .join("");

  const clientOptions = clients
    .map(
      (client) =>
        `<option value="${client.id}" ${client.id === appointment?.clientId ? "selected" : ""}>${esc(client.name)}</option>`
    )
    .join("");

  const statusOptions = Object.entries(STATUS_STYLES)
    .map(
      ([key, meta]) =>
        `<option value="${key}" ${key === appointment?.status ? "selected" : ""}>${esc(meta.label)}</option>`
    )
    .join("");

  openModal({
    title: editing ? "Editar cita" : "Nueva cita",
    fields: `
      <label class="field">
        <span>Sucursal *</span>
        <select name="branchId" required>${branchOptions}</select>
      </label>

      <label class="field">
        <span>¿Con quién es la cita? *</span>
        <select name="party" id="party-select">
          <option value="client" ${withClient ? "selected" : ""}>Cliente registrado</option>
          <option value="guest" ${withClient ? "" : "selected"}>Sin cliente (invitado)</option>
        </select>
      </label>

      <label class="field ${withClient ? "" : "hidden"}" id="client-field">
        <span>Cliente</span>
        <select name="clientId">${clientOptions}</select>
      </label>

      <label class="field ${withClient ? "hidden" : ""}" id="guest-field">
        <span>Nombre del invitado</span>
        <input name="guestName" maxlength="100" value="${esc(appointment?.guestName)}" />
      </label>

      <div class="grid grid-cols-2 gap-3">
        <label class="field">
          <span>Fecha y hora *</span>
          <input name="scheduledAt" type="datetime-local" required value="${toLocalInputValue(appointment?.scheduledAt)}" />
        </label>
        <label class="field">
          <span>Duración (min)</span>
          <input name="durationMin" type="number" min="5" max="1440" step="5" value="${appointment?.durationMin ?? 30}" />
        </label>
      </div>

      <label class="field">
        <span>Estado</span>
        <select name="status">${statusOptions}</select>
      </label>

      <label class="field">
        <span>Detalles</span>
        <textarea name="details" rows="3" maxlength="500">${esc(appointment?.details)}</textarea>
      </label>`,

    onSubmit: async (form) => {
      const isGuest = form.party === "guest";
      const body = {
        branchId: Number(form.branchId),
        // Sólo uno de los dos viaja informado: la regla la valida el backend.
        clientId: isGuest ? null : Number(form.clientId),
        guestName: isGuest ? form.guestName?.trim() || null : null,
        scheduledAt: form.scheduledAt,
        durationMin: Number(form.durationMin) || 30,
        status: form.status,
        details: form.details?.trim() || null,
      };

      const saved = await run(
        () =>
          editing ? api.appointments.update(appointment.id, body) : api.appointments.create(body),
        { success: editing ? "Cita actualizada" : "Cita agendada", onDone: refresh }
      );

      if (saved !== undefined) closeModal();
    },
  });

  // El selector de tipo alterna qué campo se muestra; se conecta después de que
  // el modal ya tiene el formulario en el DOM.
  $("#party-select").addEventListener("change", (event) => {
    const guest = event.target.value === "guest";
    $("#client-field").classList.toggle("hidden", guest);
    $("#guest-field").classList.toggle("hidden", !guest);
  });
}

export async function initAppointments() {
  $("#appt-new").addEventListener("click", () => openForm(null));

  $("#appt-search").addEventListener(
    "input",
    debounce((event) => {
      state.search = event.target.value.trim();
      state.page = 1;
      loadAppointments();
    })
  );

  for (const [selector, key] of [
    ["#appt-branch", "branchId"],
    ["#appt-status", "status"],
    ["#appt-from", "from"],
    ["#appt-to", "to"],
  ]) {
    $(selector).addEventListener("change", (event) => {
      state[key] = event.target.value;
      state.page = 1;
      refresh();
    });
  }

  for (const [selector, key] of [
    ["#appt-only-guests", "onlyGuests"],
    ["#appt-with-deleted", "withDeleted"],
  ]) {
    $(selector).addEventListener("change", (event) => {
      state[key] = event.target.checked;
      state.page = 1;
      loadAppointments();
    });
  }

  // Filtro de sucursales, poblado desde la API.
  const branches = await fetchActiveBranches();
  $("#appt-branch").insertAdjacentHTML(
    "beforeend",
    branches.map((branch) => `<option value="${branch.id}">${esc(branch.name)}</option>`).join("")
  );

  await refresh();
}
