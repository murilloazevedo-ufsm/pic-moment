const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  dotenv.config();
}

const express = require('express');
const multer = require('multer');
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES_PER_REQUEST
  },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error('Tipo de arquivo não permitido. Envie apenas imagens.'));
    }

    cb(null, true);
  }
});

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

async function uploadToSupabase(file) {
  const bucket = process.env.SUPABASE_BUCKET;

  if (!bucket) {
    throw new Error('O bucket do Supabase não está configurado.');
  }

  const supabase = getSupabaseClient();

  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype
    });

  if (error) {
    throw new Error(`Erro ao enviar para o Supabase: ${error.message}`);
  }

  return { id: data.path, name: file.originalname };
}

app.post('/api/upload', upload.array('photos', MAX_FILES_PER_REQUEST), async (req, res) => {
  try {
    const files = req.files || [];

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

    const uploadedFiles = [];

    for (const file of files) {
      if (!allowedMimeTypes.has(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `Arquivo não suportado: ${file.originalname}`
        });
      }

      if (file.size > MAX_FILE_SIZE) {
        return res.status(400).json({
          success: false,
          message: `Arquivo muito grande: ${file.originalname}`
        });
      }

      const result = await uploadToSupabase(file);
      uploadedFiles.push({
        name: result.name,
        id: result.id
      });
    }

    return res.status(200).json({
      success: true,
      message: `${uploadedFiles.length} foto(s) enviada(s) com sucesso!`,
      uploadedFiles
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Erro ao enviar as fotos.'
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: `Máximo de ${MAX_FILES_PER_REQUEST} fotos por request.`
      });
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `Uma foto excedeu o tamanho permitido de ${MAX_FILE_SIZE} bytes.`
      });
    }
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Erro ao processar upload.'
    });
  }

  next();
});

app.listen(port, () => {
  console.log(`Pic Moments running on port ${port}`);
});
