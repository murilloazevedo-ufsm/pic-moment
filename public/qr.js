document.body.insertAdjacentHTML('beforeend', `
  <div id="qrOverlay" class="qr-overlay hidden">
    <div class="qr-card">
      <button type="button" id="qrClose" class="qr-close" aria-label="Fechar">×</button>
      <h3>Compartilhe também!</h3>
      <img id="qrImage" alt="QR Code para abrir esta página" />
      <p class="qr-hint">Aponte a câmera do celular para participar</p>
      <p id="qrUrl" class="qr-url"></p>
    </div>
  </div>
`);

const qrOverlay = document.getElementById('qrOverlay');
const qrImage = document.getElementById('qrImage');
const qrUrl = document.getElementById('qrUrl');

function openQr() {
  const pagePath = window.location.pathname.startsWith('/inara-e-lucas/album')
    ? '/inara-e-lucas/album'
    : '/inara-e-lucas';

  qrImage.src = `/api/qr.png?path=${encodeURIComponent(pagePath)}`;
  qrUrl.textContent = `${window.location.host}${pagePath}`;
  qrOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeQr() {
  qrOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('qrButton').addEventListener('click', openQr);
document.getElementById('qrClose').addEventListener('click', closeQr);

qrOverlay.addEventListener('click', (event) => {
  if (event.target === qrOverlay) {
    closeQr();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !qrOverlay.classList.contains('hidden')) {
    closeQr();
  }
});
