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
const momentsCounter = document.getElementById('momentsCounter');

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

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'thumb-remove';
    removeButton.setAttribute('aria-label', `Remover ${file.name}`);
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => {
      selectedFiles = selectedFiles.filter((selected) => selected !== file);
      fileInput.value = '';
      renderFiles();
    });

    item.appendChild(img);
    item.appendChild(removeButton);
    fileList.appendChild(item);
  });

  fileCounter.textContent = `${selectedFiles.length} foto${selectedFiles.length === 1 ? '' : 's'} selecionada${selectedFiles.length === 1 ? '' : 's'}`;

  if (selectedFiles.length > 0) {
    clearButton.classList.remove('hidden');
  } else {
    clearButton.classList.add('hidden');
  }
}

async function refreshMoments() {
  try {
    const response = await fetch('/api/moments');
    const data = await response.json();

    if (data.success) {
      const label = data.count === 1 ? 'momento compartilhado' : 'momentos compartilhados';
      momentsCounter.textContent = `♥ ${data.count} ${label}`;
      momentsCounter.classList.remove('hidden');
    }
  } catch (err) {
    // contador é decorativo: falha silenciosa
  }
}

refreshMoments();

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

function setProgress(percent) {
  progressBar.style.width = `${percent}%`;
  percentText.textContent = `${percent}%`;
}

function sendToSupabase(file, uploadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Falha ao enviar ${file.name}.`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error(`Falha ao enviar ${file.name}.`));
    });

    xhr.send(file);
  });
}

async function uploadFiles() {
  if (selectedFiles.length === 0) {
    setMessage('Selecione pelo menos uma foto.', 'error');
    return;
  }

  const files = selectedFiles.slice();
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  submitButton.disabled = true;
  progressPanel.classList.remove('hidden');
  setProgress(0);
  setMessage('');

  try {
    const response = await fetch('/api/upload-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: files.map((file) => ({ name: file.name, type: file.type, size: file.size }))
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Erro ao preparar o envio das fotos.');
    }

    let sentBytes = 0;

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];

      await sendToSupabase(file, data.uploads[i].url, (loaded) => {
        const percent = Math.min(100, Math.round(((sentBytes + loaded) / totalBytes) * 100));
        setProgress(percent);
      });

      sentBytes += file.size;
      setProgress(Math.min(100, Math.round((sentBytes / totalBytes) * 100)));
    }

    setMessage(`${files.length} foto${files.length === 1 ? '' : 's'} enviada${files.length === 1 ? '' : 's'} com sucesso!`, 'success');
    selectedFiles = [];
    fileInput.value = '';
    renderFiles();
    refreshMoments();
  } catch (error) {
    setMessage(error.message || 'Erro ao enviar fotos.', 'error');
  } finally {
    progressPanel.classList.add('hidden');
    submitButton.disabled = false;
  }
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
