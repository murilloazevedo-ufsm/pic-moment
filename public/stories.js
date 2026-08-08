document.body.insertAdjacentHTML('beforeend', `
  <div id="storyViewer" class="story-viewer hidden">
    <div class="story-progress" id="storyProgress"></div>
    <button type="button" id="storyViewerClose" class="story-overlay-close" aria-label="Fechar">×</button>
    <video id="storyVideo" playsinline></video>
    <img id="storyImage" class="hidden" alt="Story" />
    <p id="storyCaption" class="story-caption hidden"></p>
    <div class="story-tap story-tap-left" id="storyPrevTap"></div>
    <div class="story-tap story-tap-right" id="storyNextTap"></div>
  </div>

  <div id="storyRecorder" class="story-recorder hidden">
    <button type="button" id="storyRecorderClose" class="story-overlay-close" aria-label="Fechar">×</button>

    <div id="recorderLive">
      <video id="recorderPreview" autoplay muted playsinline></video>
      <div class="recorder-controls">
        <div class="recorder-toolbar">
          <span class="toolbar-spacer" aria-hidden="true"></span>
          <div class="mode-toggle" role="group" aria-label="Tipo de story">
            <button type="button" id="modePhoto" class="mode-chip active">Foto</button>
            <button type="button" id="modeVideo" class="mode-chip">Vídeo</button>
          </div>
          <button type="button" id="flipCameraButton" class="flip-button" aria-label="Alternar câmera">⟲</button>
        </div>
        <span id="recordTimer" class="record-timer hidden">15s</span>
        <button type="button" id="recordButton" class="record-button" aria-label="Capturar"></button>
        <p id="recorderHint" class="recorder-hint">Toque para tirar uma foto</p>
      </div>
    </div>

    <div id="recorderReview" class="hidden">
      <video id="reviewVideo" class="hidden" playsinline loop></video>
      <img id="reviewImage" class="hidden" alt="Pré-visualização" />
      <div class="recorder-controls">
        <textarea id="captionInput" class="caption-input" maxlength="500" rows="1"
          placeholder="Escreva uma legenda (opcional)"></textarea>
        <div class="review-actions">
          <button type="button" id="retakeButton" class="secondary-button">Repetir</button>
          <button type="button" id="sendStoryButton" class="primary-button">Compartilhar</button>
        </div>
        <p id="recorderMessage" class="message recorder-message" role="status" aria-live="polite"></p>
      </div>
    </div>
  </div>
`);

const storiesBar = document.getElementById('storiesBar');
const storyAddButton = document.getElementById('storyAddButton');

const storyViewer = document.getElementById('storyViewer');
const storyProgress = document.getElementById('storyProgress');
const storyVideo = document.getElementById('storyVideo');
const storyImage = document.getElementById('storyImage');
const storyCaption = document.getElementById('storyCaption');

const storyRecorder = document.getElementById('storyRecorder');
const recorderLive = document.getElementById('recorderLive');
const recorderPreview = document.getElementById('recorderPreview');
const recorderReview = document.getElementById('recorderReview');
const reviewVideo = document.getElementById('reviewVideo');
const reviewImage = document.getElementById('reviewImage');
const recordButton = document.getElementById('recordButton');
const recordTimer = document.getElementById('recordTimer');
const recorderHint = document.getElementById('recorderHint');
const recorderMessage = document.getElementById('recorderMessage');
const captionInput = document.getElementById('captionInput');
const modePhotoButton = document.getElementById('modePhoto');
const modeVideoButton = document.getElementById('modeVideo');
const sendButton = document.getElementById('sendStoryButton');

const STORY_MAX_SECONDS = 15;
const PHOTO_STORY_SECONDS = 6;

let stories = [];
let currentStory = 0;
let photoTimer = null;

let captureMode = 'photo';
let cameraFacing = 'user';
let mediaStream = null;
let mediaRecorder = null;
let recordedBlob = null;
let recordedType = null;
let posterBlob = null;
let recordTimeout = null;
let countdownInterval = null;

/* ---------- Barra de stories ---------- */

