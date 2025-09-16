// src/infrastructure/plugins/dotenv.plugin.ts
import "dotenv/config";

export class DotenvPlugin  {
  getEnv = (key: string): string|undefined =>
    process.env[key] ?? undefined
    // (() => {
    //   throw new Error(`La variable de entorno "${key}" no está definida.`);
    // })();
}