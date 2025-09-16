 # 📌 API TS Express

 API base construida con **Node.js**, **Express 5**, **TypeScript**, y documentada con **Swagger**.  
 Incluye soporte para **Scalar API Reference** y configuración de seguridad con **JWT**.

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

 | Script        | Descripción |
 |---------------|-------------|
 | `npm run dev` | Corre la API en modo desarrollo con **Hot Reload** usando `tsx watch` |
 | `npm run build` | Compila el proyecto con `tsc` y genera los archivos en `dist/` |
 | `npm start` | Corre la API compilada desde `dist/main.js` |

 ---

 ## 📂 Estructura del proyecto

 ```plaintext
 src/
  ├─ main.ts                # Punto de entrada principal
  ├─ presentation/          # Rutas y controladores
  ├─ application/           # DTOs, servicios de aplicación
  ├─ domain/                # Interfaces y lógica de dominio
  └─ infrastructure/        # Configuración, persistencia, etc.
 ```

 ---

 ## 📖 Documentación con Swagger

 El proyecto usa **swagger-jsdoc** + **swagger-ui-express**.  
 Al ejecutar la API:

 - **UI Swagger**: [http://localhost:3000/docs](http://localhost:3000/docs)  
 - **Especificación JSON**: [http://localhost:3000/swagger.json](http://localhost:3000/swagger.json)  

 Este JSON se puede importar en **Postman** para probar los endpoints.

 ---

 ## 🔒 Seguridad

 Se configuró un esquema de autenticación con **JWT (Bearer Token)** en Swagger:

 ```yaml
 components:
   securitySchemes:
     bearerAuth:
       type: http
       scheme: bearer
       bearerFormat: JWT
 ```

 En la UI puedes ingresar tu token con el botón **Authorize** 🔑.

 ---

 ## 📚 Dependencias principales

 - **express** `^5.1.0`  
 - **swagger-jsdoc** `^6.2.8`  
 - **swagger-ui-express** `^5.0.1`  
 - **@scalar/express-api-reference** `^0.8.18`  
 - **cors**, **dotenv**  

 ### Dependencias de desarrollo
 - **typescript** `^5.9.2`  
 - **tsx** `^4.20.5`  
 - **@types/** (para Express, Node, CORS, Swagger)  

 ---

 ## 📌 Próximos pasos
 - Añadir controladores y rutas personalizadas.  
 - Definir **DTOs** en `src/application/dtos/`.  
 - Documentar cada endpoint con bloques `@openapi`.  
