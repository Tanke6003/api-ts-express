// src/main.ts
import { Server } from "./core/server";
import { DotenvPlugin } from "./infrastructure/plugins/dotenv.plugin";




(async()=>{
    const envs = new DotenvPlugin();
    const portEnv = envs.getEnv("PORT");
    const port = portEnv === undefined || portEnv === null || portEnv === "" ? 3000 : Number(portEnv);
    const server = new Server(port);
    await server.run();
})();