(function() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabs = document.querySelectorAll('.auth-tab');
  const errorEl = document.getElementById('auth-error');
  const successEl = document.getElementById('auth-success');

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      loginForm.style.display = isLogin ? 'block' : 'none';
      registerForm.style.display = isLogin ? 'none' : 'block';
      hideMessages();
    });
  });

  // Password visibility toggles
  document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.querySelector('span').textContent = isHidden ? 'visibility' : 'visibility_off';
    });
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
    successEl.classList.remove('show');
  }
  function showSuccess(msg) {
    successEl.textContent = msg;
    successEl.classList.add('show');
    errorEl.classList.remove('show');
  }
  function hideMessages() {
    errorEl.classList.remove('show');
    successEl.classList.remove('show');
  }

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('login-email').value,
          password: document.getElementById('login-password').value,
          remember: document.getElementById('login-remember').checked
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Login failed');
        return;
      }
      window.location.href = '/';
    } catch (err) {
      showError('Network error. Please try again.');
    } finally {
      btn.disabled = false;
    }
  });

  // Register
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();
    const btn = document.getElementById('reg-btn');
    btn.disabled = true;
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('reg-email').value,
          password: document.getElementById('reg-password').value,
          display_name: document.getElementById('reg-name').value
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Registration failed');
        return;
      }
      window.location.href = '/';
    } catch (err) {
      showError('Network error. Please try again.');
    } finally {
      btn.disabled = false;
    }
  });

  // Check if already authenticated
  fetch('/api/auth/me').then(r => {
    if (r.ok) window.location.href = '/';
  }).catch(() => {});
})();
