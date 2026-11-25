'use strict';
window.ViviendaAccountSecurity={
 render(box,{api,refresh,nav,toast,user}){
  box.innerHTML=`<div class="account-security"><h2>Seguridad de tu cuenta</h2>
    <p class="subtle">Administrá tu contraseña y las sesiones abiertas.</p>
    <section class="account-security-section"><h3>Cambiar contraseña</h3>
    <p>Al cambiarla se cerrarán todas tus sesiones, incluida esta.</p>
    <form id="change-password-form" class="auth-form">
      <div class="field"><label for="current-password">Contraseña actual</label><input id="current-password" name="current_password" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="new-password">Nueva contraseña</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required aria-describedby="password-help"><small id="password-help">Usá entre 8 y 128 caracteres.</small></div>
      <div class="field"><label for="confirm-password">Confirmar nueva contraseña</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>
      <p class="error" role="alert" tabindex="-1"></p><button class="button" type="submit">Cambiar contraseña</button>
    </form></section>
    <section class="account-security-section"><h3>Sesiones abiertas</h3><p>Cerrá tu sesión en todos tus dispositivos. También saldrás de este dispositivo.</p>
      <form id="logout-all-form"><p class="error" role="alert" tabindex="-1"></p><button class="button secondary" type="submit">Cerrar todas las sesiones</button></form>
    </section>${['admin','moderator','verifier'].includes(user.role)?'<section class="account-security-section" id="mfa-settings"><h3>Verificación en dos pasos</h3><p>Cargando…</p></section>':''}</div>`;
  function formState(form,busy,label){const button=form.querySelector('button[type=submit]');button.disabled=busy;button.textContent=label;form.setAttribute('aria-busy',String(busy))}
  function failure(form,message){const field=form.querySelector('[role=alert]');field.textContent=message;field.focus()}
  async function exit(message){await refresh();nav('#/');toast(message)}
  box.querySelector('#change-password-form').addEventListener('submit',async e=>{
   e.preventDefault();const f=e.currentTarget,data=new FormData(f);f.querySelector('[role=alert]').textContent='';
   if(data.get('password')!==data.get('confirmation'))return failure(f,'Las contraseñas nuevas no coinciden.');
   formState(f,true,'Guardando…');try{await api('/account/password',{current_password:data.get('current_password'),password:data.get('password')});f.reset();await exit('Contraseña actualizada. Iniciá sesión de nuevo.')}catch(err){failure(f,err.message)}finally{formState(f,false,'Cambiar contraseña')}
  });
  box.querySelector('#logout-all-form').addEventListener('submit',async e=>{
   e.preventDefault();const f=e.currentTarget;if(!window.confirm('¿Querés cerrar todas tus sesiones, incluida esta?'))return;
   f.querySelector('[role=alert]').textContent='';formState(f,true,'Cerrando sesiones…');try{await api('/account/logout-all',{});await exit('Se cerraron todas tus sesiones.')}catch(err){failure(f,err.message)}finally{formState(f,false,'Cerrar todas las sesiones')}
  });
  if(['admin','moderator','verifier'].includes(user.role))this.settings(box.querySelector('#mfa-settings'),{api});
 },
 async settings(box,{api}){
  try{
   const status=await api('/mfa/status');
   if(status.enabled){box.innerHTML='<h3>Verificación en dos pasos</h3><p>Está activada para tu cuenta administrativa.</p>';if(!status.verified)this.challenge(box,{api,onSuccess:()=>this.settings(box,{api}),heading:'Confirmá tu identidad para continuar'});return}
   box.innerHTML=`<h3>Verificación en dos pasos</h3><p>Agregá tu cuenta a una aplicación autenticadora. Guardá los códigos de recuperación en un lugar seguro.</p><form class="auth-form" id="mfa-setup-form"><div class="field"><label for="mfa-password">Contraseña actual</label><input id="mfa-password" name="current_password" type="password" autocomplete="current-password" required></div><p class="error" role="alert" tabindex="-1"></p><button class="button secondary" type="submit">Configurar verificación</button></form>`;
   const form=box.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button'),alert=form.querySelector('[role=alert]');button.disabled=true;button.textContent='Preparando…';alert.textContent='';try{const result=await api('/mfa/setup',{current_password:new FormData(form).get('current_password')});form.reset();box.innerHTML=`<h3>Vinculá tu aplicación</h3><p>Ingresá esta clave manualmente en tu aplicación autenticadora y escribí el código de seis dígitos que genera. La clave vence en 10 minutos.</p><p><strong class="mfa-secret"></strong></p><form class="auth-form" id="mfa-activation-form"><div class="field"><label for="mfa-activation-code">Código de seis dígitos</label><input id="mfa-activation-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></div><p class="error" role="alert" tabindex="-1"></p><button class="button" type="submit">Activar verificación</button></form>`;box.querySelector('.mfa-secret').textContent=result.secret;const activation=box.querySelector('form');activation.onsubmit=async ev=>{ev.preventDefault();const btn=activation.querySelector('button'),err=activation.querySelector('[role=alert]');btn.disabled=true;btn.textContent='Activando…';err.textContent='';try{const enabled=await api('/mfa/activate',{code:new FormData(activation).get('code')});box.innerHTML='<h3>Guardá tus códigos de recuperación</h3><p>La verificación está activa. Estos códigos se muestran una sola vez; cada uno funciona una vez si perdés el acceso a tu aplicación.</p><pre class="mfa-recovery-codes"></pre><p>No compartás estos códigos.</p>';box.querySelector('pre').textContent=enabled.recovery_codes.join('\n')}catch(ex){err.textContent=ex.message;err.focus();btn.disabled=false;btn.textContent='Activar verificación'}}}catch(ex){alert.textContent=ex.message;alert.focus();button.disabled=false;button.textContent='Configurar verificación'}};
  }catch(err){box.textContent='No se pudo cargar la verificación en dos pasos: '+err.message}
 },
 challenge(box,{api,onSuccess,heading='Verificación en dos pasos'}){
  box.innerHTML=`<h2>${heading}</h2><p>Ingresá el código de tu aplicación autenticadora o uno de tus códigos de recuperación.</p><form class="auth-form" id="mfa-challenge-form"><div class="field"><label for="mfa-code">Código de verificación o recuperación</label><input id="mfa-code" name="code" autocomplete="one-time-code" maxlength="27" required></div><p class="error" role="alert" tabindex="-1"></p><button type="submit" class="button">Verificar y continuar</button></form>`;
  const form=box.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button'),alert=form.querySelector('[role=alert]');button.disabled=true;button.textContent='Verificando…';alert.textContent='';try{await api('/mfa/challenge',{code:new FormData(form).get('code')});form.reset();await onSuccess()}catch(err){alert.textContent=err.message;alert.focus();button.disabled=false;button.textContent='Verificar y continuar'}};
 }
};
