# Estado de seguridad

La aplicación es una demostración local. Su configuración de producción está bloqueada explícitamente en el arranque; no debe desactivarse el bloqueo para recibir usuarios o datos reales sin completar y verificar los requisitos pendientes. La siguiente descripción se refiere al código, no a una certificación independiente.

## Controles existentes y límites

- Autenticación con contraseñas resumidas con bcrypt; sesiones SQLite persistentes, expiración, rotación de identificador, cierre de sesiones, revocación al cambiar contraseña y revocación administrativa con motivo. Las cookies usan HttpOnly y SameSite; Secure depende de producción, actualmente bloqueada.
- Rutas con controles de sesión, propiedad y rol, más comprobación de suspensión. Los roles `moderator` y `verifier` tienen colas separadas y no heredan el panel admin; se excluyen casos propios y el acceso del verificador a evidencia se limita a anuncios pendientes con motivo auditado. Faltan asignación administrativa protegida, casos asignados y permisos más finos.
- La mensajería limita acceso a participantes, comprueba bloqueos y admite identificadores para evitar duplicados en reintentos. La lectura solo puede marcar mensajes dirigidos a la cuenta en el hilo correspondiente. Se pueden reportar mensajes recibidos; la revisión muestra únicamente el mensaje reportado con motivo auditado. No hay cifrado de extremo a extremo.
- Las fotografías pasan por Sharp, que valida contenido y quita metadatos al transformar. La evidencia de autorización se guarda fuera de `public/`, con acceso administrativo sujeto a motivo y registro. La evidencia nueva puede cifrarse con AES-256-GCM si se configura `EVIDENCE_ENCRYPTION_KEY`; en desarrollo sin clave se guarda sin cifrar. La evidencia heredada no se cifra automáticamente.
- El vencimiento técnico de evidencia es configurable y por defecto de 30 días; la limpieza funciona mientras corre el servidor. Esto no equivale a una política legal aprobada ni borra copias ya respaldadas.
- El registro exige aceptación de una versión de condiciones marcada como **borrador de demo**, con fecha y versión. No equivale a aceptación de futuros textos legales.
- El MFA TOTP para administración, moderación y verificación puede activarse voluntariamente en demo y, una vez activo, exige un desafío por sesión; incluye ocho códigos de recuperación de un uso, límites persistentes y secreto cifrado. Se probó mediante API y navegador. La activación no es obligatoria en la demo; todavía faltan recuperación supervisada, gestión independiente de la clave y revisión externa.
- El módulo SMTP configurable almacena hashes de tokens de corta duración y un solo uso y responde de forma genérica a solicitudes de recuperación. Solo se ha comprobado mediante transporte de prueba; la demo imprime códigos locales por una ruta distinta. No se ha validado entrega real.
- Se dispone de respaldo cifrado y restauración local comprobada con datos ficticios; base y archivos requieren pausa de escrituras para capturarse coherentemente. Las claves deben mantenerse aparte.
- Las mutaciones requieren origen o Referer confiable y un token CSRF vinculado a la sesión, incluidas cargas multipart y autenticación demo. Se rechazan solicitudes de origen cruzado y tokens ajenos; la prueba local no sustituye una auditoría independiente ni protege contra XSS.
- Las cargas revalidan estado, propiedad y cupos en transacción después de procesar archivos, y descartan solo los archivos de la solicitud que no se puede completar. Se probaron subidas simultáneas y suspensiones concurrentes; no existe análisis antimalware.

## Pendientes antes de un piloto con datos reales

- MFA obligatorio para todo el personal del piloto, recuperación supervisada, gestión independiente de clave y auditoría; asignación segura y permisos más granulares.
- SMTP real, controles de abuso y enumeración, entrega y recuperación verificadas; credenciales y proveedor aún no configurados.
- Revisar independientemente CSRF y autorización horizontal/vertical; completar CSP, protección frente a XSS, rate limiting adecuado a la infraestructura y revisión de dependencias y secretos.
- Configurar cifrado de evidencia y custodia/rotación de clave; migrar de manera segura archivos antiguos sin cifrar; validar almacenamiento privado y retención.
- Completar minimización de respuestas públicas y datos de registro, eliminación de cuenta, políticas y procedimientos revisados por asesoría legal en Guatemala.
- Configurar TLS, monitoreo, copias externas y restauración ensayada con claves y ambiente aislado. Documentar y medir RPO/RTO.
- Ejecutar revisión independiente de seguridad, pruebas A–J completas y simulacros de moderación y respuesta a incidentes. Una auditoría propia no sustituye esa revisión.

Los límites básicos almacenados en memoria o SQLite no son una estrategia distribuida. SQLite admite un escritor a la vez y el tiempo de espera ante bloqueo puede bloquear temporalmente el proceso; se requieren pruebas de carga y diseño apropiado para varias instancias. La documentación y las pruebas locales no acreditan conformidad legal o de seguridad para producción.
