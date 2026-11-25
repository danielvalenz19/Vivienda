# ViviendaGT — aplicación local

Marketplace de apartamentos y habitaciones residenciales para Quetzaltenango y Ciudad de Guatemala. La aplicación usa Node.js 24, Express y SQLite, con un cliente HTML/CSS/JavaScript. El servidor escucha en la computadora local. La demo utiliza datos ficticios y almacenamiento separado de la base normal.

## Ejecutar la demostración

Desde esta carpeta:

```sh
npm install
npm run demo:seed
npm run demo
```

Abrí http://localhost:3000. Las cuentas y contraseñas, el alcance de los datos y la recuperación simulada están en [DEMO.md](DEMO.md). Repetir el seed no borra la actividad existente ni restaura contraseñas cambiadas. Si ya hay otro servidor en el puerto, cerralo antes de iniciar la versión actual. No se requieren servicios externos para la mayor parte de la demo; el mapa de ciudades solicita teselas por internet.

La demo permite explorar y filtrar, ver fichas y perfiles, gestionar favoritos y conversaciones, publicar y editar anuncios, revisar disponibilidad, registrar visitas y reseñas, consultar notificaciones y probar la moderación manual. Las verificaciones de la demo no son comprobaciones reales.

## Comprobaciones

```sh
npm test
npm run test:e2e
npm run test:e2e:all
npm run test:maps
npm run lint
npm run check
npm run audit:deps
```

Las configuraciones adicionales de Playwright para edición, cuenta, notificaciones, favoritos y propietario están en `tests/`. Las pruebas crean bases y carpetas temporales; no requieren credenciales reales. Las capturas se guardan en `output/screenshots/`. Consultá [tests/README.md](tests/README.md) para conocer límites y dependencias del navegador.

## Configuración y operación

Las variables admitidas están documentadas en [.env.example](.env.example); el archivo es un ejemplo y **no se carga automáticamente**. El cifrado de evidencias nuevas requiere una clave configurada; sin clave, el entorno local guarda esas imágenes sin cifrar. La configuración SMTP es opcional y se ha probado con un transporte simulado, no con un proveedor real. La aplicación no cuenta todavía con los controles y revisiones necesarios para recibir información personal real.

Las migraciones son incrementales; la primera registra el esquema heredado, que sigue inicializándose desde los módulos existentes. Antes de migrar datos importantes, prepará y comprobá una copia. Los respaldos y su restauración se describen en [RESPALDO_RECUPERACION.md](docs/RESPALDO_RECUPERACION.md): para que la base y los archivos correspondan hay que detener las escrituras durante el respaldo.

El arranque en producción está bloqueado deliberadamente mientras faltan controles y validación independientes. La [matriz del MVP](docs/MATRIZ_MVP.md), [arquitectura](docs/ARQUITECTURA.md), [seguridad](docs/SEGURIDAD.md) y [requisitos de lanzamiento](docs/REQUISITOS_LANZAMIENTO.md) distinguen lo implementado de lo pendiente. No cargar DPI ni documentos reales.

La ficha muestra el sector como texto si no existe una ubicación confiable; el mapa del catálogo indica referencias de ciudad, no la posición de cada vivienda. Detalles en [MAPAS.md](docs/MAPAS.md).
