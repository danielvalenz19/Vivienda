# Respaldo y recuperación

`scripts/backup.js` crea una copia SQLite consistente mediante la API de respaldo de Node, incluyendo transacciones registradas en WAL. Incluye por separado las carpetas de fotos de anuncios, fotos de perfil y evidencias privadas. El archivo resultante se cifra y autentica con AES-256-GCM, con clave derivada mediante scrypt de una frase suministrada por `BACKUP_PASSPHRASE`. La frase se almacena aparte y no se incluye en el respaldo. Nunca guardés claves reales en el repositorio.

**La copia de la base y la copia de archivos no ocurren atómicamente entre sí.** Para un respaldo recuperable, detené el servidor o bloqueá todas las escrituras de usuarios durante toda la operación. El respaldo de SQLite sí funciona con WAL, pero por sí solo no garantiza que la versión de cada archivo corresponda a la base. También se crean archivos temporales sin cifrar en un directorio privado del sistema, que se eliminan al finalizar; usá un disco temporal cifrado para información sensible. El archivo final se crea con permisos restrictivos y no se sobrescribe uno existente.

Ejemplo en una terminal, desde la carpeta del proyecto. La lectura silenciosa evita escribir la frase en el historial de comandos:

```sh
read -rs BACKUP_PASSPHRASE
export BACKUP_PASSPHRASE
DB_PATH="$PWD/demo.sqlite" PHOTO_DIR="$PWD/demo-uploads" PROFILE_PHOTO_DIR="$PWD/demo-profile-photos" EVIDENCE_DIR="$PWD/demo-private-evidence" node scripts/backup.js create /ruta/protegida/demo-2026-11-25.vgt
node scripts/backup.js restore /ruta/protegida/demo-2026-11-25.vgt /ruta/nueva/restauracion
unset BACKUP_PASSPHRASE
```

El destino de restauración no debe existir. Se autentica el archivo, se validan rutas y tipos de archivo y se ejecuta `PRAGMA integrity_check` antes de copiarlo al destino. La restauración contiene `database.sqlite`, `photos/`, `profile-photos/`, `evidence/` y `manifest.json`. Para probar el servicio recuperado en aislamiento, configurá `DB_PATH`, `PHOTO_DIR`, `PROFILE_PHOTO_DIR` y `EVIDENCE_DIR` apuntando a esas rutas y usá otro puerto y secretos. No señalés la app de producción a la restauración hasta verificarla.

La configuración no secreta necesaria para reconstruir el ambiente debe documentarse por separado. Las claves de sesión, claves de cifrado y credenciales de proveedores deben respaldarse mediante un gestor de secretos independiente; el archivo no incluye `.env` ni secretos. La pérdida de la frase impide recuperar el respaldo.

## Verificación y operación

`node --test tests/migrations-backup.test.js` crea una base ficticia con WAL activo y tres carpetas de archivos ficticios, ejecuta el respaldo cifrado, restaura en otra ruta y comprueba contenido e integridad de SQLite y archivos. También verifica frase incorrecta y no sobrescritura. Esta prueba demuestra la restauración local de datos de prueba; no verifica todavía un despliegue remoto ni un plan de recuperación productivo.

Para un piloto, definir y aprobar con quien opere el servicio: copias al menos diarias y antes de cambios de esquema; retención y destino cifrado fuera del equipo; responsables y acceso; una restauración de prueba periódica. La frecuencia real y el tiempo de recuperación (RTO) y pérdida máxima (RPO) se deben medir y acordar: aún no existen valores operativos garantizados ni almacenamiento externo configurado. Guardar varias generaciones y verificar su integridad; un archivo creado no es prueba de restauración.
