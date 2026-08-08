const fileInput = document.getElementById('photoInput');
const dropZone = document.getElementById('dropZone');
const clearButton = document.getElementById('clearButton');
const fileList = document.getElementById('fileList');
const fileCounter = document.getElementById('fileCounter');
const submitButton = document.getElementById('submitButton');
const progressPanel = document.getElementById('progressPanel');
const progressBar = document.getElementById('progressBar');
const percentText = document.getElementById('percentText');
const message = document.getElementById('message');

const MAX_CLIENT_UPLOAD = 15;

let selectedFiles = [];

function setMessage(text, type = 'info') {
  message.textContent = text;
  message.className = 'message';

  if (type === 'success') {
    message.classList.add('success');
  }

  if (type === 'error') {
    message.classList.add('error');
  }
}

function renderFiles() {
  fileList.querySelectorAll('img').forEach((img) => {
    URL.revokeObjectURL(img.src);
  });
  fileList.innerHTML = '';

  selectedFiles.forEach((file) => {
    const item = document.createElement('li');
    item.className = 'thumb';
    item.title = `${file.name} (${Math.round(file.size / 1024)} KB)`;

    const img = document.createElement('img');
    img.alt = file.name;
    img.src = URL.createObjectURL(file);
    img.addEventListener('error', () => {
      URL.revokeObjectURL(img.src);
      img.remove();
      item.classList.add('thumb-fallback');
    });

    item.appendChild(img);
    fileList.appendChild(item);
  });

  fileCounter.textContent = `${selectedFiles.length} foto${selectedFiles.length === 1 ? '' : 's'} selecionada${selectedFiles.length === 1 ? '' : 's'}`;

  if (selectedFiles.length > 0) {
    clearButton.classList.remove('hidden');
  } else {
    clearButton.classList.add('hidden');
  }
}

fileInput.addEventListener('change', (event) => {
  selectedFiles = Array.from(event.target.files || []);

  if (selectedFiles.length > MAX_CLIENT_UPLOAD) {
    selectedFiles = selectedFiles.slice(0, MAX_CLIENT_UPLOAD);
    setMessage(`Você pode enviar até ${MAX_CLIENT_UPLOAD} fotos por vez.`, 'error');
  } else {
    setMessage('');
  }

  renderFiles();
});

clearButton.addEventListener('click', () => {
  selectedFiles = [];
  fileInput.value = '';
  renderFiles();
  setMessage('');
});

function uploadFiles() {
  if (selectedFiles.length === 0) {
    setMessage('Selecione pelo menos uma foto.', 'error');
    return;
  }

  const formData = new FormData();

  selectedFiles.forEach((file) => {
    formData.append('photos', file);
  });

  const xhr = new XMLHttpRequest();

  xhr.open('POST', '/api/upload');

  xhr.upload.addEventListener('progress', (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      progressBar.style.width = `${percent}%`;
      percentText.textContent = `${percent}%`;
    }
  });

  xhr.addEventListener('load', () => {
    progressPanel.classList.add('hidden');

    if (xhr.status >= 200 && xhr.status < 300) {
      const response = JSON.parse(xhr.responseText);
      setMessage(response.message, 'success');
      selectedFiles = [];
      fileInput.value = '';
      renderFiles();
    } else {
      try {
        const error = JSON.parse(xhr.responseText);
        setMessage(error.message || 'Erro ao enviar fotos.', 'error');
      } catch (err) {
        setMessage('Erro ao enviar fotos.', 'error');
      }
    }
  });

  xhr.addEventListener('error', () => {
    progressPanel.classList.add('hidden');
    setMessage('Não foi possível conectar ao servidor.', 'error');
  });

  progressPanel.classList.remove('hidden');
  progressBar.style.width = '0%';
  percentText.textContent = '0%';

  xhr.send(formData);
}

submitButton.addEventListener('click', uploadFiles);

['dragenter', 'dragover'].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('drop', (event) => {
  const droppedFiles = Array.from(event.dataTransfer.files || []);
  selectedFiles = droppedFiles.filter((file) => file.type.startsWith('image/'));

  if (selectedFiles.length > MAX_CLIENT_UPLOAD) {
    selectedFiles = selectedFiles.slice(0, MAX_CLIENT_UPLOAD);
    setMessage(`Você pode enviar até ${MAX_CLIENT_UPLOAD} fotos por vez.`, 'error');
  }

  renderFiles();
});
