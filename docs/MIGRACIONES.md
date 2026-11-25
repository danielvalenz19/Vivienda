# Migraciones de base de datos

El registro `schema_migrations` guarda número, nombre, suma SHA-256 y fecha de aplicación. `migrations.js` comprueba el historial y aplica las migraciones nuevas en una transacción SQLite; un historial distinto o una versión desconocida detienen el arranque. Las migraciones son consecutivas e inmutables: agregá una versión nueva en lugar de editar una ya aplicada.

La versión 1 **registra como línea base el esquema heredado**; no crea ni migra por sí sola las tablas originales. Durante esta transición el servidor todavía inicializa ese esquema con sus instrucciones idempotentes en `server.js` y módulos de rutas. Por ello es necesario invocar `migrate(db)` después de crear las tablas heredadas requeridas. La versión 2 agrega índices; la 3 crea el registro de aceptación de políticas de demostración; la 4 las tablas de MFA; la 5 los reportes ampliados; la 6 las solicitudes de privacidad; la 7 métricas agregadas; y la 8 la respuesta a observaciones de identidad. Las ocho se aplicaron a la base demo durante esta ejecución.

Para una base existente, respaldá y probá la restauración antes de actualizar. El arranque aplicará las versiones pendientes. Para una base nueva, primero se crea el esquema heredado y después se registran las migraciones. No se implementó reversión automática: en caso de fallo, la transacción no se confirma; si una versión ya se aplicó, la recuperación es por respaldo o mediante una nueva migración correctiva.

La prueba `node --test tests/migrations-backup.test.js` comprueba la conservación de datos, la repetición sin cambios, detección de historial alterado y rollback ante una migración inválida. Una migración futura debe incluir pruebas de actualización desde bases anteriores y de fallo.
