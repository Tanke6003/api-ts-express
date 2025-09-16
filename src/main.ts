 // src/main.ts
// import { Server } from "./core/server";
// import { DotenvPlugin } from "./infrastructure/plugins/dotenv.plugin";




// (async()=>{
//     const envs = new DotenvPlugin();
//     const portEnv = envs.getEnv("PORT");
//     const port = portEnv === undefined || portEnv === null || portEnv === "" ? 3000 : Number(portEnv);
//     const server = new Server(port);
//     await server.run();
// })();
import { Server } from "./core/server";
import { DotenvPlugin } from "./infrastructure/plugins/dotenv.plugin";

const envs = new DotenvPlugin();
const port = Number(envs.getEnv("PORT") || 3000);
const server = new Server(port);

// 👉 Exporta la app para que Vercel la use
export default server.app;

// 👉 Si estás en local, corre normalmente
if (process.env.VERCEL !== "1") {
  (async () => {
    await server.run();
  })();
}
