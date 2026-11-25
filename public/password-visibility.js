'use strict';

(() => {
  const showIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const hideIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 5.6A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15 15 0 0 1-3 3.6M6.1 6.2A15.6 15.6 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9.7 9.7 0 0 0 4.1-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  function enhance(input) {
    if (!input.isConnected || input.closest('.password-control')) return;
    const label = input.labels?.[0];
    const name = (label?.textContent || 'contraseña').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
    const wrapper = document.createElement('div');
    wrapper.className = 'password-control';
    const wrapped = input.closest('label') || input;
    wrapped.before(wrapper);
    wrapper.append(wrapped);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-control__toggle';
    const update = () => {
      const visible = input.type === 'text';
      const action = `${visible ? 'Ocultar' : 'Mostrar'} ${name}`;
      button.setAttribute('aria-label', action);
      button.setAttribute('title', action);
      button.setAttribute('aria-pressed', String(visible));
      button.innerHTML = visible ? hideIcon : showIcon;
    };
    button.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      update();
    });
    update();
    wrapper.append(button);
  }

  function scan(root) {
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if (root.matches('input[type="password"]')) enhance(root);
    root.querySelectorAll('input[type="password"]').forEach(enhance);
  }

  scan(document.body);
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) scan(node);
  }).observe(document.body, {childList: true, subtree: true});
})();
