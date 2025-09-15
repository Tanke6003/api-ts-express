// src/main.ts
import { Server } from "./core/server.js";




(async()=>{
    const server = new Server(3000);
    await server.run();
})();