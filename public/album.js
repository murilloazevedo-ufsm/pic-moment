const albumGrid = document.getElementById('albumGrid');
const albumStatus = document.getElementById('albumStatus');
const momentsCounter = document.getElementById('momentsCounter');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxClose = document.getElementById('lightboxClose');

function openLightbox(photo) {
  lightboxImage.src = photo.url;
  lightboxImage.alt = photo.name;
  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImage.src = '';
  document.body.style.overflow = '';
}

lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox || event.target === lightboxClose) {
    closeLightbox();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeLightbox();
  }
});

async function loadAlbum() {
  try {
    const response = await fetch('/api/photos');
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Erro ao carregar as fotos.');
    }

    const photos = data.photos;
    const label = photos.length === 1 ? 'momento compartilhado' : 'momentos compartilhados';
    momentsCounter.textContent = `♥ ${photos.length} ${label}`;
    momentsCounter.classList.remove('hidden');

    if (photos.length === 0) {
      albumStatus.textContent = 'Ainda não há fotos por aqui. Seja a primeira pessoa a compartilhar um momento!';
      return;
    }

    albumStatus.classList.add('hidden');

    photos.forEach((photo) => {
      const figure = document.createElement('figure');
      figure.className = 'album-item';

      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = photo.name;
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(photo));
      img.addEventListener('error', () => figure.remove());

      figure.appendChild(img);
      albumGrid.appendChild(figure);
    });
  } catch (error) {
    albumStatus.textContent = error.message || 'Erro ao carregar as fotos.';
    albumStatus.classList.add('error');
  }
}

loadAlbum();
