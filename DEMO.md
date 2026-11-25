# Datos de demostración

Todos los usuarios, mensajes, reportes, precios y anuncios de esta base son ficticios. Las fotografías son de ambientación (Unsplash), no corresponden a inmuebles disponibles y se guardan localmente para la demostración. No contactar a nadie por estos anuncios. Las credenciales son solo para uso local.

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administración y moderación | admin@demo.vivienda.gt | Demo2026! |
| Moderación | moderador@demo.vivienda.gt | Demo2026! |
| Verificación | verificador@demo.vivienda.gt | Demo2026! |
| Cuenta suspendida (no puede iniciar sesión) | suspendido@demo.vivienda.gt | Demo2026! |
| Anunciante aprobado | anunciante@demo.vivienda.gt | Demo2026! |
| Segunda anunciante aprobada | anunciante2@demo.vivienda.gt | Demo2026! |
| Persona interesada | inquilino@demo.vivienda.gt | Demo2026! |
| Anunciante pendiente | pendiente@demo.vivienda.gt | Demo2026! |
| Anunciante rechazado | rechazado@demo.vivienda.gt | Demo2026! |

Para inicializar la base aislada, ejecutar `node scripts/seed-demo.js`. Después, iniciar el servidor con `npm run demo` desde la carpeta del proyecto y abrir http://localhost:3000. Si el puerto ya está en uso, detener el servidor anterior antes de iniciar este. La base normal `vivienda.sqlite` no se toca. Ejecutar el script de nuevo no duplica los registros iniciales ni restaura los cambios hechos durante las pruebas.

La cuenta interesada tiene favoritos y una conversación de ejemplo. El anunciante aprobado tiene anuncios publicados y uno pausado. Administración tiene un anuncio, una solicitud de identidad y un reporte pendientes. Las revisiones son marcas ficticias, no verificaciones reales.

## Recuperación y confirmación locales

Al activar el módulo de demostración con `DEMO_AUTH=1` y la base `demo.sqlite`, una solicitud de recuperación o confirmación genera un código de un solo uso que aparece únicamente en la consola donde corre el servidor. El código vence a los 15 minutos. Los formularios de demostración no envían correos y no son aptos para producción. El restablecimiento de contraseña revoca las sesiones existentes.

Hay además un módulo SMTP configurable e independiente de la demo. Su envío se probó con un transporte simulado; no se ha comprobado la entrega con un proveedor real. No configurés ni uses direcciones de personas reales para la demo.

## Estados de prueba

La base inicial contiene anuncios ficticios en Xela y Ciudad de Guatemala, con estados activos, pausado, pendiente y rechazado; las reseñas y visitas también son ficticias. Existe una reseña publicada, otra pendiente y una apelación pendiente. Las cuentas de moderación y verificación tienen permisos separados; los casos propios quedan excluidos de sus colas y no pueden resolverlos. Si se actualiza o modifica una cuenta demo, el script conserva esos cambios y no restaura su contraseña. La disponibilidad vence por defecto a los 14 días de la última confirmación, por lo que la cantidad visible cambia con el tiempo y las acciones de prueba.

Las imágenes de ambientación proceden de Unsplash (identificadores `photo-1522708323590-d24dbb6b0267`, `photo-1493809842364-78817add7ffb`, `photo-1560448204-e02f11c3d0e2`, `photo-1505693416388-ac5ce068fe85`, `photo-1484154218962-a197022b5858`); se utilizan únicamente para pruebas de interfaz y no representan inmuebles reales. Comprobar las condiciones de uso y atribución de cada imagen antes de cualquier publicación.

La solicitud de anuncio pendiente incluye una imagen de autorización completamente ficticia que permite probar la revisión. Sus archivos se guardan en `demo-private-evidence/`; las fotos subidas durante la demo usan `demo-uploads/`. Ambas carpetas están separadas de los archivos del entorno normal. Esta imagen no representa una autorización real.
