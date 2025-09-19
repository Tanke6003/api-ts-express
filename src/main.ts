 // src/main.ts
import "reflect-metadata";
import "./core/di/container";
 import { Server } from "./core/server";
import { container } from "./core/di/container";
import { IEnvs } from "./domain/interfaces/infrastructure/plugins/envs.plugin.interface";


 const envs = container.resolve<IEnvs>("IEnvs");
    const portEnv = envs.getEnv("PORT");
    const port = portEnv === undefined || portEnv === null || portEnv === "" ? 3000 : Number(portEnv);
    const server = new Server(port);

(async()=>{
   
    await server.run();
})();

export default server.app;
