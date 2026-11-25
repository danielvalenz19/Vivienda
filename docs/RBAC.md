# Autorización y responsabilidades

Las cuentas normales pueden actuar como personas interesadas y anunciantes. Además existen los roles administrativos `moderator`, `verifier` y `admin`. Todos son valores de `users.role` y se validan en el servidor; los botones no son el límite de seguridad. La asignación dinámica de roles todavía no existe: las cuentas adicionales se crean únicamente con la semilla de demo. Su asignación y recuperación operativas requieren un procedimiento protegido y auditado antes de un piloto.

| Capacidad | Cuenta normal | Moderación | Verificación | Administración |
|---|---|---|---|---|
| Usar su propia cuenta, anuncios y conversaciones | Sí, sujeto a propiedad y bloqueos | Sí | Sí | Sí |
| Consultar cola de reportes y reseñas pendientes | No | Sí, excluye casos propios | No | Sí |
| Resolver reportes y moderar reseñas | No | Sí, excluye casos propios | No | Sí, no puede moderar reseñas propias |
| Consultar y decidir identidades y anuncios pendientes | No | No | Sí, excluye los propios | Sí, excluye los propios |
| Consultar evidencia de autorización ajena | No | No | Solo anuncio pendiente, con motivo y auditoría | Con motivo y auditoría |
| Gestión general de usuarios, suspensiones, apelaciones o auditoría | No | No | No | Sí |
| Consultar conversaciones sin ser participante | No | No | No | No existe acceso indiscriminado |

Los endpoints de las colas están separados en `/api/staff/verification` y `/api/staff/moderation`; los roles restringidos no pueden consultar `/api/admin`. Una persona verificadora no puede aprobar su propia identidad ni sus propios anuncios. Una persona moderadora no puede resolver un reporte en que participa ni moderar una reseña propia. Los accesos a documentos privados quedan registrados con motivo y no se otorgan a moderación.

Cada rol administrativo puede activar MFA. Cuando está activo, las operaciones de su rol exigen completar el segundo factor en la sesión; la configuración actual no lo impone de manera predeterminada en demo. Producción permanece bloqueada. Persisten pendientes: asignación de casos, privilegios más finos, motivos obligatorios en todas las decisiones, MFA obligatorio y recuperación operativa para todo el personal, revisiones independientes y pruebas de seguridad adicionales. El registro SQLite no es inmutable frente a quien controle el servidor.

`node --test tests/staff-roles.test.js` comprueba permisos positivos y negativos por rol, exclusión de casos propios, acceso auditado a evidencia y desafío MFA después de activarlo. La comprobación no sustituye una auditoría independiente.

## Reportes de seguridad

Una cuenta puede reportar un anuncio accesible, una persona con la que interactuó o un anunciante público, una reseña publicada o un mensaje específico recibido. No puede consultar ni reportar mensajes ajenos, ni reportarse a sí misma mediante estos recursos. La cola de moderación no incluye la identidad de la persona denunciante ni el identificador interno del recurso; el acceso al contenido concreto requiere un motivo y se audita. El contexto de mensajes expone únicamente el mensaje reportado, no el historial de la conversación. Los casos propios se excluyen de la cola y sus participantes no pueden resolverlos mediante estos endpoints.

El envío genera un identificador y permite consultar el estado desde «Mis reportes». Al cerrar el caso se envía una notificación interna genérica; la resolución interna no se muestra al denunciante ni se divulga a la persona denunciada. El sistema contempla categorías y prioridad alta para amenazas, pero no asigna responsables ni incorpora archivos adjuntos, automatización de respuesta a emergencias o investigación fuera de la plataforma. Su operación y la conservación de datos requieren políticas revisadas legalmente.
