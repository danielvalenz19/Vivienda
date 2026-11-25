# Recorridos de usuario y límites

Estos flujos describen la demo local; los mecanismos manuales y los textos preliminares no representan una operación real.

1. **Visitante:** explorar y combinar filtros, ordenar, abrir una vivienda y consultar el perfil público. El sector se muestra como texto cuando no existen datos geográficos confiables. El catálogo conserva filtros en la URL.
2. **Cuenta:** registrarse aceptando las políticas de demostración y entrar con su contraseña. La aceptación y su versión se guardan. El correo demo imprime códigos en la consola local; SMTP está preparado y probado con transporte simulado. Todavía no se exige confirmación de correo para iniciar sesión.
3. **Persona interesada:** guardar o quitar favoritos; contactar a un anunciante; abrir una conversación por vivienda y persona; bloquear; registrar una visita y confirmarla con la otra parte; enviar una valoración para moderación.
4. **Anunciante:** configurar perfil, pedir revisión manual de identidad, guardar y retomar un borrador, agregar fotos y evidencia privada ficticia, previsualizar y enviar a revisión. Administrar y editar el inventario, responder mensajes, consultar cambios de estado y confirmar disponibilidad. Cambios sensibles vuelven a revisión.
5. **Personal de demo:** moderación atiende reseñas y reportes; verificación revisa identidades, anuncios y evidencia privada con motivo. Las colas excluyen casos propios. Administración conserva las herramientas generales de moderación, suspensiones, apelaciones y auditoría. El MFA está disponible y es opcional en demo; el piloto requiere hacerlo obligatorio y contar con recuperación supervisada.

La confirmación bilateral de visita es una declaración de las personas participantes y no comprueba que la visita haya ocurrido. La confirmación manual de identidad o autorización no garantiza propiedad legal ni seguridad.

Para cobertura ejecutada, consultá [INFORME_FINAL_MVP.md](INFORME_FINAL_MVP.md) y las pruebas en `tests/`. La existencia de un flujo no implica que todas sus variantes, mensajes de error, permisos o aspectos de accesibilidad hayan sido verificados.
