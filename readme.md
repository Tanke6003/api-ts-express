# 📌 API TS Express

API base construida con **Node.js**, **Express 5**, **TypeScript**, documentada con **Swagger** y **Scalar API Reference**, con **JWT** para seguridad y **Sequelize** (SQL Server vía `tedious`). Incluye **Winston** para logging y **CORS**/**dotenv** para configuración.

---

## 🚀 Requisitos previos
- [Node.js](https://nodejs.org/) >= 18
- [npm](https://www.npmjs.com/) o [pnpm](https://pnpm.io/)

---

## 📦 Instalación
Clona el repositorio e instala dependencias:

```bash
git clone <repo-url>
cd api-ts-express
npm install
```

---

## 🛠️ Scripts disponibles
En el `package.json` están definidos los siguientes scripts:

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Corre la API en modo desarrollo con **Hot Reload** usando `tsx watch` |
| `npm run build` | Compila el proyecto con `tsc` y genera los archivos en `dist/` |
| `npm start` | Corre la API compilada desde `dist/main.js` |
| `npm run vercel-start` | Arranque para **Vercel** usando `tsx src/main.ts` |

---

## 📂 Estructura del proyecto

```plaintext
src/
 ├─ main.ts                 # Punto de entrada
 ├─ core/                   # Bootstrap (server, config/env, DI si aplica)
 │   └─ config/
 ├─ presentation/           # Capa HTTP: rutas, controladores, middlewares
 │   ├─ controllers/
 │   ├─ middlewares/
 │   └─ routes/
 ├─ application/            # Casos de uso, DTOs, mappers/servicios de aplicación
 │   ├─ dtos/
 │   └─ services/
 ├─ domain/                 # Entidades y contratos (interfaces) del dominio
 │   ├─ interfaces/
 │   └─ models/
 ├─ infrastructure/         # Implementaciones: repos, datasources, plugins
 │   ├─ datasources/
 │   ├─ plugins/            # Winston, etc.
 │   └─ repositories/
 └─ logs/                       # Archivos de log (recomendado en .gitignore)
```

> Los **middlewares que interceptan HTTP** (CORS, parsers, logging) viven en `presentation/middlewares` y se montan en el bootstrap (`core/server.ts` o `main.ts`) **antes** de registrar rutas.

---

## 📖 Documentación con Swagger y Scalar
Al ejecutar la API:
- **Swagger UI**: `http://localhost:3001/api/swagger`
- **Scalar**: `http://localhost:3001/api/scalar`

La especificación se genera con **swagger-jsdoc** y se sirve con **swagger-ui-express** y **Scalar**.

---

## 🔒 Seguridad (JWT)
Se configuró un esquema de autenticación con **JWT (Bearer Token)** en Swagger:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
security:
  - bearerAuth: []
```

En la UI puedes ingresar tu token con **Authorize** 🔑.

---

## ⚙️ Variables de entorno (ejemplo)
Crea un archivo `.env` en la raíz:

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=super_secret_key

# SQL Server (Sequelize + tedious)
DB_HOST=localhost
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=YourStrong!Passw0rd
DB_NAME=MyDatabase
DB_DIALECT=mssql
```

---

## 📚 Dependencias principales
- **express** `^5.1.0`
- **swagger-jsdoc** `^6.2.8`
- **swagger-ui-express** `^5.0.1` y **swagger-ui-dist** `^5.29.0`
- **@scalar/express-api-reference** `^0.8.18`
- **cors** `^2.8.5`
- **dotenv** `^17.2.2`
- **jsonwebtoken** `^9.0.2`
- **sequelize** `^6.37.7` + **tedious** `^18.6.1` (SQL Server)
- **winston** `^3.17.0` (logging)

### Dependencias de desarrollo
- **typescript** `^5.9.2`
- **tsx** `^4.20.5`
- **@types/** para Express, Node, CORS, Swagger, JWT, etc.
- **@vercel/node** `^2.3.0` (deploy serverless opcional)

---

## 🧰 Middlewares recomendados (HTTP)
- `cors()` → control de orígenes
- `express.json()` / `express.urlencoded()` → parseo de body
- `helmet()` (opcional) → cabeceras de seguridad
- `compression()` (opcional) → respuestas gzip
- Logging HTTP con **Winston** o **Morgan** (opcional)

> Montarlos **antes** de las rutas para interceptar todas las solicitudes.

---

## ▶️ Ejecución rápida

```bash
# Desarrollo (hot reload)
npm run dev

# Compilación
npm run build

# Producción (dist/)
npm start
```

---

## ✅ Checklist rápido
- `.env` configurado (PORT, JWT_SECRET, DB_*)
- Middlewares HTTP montados en `main.ts`/`core/server.ts`
- Endpoints de documentación activos: `/api/swagger` y `/api/scalar`
- Logs de aplicación en `logs/` (añade a `.gitignore`)

---

<!-- ## 📜 Licencia
ISC (ver `LICENSE` si aplica). -->
