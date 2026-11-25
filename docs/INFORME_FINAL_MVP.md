# ViviendaGT — informe de avance y cierre local

Fecha: 25 de noviembre de 2026. La versión de esta carpeta es una **demostración funcional ampliada**, no una versión aprobada para un piloto con datos personales reales ni para producción pública. El encargo completo todavía tiene pendientes; esta conclusión no invalida las funciones locales que sí se implementaron y probaron.

## Situación anterior y cambios ejecutados

La aplicación ya tenía servidor Express, base SQLite, cuentas ficticias, catálogo, fichas, favoritos, borradores, fotos, revisión manual, chat, reseñas y moderación. Entre las brechas estaban la edición de anuncios publicados, sesiones solo en memoria, falta de MFA, búsquedas incompletas, ausencia de migraciones y respaldo probado, evidencias sin cifrado, mapas potencialmente engañosos y pruebas incompletas.

Durante esta etapa se implementó:

- Búsqueda desde SQLite con parámetros validados, filtros combinables, orden y paginación; filtros en URL y manejo de errores sin mostrar resultados sin filtrar como si fueran válidos.
- Edición de anuncios con controles de propiedad y reglas de revisión; fotos y controles de estados; prevención de cambios no autorizados y de fotos en anuncios suspendidos.
- Ubicación del sector como texto cuando no hay coordenadas fiables. El mapa de catálogo muestra referencias de ciudades, no la ubicación de una vivienda.
- Confirmaciones de disponibilidad con plazo configurable de 14 días por defecto, recordatorio interno, vencimiento persistente y reactivación condicionada; proceso idempotente y consultas públicas coherentes.
- Sesiones SQLite persistentes y revocables, rotación, cierre de todas las sesiones, cambio de contraseña y revocación administrativa con motivo.
- MFA TOTP para personal administrativo: activación opcional en demo, desafío cuando está activo, claves cifradas, límites de intentos y códigos de recuperación de un uso. La revisión adversarial corrigió un bypass del límite de intentos.
- Cifrado AES-256-GCM de nuevas evidencias cuando se configura la clave; restricciones por recurso, razón y auditoría. Las imágenes antiguas no se migran automáticamente y el desarrollo sin clave sigue guardando evidencias sin cifrar.
- Módulo SMTP configurable con tokens de un uso y corta duración, probado con transporte simulado; la demo conserva la recuperación separada mediante consola. No se ha comprobado entrega por proveedor real ni se exige aún confirmación de correo para iniciar sesión.
- Chat con sondeo, idempotencia de envío y lectura persistida por conversación; notificaciones internas por destinatario con lectura individual y completa.
- Roles `moderator` y `verifier` diferenciados de `admin`, con colas y permisos del servidor separados, exclusión de casos propios y acceso a evidencia con motivo. La asignación de roles para un entorno real no está terminada.
- Aceptación explícita, versión y fecha de políticas **de demostración**; estas políticas no son textos jurídicos definitivos.
- Migraciones versionadas, respaldo cifrado de SQLite y archivos, prueba de restauración en destino aislado, ESLint básico y validación de sintaxis. La versión 1 registra la línea base heredada; versiones 2 a 8 agregan índices, aceptación, MFA, reportes, privacidad, métricas y observaciones de identidad. Las ocho se aplicaron a la base de demo.
- CSRF con token vinculado a sesión, origen verificado y cobertura de formularios y cargas; revalidación transaccional de cupos y estado en subidas simultáneas.
- Reportes por anuncio, usuario, mensaje o reseña, con categorías, seguimiento y acceso auditado al contenido concreto; protección de la identidad del denunciante y conflictos de interés.
- Solicitudes persistentes de privacidad y panel de atención: cerrar una solicitud no borra datos automáticamente. Métricas agregadas sin conservar el texto de búsquedas.
- Correcciones y reenvío de revisión de identidad, y revocación con motivo que pausa anuncios activos.
- Galería ampliable con controles de teclado, desglose de costos y ajustes móviles; revisión visual automatizada en cuatro anchuras.

Las cuentas ficticias y sus contraseñas están en [DEMO.md](../DEMO.md). El seed es idempotente y no restaura contraseñas que se hayan modificado.

## Pruebas realmente ejecutadas

Al cierre de esta ejecución:

