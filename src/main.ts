import { TOKENS } from "./core/di/tokens";
 // src/main.ts
import "reflect-metadata";
import "./core/di/container";
 import { Server } from "./core/server";
import { container, shutdownConnections, warmUpConnections } from "./core/di/container";
import { IEnvs } from "./domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { ILogger } from "./domain/interfaces/infrastructure/plugins/logger.plugin.interface";


 const envs = container.resolve<IEnvs>(TOKENS.IEnvs);
    const portEnv = envs.getEnv("PORT");
    const port = portEnv === undefined || portEnv === null || portEnv === "" ? 3000 : Number(portEnv);
    const server = new Server(port);

(async()=>{
    // Verifica la base antes de aceptar tráfico: un fallo de credenciales o de
    // red se ve aquí y no en la primera petición del usuario.
    try {
      await warmUpConnections();
    } catch (error) {
      const logger = container.resolve<ILogger>(TOKENS.ILogger);
      logger.error("No se pudo establecer la conexión con la base de datos", { error });
      process.exit(1);
    }

    await server.run();
})();

// Apagado ordenado: devuelve las conexiones del pool antes de salir.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdownConnections().finally(() => process.exit(0));
  });
}
