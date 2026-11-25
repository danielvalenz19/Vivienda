# Requisitos para un piloto y lanzamiento

Estado preliminar basado en el código local. La demostración con datos ficticios no equivale a un piloto con información personal real. Producción se bloquea explícitamente en el arranque; no debe levantarse el bloqueo sin completar y verificar los controles necesarios.

## Bloqueantes para recibir usuarios y datos reales

| Área | Pendiente y responsable por definir | Evidencia requerida |
|---|---|---|
| Seguridad administrativa | Hacer MFA obligatorio para el piloto, definir recuperación supervisada y gestión independiente de clave; proteger la asignación de roles y precisar permisos | Ya existen colas y roles separados con pruebas locales; faltan asignación/casos, pruebas más amplias y revisión independiente |
| Cuenta y correo | Configurar proveedor SMTP real; completar confirmación, recuperación y control de enumeración y abuso | Entrega real en entorno de pruebas y pruebas de tokens/recuperación; el transporte inyectado ya se prueba localmente |
| Archivos y secretos | Configurar cifrado y custodia de clave de evidencia; migrar o retirar de forma segura archivos heredados sin cifrar; almacenamiento y permisos privados | Prueba de restauración con claves, revisión de acceso y rotación |
| Seguridad web | Revisar independientemente CSRF y autorización, completar CSP y límites de abuso adecuados a la infraestructura | Suite reproducible, hallazgos atendidos y auditoría independiente |
| Privacidad y legal | Responsable y canal reales, políticas revisadas, aceptación versionada de políticas finales, solicitudes de datos y conservación | Aprobación de asesoría guatemalteca y recorridos probados; la aceptación actual es solo del borrador demo |
| Operación | Equipo, horarios, canales y procedimientos para verificación, reportes, apelaciones e incidentes | Simulacros documentados y responsables designados |
| Infraestructura | TLS, proveedor y configuración de despliegue, secretos, monitoreo y copias externas cifradas | Prueba de restauración aislada y validación de acceso, RTO y RPO medidos |
| Funciones y calidad | Terminar recorridos incompletos, permisos granulares y pruebas A–J; revisar accesibilidad y móviles | Resultados reproducibles, evidencias y corrección de fallos críticos |

## Trabajo local ya disponible, con límites

Existen usuarios, anuncios, favoritos, mensajes persistidos, revisión manual con correcciones y revocación, reseñas moderadas, reportes por recurso y solicitudes de privacidad, además de herramientas administrativas. La base y la autenticación de demostración están separadas. Se añadieron respaldos cifrados y restauración comprobable con datos ficticios; aún falta operar y verificar respaldos reales en el ambiente elegido. Las sesiones tienen almacenamiento SQLite y revocación; el MFA es opcional en demo y falta revisión integral de seguridad.

La evidencia puede cifrarse con una clave configurada; sin ella en desarrollo se permiten archivos sin cifrar. La demo conserva confirmación y recuperación simuladas; además existe integración SMTP configurable probada con transporte de prueba, sin entrega real comprobada ni proveedor configurado. La revisión de identidad no es una verificación automatizada y el producto no acredita por sí solo titularidad legal.

## Decisión de liberación

Una persona responsable debe revisar la matriz de requisitos, resultados reales de pruebas, riesgos abiertos y evidencia de operación antes de autorizar cualquier piloto. Piloto privado y producción pública requieren decisiones separadas; no deben darse por aprobados solo por contar con una demo o un respaldo de prueba. Servicios de correo, hosting, almacenamiento externo, asesoría y auditoría siguen dependiendo de proveedores o personas aún no configurados.
