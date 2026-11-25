# Arquitectura de ViviendaGT

La aplicación es un monolito Node.js 24/Express que sirve HTML, CSS y JavaScript desde `public/` y conserva datos en SQLite. Por defecto escucha únicamente en `127.0.0.1`. El cliente usa rutas hash, conserva filtros en la URL y consulta rutas HTTP JSON. Poppins y Leaflet se sirven localmente; el fondo de mapas depende de teselas externas. No se ha migrado a React, TypeScript ni PostgreSQL.

## Responsabilidades actuales

- `server.js`: arranque, sesiones, rutas principales, autorización, revisión, conversación y reputación. Sigue concentrando demasiadas responsabilidades.
- `search-route.js` y `extended-routes.js`: búsqueda, borradores y datos de propiedades y perfiles.
- `photo-routes.js`, `profile-photo-routes.js`, `evidence-routes.js`: fotografías y evidencia en carpetas separadas de los recursos estáticos; Sharp valida y transforma imágenes.
- `suspension-routes.js`, `notification-routes.js` y `availability.js`: restricciones, notificaciones persistidas y ciclo de disponibilidad. La expiración se verifica además al consultar, y el proceso periódico corre mientras la aplicación está encendida.
- `staff-routes.js`: colas de verificación y moderación con roles distintos, comprobaciones de conflictos propios y acceso a evidencia según rol. La asignación protegida de roles y casos aún no existe.
- `chat-read-routes.js`: marca como leídos solamente mensajes recibidos de un hilo específico; la bandeja calcula sus no leídos y se actualiza periódicamente.
- `safety-report-routes.js`: reportes por anuncio, persona, mensaje o reseña, con contexto puntual y acceso administrativo auditado. `privacy-request-routes.js` registra solicitudes de derechos y sus respuestas; no borra la cuenta automáticamente.
- `metrics-routes.js`: conteos operativos agregados por día sin guardar el texto de las búsquedas; las demás cifras se calculan desde datos persistidos. `csrf.js` exige origen confiable y token de sesión para mutaciones.
- `session-store.js`: sesiones SQLite con identificadores resumidos mediante hash, caducidad y revocación.
- `mfa-routes.js`: TOTP voluntario en demo para administración, moderación y verificación, desafíos por sesión, códigos de recuperación de un uso e intentos limitados. El secreto se cifra con una clave derivada del secreto de sesión; falta una clave independiente y recuperación supervisada.
- `mail-auth-routes.js`: integración SMTP configurable; tokens de corta vida y un uso. Las pruebas usan un transporte inyectado; no se ha comprobado una entrega real. `auth-demo-routes.js` mantiene la simulación local separada.
- `migrations.js`: historial de migraciones y cambios versionados. La versión 1 registra la línea base heredada; no reemplaza las tablas y columnas que algunos módulos aún crean al arrancar. Las versiones 2–8 agregan índices, aceptación de políticas demo, MFA, reportes, solicitudes de privacidad, métricas y observaciones de identidad.
- `scripts/backup.js`: respaldo consistente de SQLite y copia cifrada de carpetas; la consistencia conjunta requiere detener las escrituras. Ver [recuperación](RESPALDO_RECUPERACION.md).

El catálogo consulta únicamente anuncios activos y vigentes de anunciantes no suspendidos. Los mensajes se asocian a propiedad y participantes; el identificador de cliente permite evitar duplicados por reintento y `read_at` registra la lectura del destinatario. Las reseñas requieren declaraciones de visita por ambas partes y moderación; esas declaraciones no prueban independientemente que la visita ocurrió.

## Ambientes y límites

`DB_PATH`, `PHOTO_DIR`, `PROFILE_PHOTO_DIR` y `EVIDENCE_DIR` permiten separar datos. `npm run demo` utiliza base y carpetas demo; `DEMO_AUTH=1` habilita códigos simulados en consola. `EVIDENCE_ENCRYPTION_KEY` habilita cifrado de evidencia nueva; sin clave en desarrollo pueden existir archivos sin cifrar. SMTP, secretos y demás variables deben configurarse fuera del repositorio.

El registro exige aceptar la versión preliminar identificada como demo y registra versión y fecha; eso no es aceptación de políticas legales finales. El arranque con `NODE_ENV=production` se rechaza explícitamente mientras faltan controles críticos. No cargar datos personales reales en la demo.

## Evolución y validación

El esquema heredado y la lógica concentrada en `server.js` dificultan cambios y pruebas. Conviene extraer servicios por dominio, mover gradualmente la inicialización a migraciones versionadas y estandarizar validación/errores. Si se requiere escalar a varias instancias, evaluar PostgreSQL, almacenamiento privado externo, colas y sesiones compartidas mediante un ADR con costos y plan de transición; no se justifica una reescritura completa solo por preferencia de framework.

`npm test` ejecuta pruebas Node con datos temporales; `npm run test:e2e` y configuraciones Playwright adicionales cubren recorridos seleccionados; `npm run check` valida sintaxis, `npm run lint` ejecuta ESLint y `npm run audit:deps` consulta vulnerabilidades de dependencias. Ninguno sustituye pruebas E2E completas, revisión de seguridad independiente, pruebas de carga o conformidad de accesibilidad. Ver la [matriz](MATRIZ_MVP.md) y resultados reales del informe final.
