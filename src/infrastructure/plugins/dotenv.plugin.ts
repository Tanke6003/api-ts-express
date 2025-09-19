// src/infrastructure/plugins/dotenv.plugin.ts
import dotenv from "dotenv";
import path from "path";
import { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";

export class DotenvPlugin implements IEnvs {
  constructor() {
   const env = process.env.NODE_ENV || "development";
let envFile = ".env";

if (env === "development") envFile = ".env.dev";
if (env === "test") envFile = ".env.test";

dotenv.config({ path: path.resolve(process.cwd(), envFile) });


    console.log(`Variables cargadas desde ${envFile}`);
  }

  getEnv(key: string): string {
    const value = process.env[key];
    if (value === undefined || value === null) {
      throw new Error(`La variable de entorno "${key}" no está definida.`);
    }
    return value;
  }
}
