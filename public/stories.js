const storiesBar = document.getElementById('storiesBar');
const storyAddButton = document.getElementById('storyAddButton');

const storyViewer = document.getElementById('storyViewer');
const storyProgress = document.getElementById('storyProgress');
const storyVideo = document.getElementById('storyVideo');

const storyRecorder = document.getElementById('storyRecorder');
const recorderLive = document.getElementById('recorderLive');
const recorderPreview = document.getElementById('recorderPreview');
const recorderReview = document.getElementById('recorderReview');
const reviewVideo = document.getElementById('reviewVideo');
const recordButton = document.getElementById('recordButton');
const recordTimer = document.getElementById('recordTimer');
const recorderMessage = document.getElementById('recorderMessage');

const STORY_MAX_SECONDS = 15;

let stories = [];
let currentStory = 0;

let mediaStream = null;
let mediaRecorder = null;
let recordedBlob = null;
let posterBlob = null;
let recordTimeout = null;
let countdownInterval = null;

/* ---------- Barra de stories ---------- */

async function loadStories() {
  try {
    const response = await fetch('/api/stories');
    const data = await response.json();

    if (!data.success) {
      return;
    }

    stories = data.stories;
    storiesBar.querySelectorAll('.story-item-video').forEach((node) => node.remove());

    stories.forEach((story, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'story-item story-item-video';

      const ring = document.createElement('span');
      ring.className = 'story-ring';

      const poster = document.createElement('img');
      poster.src = story.posterUrl;
      poster.alt = 'Story';
      poster.addEventListener('error', () => {
        poster.remove();
        ring.classList.add('story-ring-fallback');
      });

      ring.appendChild(poster);

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

    if (index < currentStory) {
      fill.style.width = '100%';
    }

    track.appendChild(fill);
    storyProgress.appendChild(track);
  });
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
  storyVideo.src = stories[index].url;
  storyVideo.play().catch(() => {});
}

function openViewer(index) {
  storyViewer.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  playStory(index);
}

function closeViewer() {
  storyViewer.classList.add('hidden');
  storyVideo.pause();
  storyVideo.removeAttribute('src');
  storyVideo.load();
  document.body.style.overflow = '';
}

storyVideo.addEventListener('timeupdate', () => {
  const fill = storyProgress.children[currentStory] && storyProgress.children[currentStory].firstChild;

  if (fill && storyVideo.duration) {
    fill.style.width = `${(storyVideo.currentTime / storyVideo.duration) * 100}%`;
  }
});

storyVideo.addEventListener('ended', () => playStory(currentStory + 1));
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

async function openRecorder() {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    alert('Seu navegador não suporta gravação de vídeo. Tente pelo celular.');
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: true
    });
  } catch (err) {
    alert('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    return;
  }

  recorderPreview.srcObject = mediaStream;
  recorderLive.classList.remove('hidden');
  recorderReview.classList.add('hidden');
  recordButton.classList.remove('recording');
  recordTimer.textContent = `${STORY_MAX_SECONDS}s`;
  recordedBlob = null;
  document.getElementById('sendStoryButton').disabled = false;
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

function capturePoster() {
  try {
    const canvas = document.createElement('canvas');
    const size = Math.min(recorderPreview.videoWidth, recorderPreview.videoHeight) || 480;
    canvas.width = 480;
    canvas.height = 480;

    const sx = (recorderPreview.videoWidth - size) / 2;
    const sy = (recorderPreview.videoHeight - size) / 2;
    canvas.getContext('2d').drawImage(recorderPreview, sx, sy, size, size, 0, 0, 480, 480);
    canvas.toBlob((blob) => { posterBlob = blob; }, 'image/jpeg', 0.8);
  } catch (err) {
    posterBlob = null;
  }
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
  capturePoster();

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
    reviewVideo.src = URL.createObjectURL(recordedBlob);
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
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  } else {
    startRecording();
  }
});

document.getElementById('retakeButton').addEventListener('click', () => {
  reviewVideo.pause();
  recordedBlob = null;
  recorderLive.classList.remove('hidden');
  recorderReview.classList.add('hidden');
  recordTimer.textContent = `${STORY_MAX_SECONDS}s`;
});

document.getElementById('sendStoryButton').addEventListener('click', async () => {
  if (!recordedBlob) {
    return;
  }

  const sendButton = document.getElementById('sendStoryButton');
  sendButton.disabled = true;
  setRecorderMessage('Enviando seu momento...');

  try {
    const response = await fetch('/api/story-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: recordedBlob.type, size: recordedBlob.size })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Erro ao preparar o story.');
    }

    const upload = await fetch(data.url, {
      method: 'PUT',
      headers: { 'Content-Type': recordedBlob.type.split(';')[0] },
      body: recordedBlob
    });

    if (!upload.ok) {
      throw new Error('Falha ao enviar o vídeo. Tente novamente.');
    }

    if (posterBlob) {
      try {
        await fetch(data.posterUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: posterBlob
        });
      } catch (err) {
        // sem pôster o story mostra o anel padrão
      }
    }

    closeRecorder();
    loadStories();
  } catch (error) {
    setRecorderMessage(error.message || 'Erro ao enviar o story.', true);
  } finally {
    sendButton.disabled = false;
  }
});

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