function renderBar() {
  storiesBar.querySelectorAll('.story-item-media').forEach((node) => node.remove());

  stories.forEach((story, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'story-item story-item-media';

      const ring = document.createElement('span');
      ring.className = 'story-ring';

      if (story.posterUrl) {
        const poster = document.createElement('img');
        poster.src = story.posterUrl;
        poster.alt = 'Story';
        poster.addEventListener('error', () => {
          poster.remove();
          ring.classList.add('story-ring-fallback');
        });
        ring.appendChild(poster);
      } else {
        ring.classList.add('story-ring-fallback');
      }

      item.appendChild(ring);
      item.addEventListener('click', () => openViewer(index));
      storiesBar.appendChild(item);
    });

  const storiesCounter = document.getElementById('storiesCounter');

  if (storiesCounter) {
    const label = stories.length === 1 ? 'story compartilhado' : 'stories compartilhados';
    storiesCounter.textContent = `🎞️ ${stories.length} ${label}`;
    storiesCounter.classList.remove('hidden');
  }
}

async function loadStories(fresh) {
  try {
    const url = fresh ? `/api/stories?fresh=${Date.now()}` : '/api/stories';
    const response = await fetch(url);
    const data = await response.json();

    if (!data.success) {
      return;
    }

    stories = data.stories;
    renderBar();
  } catch (err) {
    // barra de stories é opcional: falha silenciosa
  }
}

/* ---------- Player ---------- */

function renderProgress() {
  storyProgress.innerHTML = '';

  stories.forEach((story, index) => {
    const track = document.createElement('span');
    track.className = 'story-progress-track';

    const fill = document.createElement('span');
    fill.className = 'story-progress-fill';
    fill.style.transition = 'none';

    if (index < currentStory) {
      fill.style.width = '100%';
    }

    track.appendChild(fill);
    storyProgress.appendChild(track);
  });
}

function currentFill() {
  const track = storyProgress.children[currentStory];

  return track ? track.firstChild : null;
}

function clearPhotoTimer() {
  clearTimeout(photoTimer);
  photoTimer = null;
}

function showCaption(story) {
  if (story.caption) {
    storyCaption.textContent = story.caption;
    storyCaption.classList.remove('hidden', 'expanded');
  } else {
    storyCaption.classList.add('hidden');
  }
}

function playStory(index) {
  if (index < 0) {
    index = 0;
  }

  if (index >= stories.length) {
    return closeViewer();
  }

  currentStory = index;
  renderProgress();
  clearPhotoTimer();

  const story = stories[index];
  showCaption(story);

  if (story.mediaType === 'photo') {
    storyVideo.pause();
    storyVideo.removeAttribute('src');
    storyVideo.load();
    storyVideo.classList.add('hidden');

    storyImage.classList.remove('hidden');
    storyImage.classList.add('story-switching');
    storyImage.src = story.url;

    const fill = currentFill();

    if (fill) {
      requestAnimationFrame(() => {
        fill.style.transition = `width ${PHOTO_STORY_SECONDS}s linear`;
        fill.style.width = '100%';
      });
    }

    photoTimer = setTimeout(() => playStory(index + 1), PHOTO_STORY_SECONDS * 1000);
  } else {
    storyImage.classList.add('hidden');
    storyImage.removeAttribute('src');

    storyVideo.classList.remove('hidden');
    storyVideo.classList.add('story-switching');
    storyVideo.src = story.url;
    storyVideo.play().catch(() => {});
  }
}

function openViewer(index) {
  storyViewer.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  playStory(index);
}

function closeViewer() {
  storyViewer.classList.add('hidden');
  clearPhotoTimer();
  storyVideo.pause();
  storyVideo.removeAttribute('src');
  storyVideo.load();
  storyImage.removeAttribute('src');
  document.body.style.overflow = '';
}

storyVideo.addEventListener('playing', () => {
  storyVideo.classList.remove('story-switching');
});

storyImage.addEventListener('load', () => {
  storyImage.classList.remove('story-switching');
});

storyVideo.addEventListener('error', () => {
  if (!storyViewer.classList.contains('hidden') && storyVideo.getAttribute('src')) {
    playStory(currentStory + 1);
  }
});

