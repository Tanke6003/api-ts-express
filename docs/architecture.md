## Project Structure

The project follows a **modular and layered architecture** to ensure **scalability, maintainability, and separation of concerns**.  
Each folder represents a specific layer of the application, following **Clean Architecture principles**:

- **`core/`**: Bootstrapping and global configuration (environment variables, DI container setup).  
- **`presentation/`**: HTTP layer with routes, controllers, and middlewares.  
- **`application/`**: Business logic layer, including services and DTOs for data transfer.  
- **`domain/`**: Domain layer with entities and interfaces representing core business models.  
- **`infrastructure/`**: Implements repositories, plugins (e.g., logging, upload), and data sources.  
- **`logs/`**: Stores log files (should be ignored in version control).  
- **`upload/`**: Local storage for uploaded files.  

This organization allows you to **easily swap or remove components**, maintain **clean separation between layers**, and **scale the API** without tightly coupling modules.

```plaintext
src/
 ├─ main.ts                        # Punto de entrada de la aplicación
 ├─ core/                          # Bootstrap y configuración global
 │   ├─ config/                    # Configuraciones (env, db, server, etc.)
 │   └─ di/                        # Inyección de dependencias (tsyringe)
 ├─ presentation/                  # Capa HTTP: rutas, controladores, middlewares
 │   ├─ controllers/               # Controladores que manejan requests/responses
 │   ├─ middlewares/               # Middlewares de Express
 │   └─ routes/                    # Definición de rutas
 ├─ application/                   # Casos de uso, lógica de negocio y mappers
 │   ├─ dtos/                      # Data Transfer Objects
 │   └─ services/                  # Servicios de aplicación
 ├─ domain/                        # Entidades y contratos del dominio
 │   ├─ interfaces/                # Interfaces del dominio
 │   └─ models/                    # Modelos de dominio
 ├─ infrastructure/                # Implementaciones concretas: repos, datasources, plugins
 │   ├─ datasources/               # Conexión a DB, API externas, etc.
 │   ├─ plugins/                   # Plugins: Winston, Pino, otros
 │   └─ repositories/              # Repositorios que implementan interfaces del dominio
 │   
 ├─ logs/                          # Archivos de log (añadir a .gitignore)
 └─ upload/                        # almacen de archivos subidos en local

```
