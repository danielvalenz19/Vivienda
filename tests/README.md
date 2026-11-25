# Pruebas locales

Requiere Node.js 24. Las pruebas de navegador usan Google Chrome en `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` por defecto; en otro equipo puede indicarse `PLAYWRIGHT_CHROME`. Los fixtures usan SQLite y directorios temporales para fotos, perfiles y evidencias. No utilizan ni modifican `vivienda.sqlite` o `demo.sqlite`.

```sh
npm test
npm run test:e2e
npm run test:e2e:all
npm run test:maps
npx playwright test --config tests/owner.playwright.config.js
npx playwright test --config tests/favorites-visual.config.js
npx playwright test --config tests/edit-marketplace.playwright.config.js
npx playwright test --config tests/gallery.playwright.config.js
npx playwright test --config tests/account-security.playwright.config.js
npx playwright test --config tests/notifications.playwright.config.js
npx playwright test --config tests/chat-unread.playwright.config.js
npx playwright test --config tests/staff.playwright.config.js
npx playwright test --config tests/privacy.playwright.config.js
npx playwright test --config tests/safety-reports.playwright.config.js
npx playwright test --config tests/verification.playwright.config.js
npx playwright test --config tests/visual-audit.playwright.config.js
npm run lint
npm run check
npm run audit:deps
```

`npm test` ejecuta pruebas Node de integración y unidades: cuentas, permisos, anuncios, búsqueda, evidencias cifradas, fotografías, sesiones, correo simulado, disponibilidad, notificaciones, mensajes, migraciones y restauración local, entre otras. Las pruebas exactas y el último resultado real están en [INFORME_FINAL_MVP.md](../docs/INFORME_FINAL_MVP.md).

Playwright usa datos ficticios y cubre recorridos y capturas de escritorio y móvil. La prueba visual revisa desbordamiento del documento y errores de JavaScript; esto no sustituye la inspección humana, ni certifica accesibilidad. Las capturas están en `output/screenshots/`.

El correo se prueba con un transporte simulado, sin proveedor real. La restauración usa datos ficticios en un destino distinto. Ni las pruebas ni `npm audit` sustituyen una revisión independiente de seguridad, una auditoría de accesibilidad completa, pruebas de carga o asesoría legal. Algunos recorridos A–J del encargo todavía no están completos de extremo a extremo; la matriz identifica los pendientes.