storyImage.addEventListener('error', () => {
  if (!storyViewer.classList.contains('hidden') && storyImage.getAttribute('src')) {
    playStory(currentStory + 1);
  }
});

storyVideo.addEventListener('timeupdate', () => {
  const fill = currentFill();

  if (fill && storyVideo.duration && stories[currentStory] && stories[currentStory].mediaType !== 'photo') {
    fill.style.width = `${(storyVideo.currentTime / storyVideo.duration) * 100}%`;
  }
});

storyVideo.addEventListener('ended', () => playStory(currentStory + 1));
storyCaption.addEventListener('click', () => storyCaption.classList.toggle('expanded'));
document.getElementById('storyPrevTap').addEventListener('click', () => playStory(currentStory - 1));
document.getElementById('storyNextTap').addEventListener('click', () => playStory(currentStory + 1));
document.getElementById('storyViewerClose').addEventListener('click', closeViewer);

/* ---------- Gravador ---------- */

function pickMimeType() {
  const candidates = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];

  return candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
}

function setRecorderMessage(text, isError) {
  recorderMessage.textContent = text;
  recorderMessage.className = 'message recorder-message';

  if (isError) {
    recorderMessage.classList.add('error');
  }
}

function setCaptureMode(mode) {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    return;
  }

  captureMode = mode;
  modePhotoButton.classList.toggle('active', mode === 'photo');
  modeVideoButton.classList.toggle('active', mode === 'video');
  recordTimer.classList.toggle('hidden', mode === 'photo');
  recordButton.classList.toggle('photo-mode', mode === 'photo');
  recorderHint.textContent = mode === 'photo'
    ? 'Toque para tirar uma foto'
    : 'Toque para gravar um momento de até 15 segundos';
}

async function startCamera(facing) {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing },
    audio: true
  });

  cameraFacing = facing;
  recorderPreview.srcObject = mediaStream;
  recorderPreview.classList.toggle('mirrored', facing === 'user');
}

async function openRecorder() {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    alert('Seu navegador não suporta captura de câmera. Tente pelo celular.');
    return;
  }

  try {
    await startCamera(cameraFacing);
  } catch (err) {
    alert('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    return;
  }

  recorderLive.classList.remove('hidden');
  recorderReview.classList.add('hidden');
  recordButton.classList.remove('recording');
  recordTimer.textContent = `${STORY_MAX_SECONDS}s`;
  recordedBlob = null;
  posterBlob = null;
  captionInput.value = '';
  sendButton.disabled = false;
  setCaptureMode(captureMode);
  setRecorderMessage('');
  storyRecorder.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeRecorder() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  clearTimeout(recordTimeout);
  clearInterval(countdownInterval);
  reviewVideo.pause();
  storyRecorder.classList.add('hidden');
  document.body.style.overflow = '';
}

