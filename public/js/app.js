// public/js/app.js
// Arranque de la interfaz: pestañas, modal y carga inicial de cada vista.

import { api } from "./api.js";
import { $, initModal, reportError } from "./ui.js";
import { initAppointments, loadAppointments } from "./appointments.js";
import { initBranches, loadBranches } from "./branches.js";
import { initUsers, loadUsers } from "./users.js";

const VIEWS = {
  appointments: loadAppointments,
  branches: loadBranches,
  users: loadUsers,
};

function showTab(name) {
  for (const button of document.querySelectorAll("#tabs .tab-button")) {
    button.setAttribute("aria-selected", String(button.dataset.tab === name));
  }
  for (const [key] of Object.entries(VIEWS)) {
    $(`#view-${key}`).classList.toggle("hidden", key !== name);
  }

  location.hash = name;
  // Se recarga al entrar para que los cambios hechos en otra pestaña —por
  // ejemplo dar de baja una sucursal, que cancela citas— se vean al volver.
  VIEWS[name]().catch(reportError);
}

async function showDataSource() {
  try {
    const health = await api.health();
    $("#datasource-badge").textContent = health.dataSource;
    $("#datasource-badge").classList.add(
      health.dataSource === "oracle" ? "bg-emerald-200" : "bg-amber-200"
    );
  } catch {
    $("#datasource-badge").textContent = "desconocido";
  }
}

async function main() {
  initModal();
  initUsers();
  initBranches();

  for (const button of document.querySelectorAll("#tabs .tab-button")) {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  }

  await showDataSource();

  try {
    // Deja el filtro de sucursales y las tarjetas de totales listos antes de
    // mostrar la pestaña inicial.
    await initAppointments();
  } catch (error) {
    reportError(error);
  }

  const initial = location.hash.replace("#", "");
  showTab(initial in VIEWS ? initial : "appointments");
}

main().catch(reportError);
