const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const message = document.getElementById('message');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  loginButton.disabled = true;
  message.className = 'message';
  message.textContent = '';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('emailInput').value,
        password: document.getElementById('passwordInput').value
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Não foi possível entrar.');
    }

    localStorage.setItem('pm_session', data.token);
    window.location.href = '/admin';
  } catch (error) {
    message.textContent = error.message || 'Não foi possível entrar.';
    message.classList.add('error');
    loginButton.disabled = false;
  }
});
