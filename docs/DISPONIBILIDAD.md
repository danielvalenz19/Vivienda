# Disponibilidad de los anuncios

Un anuncio activo necesita una confirmación periódica. El intervalo inicial es de 14 días. `AVAILABILITY_DAYS` permite definir un entero entre 1 y 365; `AVAILABILITY_REMINDER_DAYS` define cuántos días antes se envía el recordatorio (por defecto 2, nunca mayor que el intervalo). Una configuración inválida impide arrancar el servicio.

La búsqueda, la ficha y las fotografías verifican la fecha en el servidor. Así, un retraso en el proceso periódico no deja visible un anuncio vencido. Al llegar al plazo exacto el anuncio sigue disponible; queda vencido después del plazo. El proceso convierte `active` a `expired` y el disparador de notificaciones avisa del cambio de estado. Una confirmación válida actualiza `confirmed` y comienza un nuevo ciclo.

`availability.setup(db)` crea la tabla `availability_events` sin tocar los datos existentes. Tras configurar las notificaciones, `availability.run(db)` verifica vencimientos y crea recordatorios en una transacción. La clave `(listing, confirmed, kind)` impide duplicar un recordatorio al repetir el proceso en el mismo ciclo. No genera recordatorios ni modifica publicaciones pausadas, alquiladas, rechazadas o suspendidas. `run(db,{now,days,reminderDays})` admite fechas controladas para pruebas.

Los recordatorios son internos y persistentes: no implican envío por correo. El temporizador solo opera mientras el servidor está encendido; al reiniciar, la siguiente ejecución procesa los vencimientos pendientes. Para un servicio con varias instancias o reinicios debe mantenerse una programación operativa supervisada. La prueba automatizada `node --test tests/availability.test.js` comprueba fechas límite, reejecución, nuevos ciclos y configuraciones inválidas con una base SQLite en memoria.
