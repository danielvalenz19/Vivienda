# Mapas de referencia

La base de anuncios solo contiene municipio y sector como texto. No hay coordenadas geográficas verificadas para cada vivienda ni límites de sectores fiables. Por eso el mapa marca únicamente un centro de referencia por ciudad, con el número de resultados visibles; no es la ubicación de ningún anuncio. La ficha explica la misma limitación. Los centros disponibles son Quetzaltenango y Ciudad de Guatemala. Otros municipios no se ubican de forma automática.

La aplicación carga Leaflet 1.9.4 desde `public/vendor/leaflet/` (licencia incluida). La ficha muestra el sector como texto, sin marcador ni coordenadas inventadas. El catálogo ofrece un mapa de referencia de ciudades al pulsar el botón y sus conteos corresponden a la página de resultados visible. Al mostrar el mapa, el navegador solicita teselas a OpenStreetMap, con atribución visible. Se requiere conexión; si fallan las teselas, se mantiene disponible el catálogo y se presenta un aviso. No se usan claves ni se solicita geolocalización del dispositivo.

El servidor público de teselas de OpenStreetMap está sujeto a su [política de uso](https://operations.osmfoundation.org/policies/tiles/). Antes de operar públicamente se debe evaluar esa política, el volumen esperado y un proveedor de teselas adecuado. La información geográfica por sector requiere una fuente validada y controles de privacidad antes de dibujar áreas más específicas.

Comprobación local: `npm run test:maps` cubre ambas ciudades, filtros, sector textual en la ficha, atribución, fallo de teselas y tamaño móvil, en base temporal.
