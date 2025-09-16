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
// src/main.ts
// import { Server } from "./core/server";
// import { DotenvPlugin } from "./infrastructure/plugins/dotenv.plugin";

// const envs = new DotenvPlugin();
// const portEnv = envs.getEnv("PORT");
// const port = portEnv === undefined || portEnv === null || portEnv === "" ? 3000 : Number(portEnv);
// const server = new Server(port);

// // Exportar app para Vercel
// export default server.app;

// // Correr solo localmente
// (async () => {
//   await server.run();
// })();
// src/main.ts
import { Server } from "./core/server";
import { DotenvPlugin } from "./infrastructure/plugins/dotenv.plugin";

const envs = new DotenvPlugin();
const portEnv = envs.getEnv("PORT");
const port = portEnv === undefined || portEnv === null || portEnv === "" ? 3000 : Number(portEnv);
const server = new Server(port);

// Exportamos la app de Express para Vercel
export default server.app;

// Solo ejecutamos .listen si corremos localmente
if (process.env.VERCEL !== "1") {
  (async () => {
    await server.run();
  })();
}
