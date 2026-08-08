const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  dotenv.config();
}

const express = require('express');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

const MAX_FILES_PER_REQUEST = Number(process.env.UPLOAD_MAX_FILES_PER_REQUEST || 30);
const MAX_FILE_SIZE = Number(process.env.UPLOAD_MAX_FILE_SIZE_BYTES || 10 * 1024 * 1024);
const FRONTEND_LIMIT = Number(process.env.FRONTEND_UPLOAD_LIMIT || 15);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Muitas tentativas de upload. Tente novamente em alguns minutos.'
  }
});

app.use('/api', apiLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Credenciais do Supabase não configuradas.');
  }

  return createClient(url, key);
}

app.post('/api/upload-urls', async (req, res) => {
  try {
    const bucket = process.env.SUPABASE_BUCKET;

    if (!bucket) {
      throw new Error('O bucket do Supabase não está configurado.');
    }

    const files = Array.isArray(req.body && req.body.files) ? req.body.files : [];

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma imagem foi enviada.'
      });
    }

    if (files.length > FRONTEND_LIMIT) {
      return res.status(400).json({
        success: false,
        message: `Máximo de ${FRONTEND_LIMIT} fotos por envio.`
      });
    }

    const supabase = getSupabaseClient();
    const uploads = [];

    for (const file of files) {
      const name = String(file.name || 'foto');
      const type = String(file.type || '');
      const size = Number(file.size || 0);

      if (!allowedMimeTypes.has(type)) {
        return res.status(400).json({
          success: false,
          message: `Arquivo não suportado: ${name}`
        });
      }

      if (size > MAX_FILE_SIZE) {
        return res.status(400).json({
          success: false,
          message: `Arquivo muito grande: ${name}`
        });
      }

      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(storagePath);

      if (error) {
        throw new Error(`Erro ao preparar o upload: ${error.message}`);
      }

      const { data: thumbData, error: thumbError } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(`thumbs/${storagePath}`);

      if (thumbError) {
        throw new Error(`Erro ao preparar o upload: ${thumbError.message}`);
      }

      uploads.push({
        name,
        path: storagePath,
        url: data.signedUrl,
        thumbUrl: thumbData.signedUrl
      });
    }

    return res.json({ success: true, uploads });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Erro ao preparar o envio das fotos.'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API online',
    config: {
      maxFilesPerRequest: MAX_FILES_PER_REQUEST,
      maxFilesPerClientRequest: FRONTEND_LIMIT,
      maxFileSizeBytes: MAX_FILE_SIZE
    }
  });
});

async function listAllPhotos() {
  const bucket = process.env.SUPABASE_BUCKET;

  if (!bucket) {
    throw new Error('O bucket do Supabase não está configurado.');
  }

  const supabase = getSupabaseClient();
  const pageSize = 1000;
  let offset = 0;
  const files = [];

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list('', { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error) {
      throw new Error(`Erro ao consultar o Supabase: ${error.message}`);
    }

    files.push(...data.filter((item) => item.id && !item.name.startsWith('.')));

    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return files;
}

app.get('/api/moments', async (req, res) => {
  try {
    const files = await listAllPhotos();

    res.json({ success: true, count: files.length });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao contar os momentos.'
    });
  }
});

app.get('/api/photos', async (req, res) => {
  try {
    const files = await listAllPhotos();
    const baseUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_BUCKET}/`;

    const photos = files
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((file) => ({
        name: file.name,
        url: `${baseUrl}${encodeURIComponent(file.name)}`,
        thumbUrl: `${baseUrl}thumbs/${encodeURIComponent(file.name)}`,
        createdAt: file.created_at
      }));

    res.json({ success: true, photos });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao listar as fotos.'
    });
  }
});

app.get('/inara-e-lucas', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.get('/inara-e-lucas/album', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'album.html'));
});

app.get('*', (req, res) => {
  res.redirect('/inara-e-lucas');
});

app.use((error, req, res, next) => {
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Erro ao processar upload.'
    });
  }

  next();
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Pic Moments running on port ${port}`);
  });
}

module.exports = app;