function captureFrame(maxSize, square) {
  const width = recorderPreview.videoWidth || 720;
  const height = recorderPreview.videoHeight || 1280;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (square) {
    const side = Math.min(width, height);
    canvas.width = maxSize;
    canvas.height = maxSize;
    context.drawImage(recorderPreview, (width - side) / 2, (height - side) / 2, side, side, 0, 0, maxSize, maxSize);
  } else {
    const scale = Math.min(1, maxSize / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(recorderPreview, 0, 0, canvas.width, canvas.height);
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}

async function capturePhoto() {
  try {
    recordedBlob = await captureFrame(1600, false);
    recordedType = 'photo';
    posterBlob = await captureFrame(480, true);
  } catch (err) {
    setRecorderMessage('Não foi possível capturar a foto. Tente novamente.', true);
    return;
  }

  if (!recordedBlob) {
    setRecorderMessage('Não foi possível capturar a foto. Tente novamente.', true);
    return;
  }

  reviewImage.src = URL.createObjectURL(recordedBlob);
  reviewImage.classList.remove('hidden');
  reviewVideo.classList.add('hidden');
  recorderLive.classList.add('hidden');
  recorderReview.classList.remove('hidden');
}

function startRecording() {
  const chunks = [];
  const mimeType = pickMimeType();

  try {
    mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
  } catch (err) {
    alert('Não foi possível iniciar a gravação neste navegador.');
    return;
  }

  posterBlob = null;
  captureFrame(480, true).then((blob) => { posterBlob = blob; }).catch(() => {});

  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  mediaRecorder.addEventListener('stop', () => {
    clearTimeout(recordTimeout);
    clearInterval(countdownInterval);
    recordButton.classList.remove('recording');

    recordedBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'video/webm' });
    recordedType = 'video';
    reviewVideo.src = URL.createObjectURL(recordedBlob);
    reviewVideo.classList.remove('hidden');
    reviewImage.classList.add('hidden');
    reviewVideo.play().catch(() => {});
    recorderLive.classList.add('hidden');
    recorderReview.classList.remove('hidden');
  });

  mediaRecorder.start();
  recordButton.classList.add('recording');

  let remaining = STORY_MAX_SECONDS;
  recordTimer.textContent = `${remaining}s`;

  countdownInterval = setInterval(() => {
    remaining -= 1;
    recordTimer.textContent = `${Math.max(0, remaining)}s`;
  }, 1000);

  recordTimeout = setTimeout(() => {
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }, STORY_MAX_SECONDS * 1000);
}

recordButton.addEventListener('click', () => {
  if (captureMode === 'photo') {
    capturePhoto();
  } else if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  } else {
    startRecording();
  }
});

document.getElementById('flipCameraButton').addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    return;
  }

  try {
    await startCamera(cameraFacing === 'user' ? 'environment' : 'user');
  } catch (err) {
    setRecorderMessage('Não foi possível alternar a câmera.', true);
  }
});

document.getElementById('retakeButton').addEventListener('click', () => {
  reviewVideo.pause();
  recordedBlob = null;
  recorderLive.classList.remove('hidden');
  recorderReview.classList.add('hidden');
  recordTimer.textContent = `${STORY_MAX_SECONDS}s`;
});

sendButton.addEventListener('click', async () => {
  if (!recordedBlob) {
    return;
  }

  sendButton.disabled = true;
  setRecorderMessage('Enviando seu momento...');

  try {
    const contentType = recordedType === 'photo' ? 'image/jpeg' : recordedBlob.type.split(';')[0];

    const response = await fetch('/api/story-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: contentType, size: recordedBlob.size })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Erro ao preparar o story.');
    }

    const upload = await fetch(data.url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000' },
      body: recordedBlob
    });

    if (!upload.ok) {
      throw new Error('Falha ao enviar. Tente novamente.');
    }

    if (posterBlob) {
      try {
        await fetch(data.posterUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=31536000' },
          body: posterBlob
        });
      } catch (err) {
        // sem pôster o story mostra o anel padrão
      }
    }

    try {
      await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: data.path,
          mediaType: recordedType,
          caption: captionInput.value.trim()
        })
      });
    } catch (err) {
      // sem registro o story aparece sem legenda
    }

    // aparece imediatamente na barra, sem esperar o cache da listagem
    const localStory = {
      url: URL.createObjectURL(recordedBlob),
      posterUrl: posterBlob ? URL.createObjectURL(posterBlob) : null,
      mediaType: recordedType,
      caption: captionInput.value.trim() || null
    };

    closeRecorder();
    stories.push(localStory);
    renderBar();
    loadStories(true);
  } catch (error) {
    setRecorderMessage(error.message || 'Erro ao enviar o story.', true);
  } finally {
    sendButton.disabled = false;
  }
});

modePhotoButton.addEventListener('click', () => setCaptureMode('photo'));
modeVideoButton.addEventListener('click', () => setCaptureMode('video'));
storyAddButton.addEventListener('click', openRecorder);
document.getElementById('storyRecorderClose').addEventListener('click', closeRecorder);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!storyViewer.classList.contains('hidden')) {
      closeViewer();
    }

    if (!storyRecorder.classList.contains('hidden')) {
      closeRecorder();
    }
  }
});

loadStories();