| Comprobación | Resultado |
|---|---|
| `npm test` | 35 aprobadas, 0 fallidas |
| `npm run test:e2e:all` | 25 aprobadas, 0 fallidas, en 14 configuraciones de Playwright |
| `npm run lint` | Correcto; reglas básicas de ESLint |
| `npm run check` | Correcto; 99 archivos JavaScript revisados en esa ejecución |
| `npm run audit:deps` | 0 vulnerabilidades conocidas reportadas en esa ejecución |
| Restauración local | Probada con base ficticia, WAL y archivos en destino independiente mediante `tests/migrations-backup.test.js` |
| Demo en el puerto 3000 | Catálogo respondió; ingreso de anunciante, interesado, moderador, verificador y administrador correcto; cuenta suspendida rechazada |

En la primera ejecución integral hubo un fallo de foco en la galería móvil. Se corrigió, la prueba se reforzó y pasó diez ejecuciones seguidas en móvil y escritorio; la suite integral posterior pasó completa.

Las capturas de la revisión están en `output/screenshots/mvp-2026-11-25/`, agrupadas por 390, 768, 1024 y 1440 píxeles. Incluyen estados vacíos, error de acceso y solicitudes pendientes y rechazadas. Las pruebas y capturas no sustituyen una auditoría independiente, revisión completa de accesibilidad, prueba de carga ni todos los recorridos A–J solicitados.

Antes de los cambios se ejecutó la línea base: 3 pruebas de API y 7 pruebas de navegador pasaron. Las pruebas usan datos ficticios y bases temporales; se corrigió el aislamiento de las carpetas de los fixtures.

## Riesgos y pendientes

- **Correo y cuentas:** falta proveedor SMTP configurado, entrega real y verificación integral; el ingreso todavía no exige correo confirmado. Los límites actuales necesitan revisión para el ambiente final.
- **MFA y permisos:** la activación de MFA es opcional en demo; faltan obligatoriedad para el piloto, recuperación supervisada cuando se pierden todos los factores, custodia/rotación independientes de clave y asignación protegida de roles y casos.
- **Seguridad y privacidad:** faltan revisión independiente del control CSRF y de autorización/DTO, CSP ajustada, ejecución operativa de solicitudes de eliminación, gestión de claves y tratamiento seguro de evidencias antiguas. Las claves y documentos reales no deben colocarse en la demo.
- **Funcionalidad:** quedan partes del alcance agrupado sin cerrar, como catálogo geográfico validado, recorrido integral de estados y correcciones, gestión completa de disputas, flujos administrativos adicionales y pruebas E2E A–J. El estado detallado está en [MATRIZ_MVP.md](MATRIZ_MVP.md).
- **Operación y legal:** faltan responsable y equipo de moderación/verificación, canales, simulacros, políticas revisadas por asesoría guatemalteca y procedimientos aplicables a datos e incidentes. Los borradores están en [POLITICAS_BORRADOR.md](POLITICAS_BORRADOR.md).
- **Infraestructura:** faltan alojamiento y TLS, monitoreo, almacenamiento y copias externas, custodia de secretos, proveedor de mapas apropiado, recuperación operativa y objetivos de RPO/RTO medidos. El respaldo local exige pausar escrituras para que archivos y base correspondan.

## Decisión

- **¿MVP funcional completo según el encargo?** No; existen funciones operativas en demo y requisitos agrupados todavía parciales o bloqueados.
- **¿Piloto privado con datos reales?** No todavía. Deben resolverse y verificarse los controles críticos y responsabilidades listados en [REQUISITOS_LANZAMIENTO.md](REQUISITOS_LANZAMIENTO.md).
- **¿Producción pública?** No. El arranque en producción está bloqueado deliberadamente.
- **¿Solo maquetación?** No. Hay frontend, servidor Express y persistencia SQLite local, pero eso no equivale a operación productiva segura.

La matriz cuenta estrictamente requisitos agrupados completos, no el porcentaje de código o funcionalidades construidas. Sus grupos parciales contienen trabajo y pruebas reales; el conteo estricto no debe interpretarse como ausencia de avances.

## Ejecución y recuperación

Ver [README.md](../README.md), [.env.example](../.env.example), [MIGRACIONES.md](MIGRACIONES.md) y [RESPALDO_RECUPERACION.md](RESPALDO_RECUPERACION.md). Los cambios se conservaron en la rama local `feature/mvp-completion`, con punto de recuperación y commits por áreas. No se hizo push ni despliegue.
