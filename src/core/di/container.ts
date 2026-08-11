// src/core/di/container.ts
//
// Raíz de composición. Se limita a decidir el orden: cada bloque se registra en
// su propio fichero de `modules/`, así que añadir un módulo es crear el suyo y
// añadir una línea aquí, y quitarlo es borrar las dos. El detalle de qué
// implementación cubre cada interfaz vive en el módulo, no en esta lista.
//
// `modules/` es el andamiaje de la plantilla —plugins, persistencia, identidad y
// bitácora— y `modules/features/` son los módulos de negocio, uno por fichero.
// Esa frontera es la misma que describe el readme: lo de fuera se queda, lo de
// dentro se sustituye por lo tuyo.
//
// Registrar al importar es deliberado: `main.ts`, las rutas y los tests dan por
// hecho que basta con importar este fichero para tener el contenedor listo.
import "reflect-metadata";
import { container } from "tsyringe";
import { registerPlugins } from "./modules/plugins.module";
import { registerPersistence } from "./modules/persistence.module";
import { registerUsers } from "./modules/features/users.module";
import { registerBranches } from "./modules/features/branches.module";
import { registerAppointments } from "./modules/features/appointments.module";
import { registerSystem } from "./modules/system.module";

// El orden importa hasta aquí: los plugins dan las env vars, el log y el
// contexto de petición con los que se construye la persistencia.
const plugins = registerPlugins();
const persistence = registerPersistence(plugins);

// De aquí para abajo ya no: cada módulo declara sus clases y tsyringe resuelve
// las dependencias cuando alguien las pide, no cuando se registran.
registerUsers();
registerBranches();
registerAppointments();
registerSystem();

/**
 * Comprueba la conexión al arrancar, para que un problema de credenciales o de
 * red se vea en el log del arranque y no en la primera petición del usuario.
 * En memoria no hay nada que abrir y no hace nada.
 */
export async function warmUpConnections(): Promise<void> {
  await persistence.connection?.authenticate();
}

/** Cierra los recursos abiertos —el pool del motor activo— en un apagado ordenado. */
export async function shutdownConnections(): Promise<void> {
  await persistence.connection?.close();
}

export { container };
export { TOKENS } from "./tokens";
