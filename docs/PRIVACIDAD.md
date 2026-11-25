# Privacidad y tratamiento de datos

Documento operativo preliminar para revisión por asesoría legal en Guatemala. Describe el prototipo y decisiones aún pendientes; no es una política publicada ni asesoría jurídica.

## Datos y acceso

| Datos | Uso previsto | Acceso actual / limitaciones |
|---|---|---|
| Nombre, correo, hash de contraseña y estado de cuenta | Autenticación y operación | Cuenta y administración autorizada; la confirmación y recuperación por correo aún son de demostración |
| Nombre público, foto opcional, biografía, anuncios y reseñas aprobadas | Mostrar anunciantes y viviendas | Público cuando el perfil o anuncio está disponible; evitar datos personales en textos libres |
| Favoritos, mensajes y confirmaciones declaradas de visita | Gestionar interés y contacto | Participantes o titular según la operación; no prometer cifrado de extremo a extremo |
| Estado de revisión, reportes, apelaciones y auditoría | Confianza y moderación | Cuenta correspondiente y funciones administrativas según la ruta; falta un esquema granular de acceso |
| Fotografías de autorización | Revisión manual de autorización de publicación | Propietario y personal autorizado con motivo registrado; verificador solo para anuncios pendientes ajenos; archivos fuera de la carpeta pública |

El formulario de identidad indica que no se cargue DPI en la aplicación; la comprobación manual aún requiere un procedimiento y canal aprobados. La revisión de identidad y autorización es limitada: no prueba automáticamente la titularidad ni garantiza que una operación sea segura.

El nombre de registro puede usarse como nombre público cuando no se configuró otro nombre de perfil, y algunas respuestas de anuncios utilizan directamente el nombre de registro. Antes de recibir datos reales se debe resolver y probar esa exposición para no publicar inadvertidamente un nombre legal que la persona no haya elegido mostrar.

La evidencia nueva puede cifrarse en reposo cuando se configura `EVIDENCE_ENCRYPTION_KEY`; en desarrollo sin clave se puede guardar sin cifrar. Los archivos heredados sin cifrar no se migran automáticamente. La clave debe custodiarse fuera del repositorio y respaldarse por separado. No cargar documentación real en el entorno de demostración.

## Conservación y eliminación

La evidencia de anuncios tiene una caducidad configurable de 30 días por defecto y una limpieza periódica mientras el proceso se ejecuta. Este es un parámetro técnico, no un plazo legalmente aprobado ni una garantía de borrado de copias de seguridad. La conservación de cuentas, conversaciones, reseñas, reportes, auditorías y respaldos **aún no tiene plazos operativos aprobados ni eliminación integral automatizada**.

La cuenta puede registrar una solicitud de acceso, corrección o eliminación y consultar su estado. Una persona administradora puede pasarla a revisión y registrar una respuesta; el cambio de estado no modifica ni elimina datos automáticamente. Las solicitudes y respuestas quedan en SQLite y los cambios de estado generan avisos internos genéricos. Esta bandeja no sustituye un procedimiento legalmente aprobado ni demuestra que una solicitud se haya ejecutado: la ejecución, el control de identidad, las excepciones y el tratamiento de copias de seguridad siguen pendientes.

Antes de recibir datos reales debe definirse un canal efectivo, verificar la identidad de quien solicita, acordar con asesoría las excepciones justificadas, ejecutar la eliminación o restricción cuando corresponda y documentar el resultado. Debe contemplarse cuándo se eliminan las copias de respaldo y qué pasa al restaurarlas.

## Decisiones pendientes para revisión legal y operativa

- Identificar responsable del tratamiento, contacto, proveedores, ubicación de datos, destinatarios y transferencias.
- Determinar fundamentos, información que debe darse a usuarios, opciones de consentimiento y medios para ejercer sus derechos.
- Revisar conservación, evidencia de abuso, solicitudes de autoridades, incidentes, menores de edad y obligaciones aplicables en Guatemala.
- Publicar versiones revisadas e implementar su aceptación y el registro de fecha y versión. Ya existe un registro para el borrador de demostración, que no constituye aceptación de políticas definitivas.
- Completar revisión de respuestas públicas y registros para minimizar filtraciones, pruebas de autorización y revisión independiente de seguridad.
