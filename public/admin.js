const adminStatus = document.getElementById('adminStatus');
const adminContent = document.getElementById('adminContent');
const logoutButton = document.getElementById('logoutButton');

function logout() {
  localStorage.removeItem('pm_session');
  window.location.href = '/login';
}

logoutButton.addEventListener('click', logout);

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function loadAdmin() {
  const token = localStorage.getItem('pm_session');

  if (!token) {
    return logout();
  }

  try {
    const response = await fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
      return logout();
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Erro ao carregar as estatísticas.');
    }

    document.getElementById('statCount').textContent = data.count;
    document.getElementById('statSize').textContent = formatBytes(data.totalBytes);
    adminStatus.classList.add('hidden');
    adminContent.classList.remove('hidden');
  } catch (error) {
    adminStatus.textContent = error.message || 'Erro ao carregar a área do casal.';
    adminStatus.classList.add('error');
  }
}

loadAdmin();
