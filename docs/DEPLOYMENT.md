# Ejecución y preparación de despliegue

**No desplegar para usuarios reales con el estado actual.** El servidor bloquea el arranque con `NODE_ENV=production`. Ese bloqueo solo debe revisarse tras implementar y verificar los controles restantes, incluida revisión independiente de seguridad y legal.

En desarrollo se requiere Node.js 24 y las variables de [.env.example](../.env.example). El archivo es descriptivo; el servidor no lo lee automáticamente. El proceso escucha en interfaz local. La demo usa `npm run demo:seed` y `npm run demo`, con base y carpetas separadas.

Antes de un piloto real hay que definir infraestructura y responsables: TLS, proxy y origen permitido; secretos en gestor dedicado; correo probado con proveedor; almacenamiento privado cifrado y gestión de claves; migración segura de evidencias antiguas; monitoreo, registro mínimo y respuesta a incidentes; revisión independiente de CSRF y límites de abuso apropiados; respaldos cifrados externos y restauración ensayada. El [documento de requisitos](REQUISITOS_LANZAMIENTO.md) detalla bloqueantes y evidencias.

Las sesiones y los datos están en SQLite local. Para respaldar, pausar todas las escrituras y seguir [RESPALDO_RECUPERACION.md](RESPALDO_RECUPERACION.md). No copiar solamente el archivo principal de SQLite con el servidor activo: WAL puede contener transacciones necesarias. Guardar claves por separado, no en Git ni dentro del respaldo.
