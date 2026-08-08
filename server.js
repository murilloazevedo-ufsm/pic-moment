const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');

if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  dotenv.config();
}

const express = require('express');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Atrás do proxy da Vercel: sem isso o rate limit enxerga um único IP para todos os visitantes
app.set('trust proxy', 1);

const supabaseOrigin = (() => {
  try {
    return new URL(process.env.SUPABASE_URL).origin;
  } catch (err) {
    return '';
  }
})();

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
      `media-src 'self' blob: ${supabaseOrigin}`.trim(),
      `connect-src 'self' ${supabaseOrigin}`.trim(),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  });

  next();
});

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

const allowedVideoTypes = new Set(['video/webm', 'video/mp4', 'video/quicktime']);

const MAX_STORY_SIZE = Number(process.env.STORY_MAX_FILE_SIZE_BYTES || 40 * 1024 * 1024);
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

const EDGE_CACHE_HEADER = 'public, max-age=0, s-maxage=15, stale-while-revalidate=60';

app.get('/api/moments', async (req, res) => {
  try {
    const files = await listAllPhotos();

    res.set('Cache-Control', EDGE_CACHE_HEADER);
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

    res.set('Cache-Control', EDGE_CACHE_HEADER);
    res.json({ success: true, photos });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao listar as fotos.'
    });
  }
});

app.post('/api/story-upload-url', async (req, res) => {
  try {
    const bucket = process.env.SUPABASE_BUCKET;

    if (!bucket) {
      throw new Error('O bucket do Supabase não está configurado.');
    }

    const { type, size } = req.body || {};
    const baseType = String(type || '').split(';')[0].trim();

    if (!allowedVideoTypes.has(baseType)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de vídeo não suportado.'
      });
    }

    if (Number(size || 0) > MAX_STORY_SIZE) {
      return res.status(400).json({
        success: false,
        message: 'O vídeo ficou muito grande. Tente gravar novamente.'
      });
    }

    const extension = baseType === 'video/mp4' ? 'mp4' : baseType === 'video/quicktime' ? 'mov' : 'webm';
    const baseName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `stories/${baseName}.${extension}`;
    const posterPath = `stories/thumbs/${baseName}.jpg`;

    const supabase = getSupabaseClient();

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath);

    if (error) {
      throw new Error(`Erro ao preparar o story: ${error.message}`);
    }

    const { data: posterData, error: posterError } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(posterPath);

    if (posterError) {
      throw new Error(`Erro ao preparar o story: ${posterError.message}`);
    }

    res.json({
      success: true,
      path: storagePath,
      url: data.signedUrl,
      posterUrl: posterData.signedUrl
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao preparar o story.'
    });
  }
});

app.get('/api/stories', async (req, res) => {
  try {
    const bucket = process.env.SUPABASE_BUCKET;

    if (!bucket) {
      throw new Error('O bucket do Supabase não está configurado.');
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .list('stories', { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });

    if (error) {
      throw new Error(`Erro ao consultar o Supabase: ${error.message}`);
    }

    const baseUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/`;

    const stories = data
      .filter((item) => item.id && !item.name.startsWith('.'))
      .map((item) => ({
        name: item.name,
        url: `${baseUrl}stories/${encodeURIComponent(item.name)}`,
        posterUrl: `${baseUrl}stories/thumbs/${encodeURIComponent(item.name.replace(/\.[^.]+$/, ''))}.jpg`,
        createdAt: item.created_at
      }));

    res.set('Cache-Control', EDGE_CACHE_HEADER);
    res.json({ success: true, stories });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao listar os stories.'
    });
  }
});

const QR_ALLOWED_PATHS = new Set(['/inara-e-lucas', '/inara-e-lucas/album']);

app.get('/api/qr.png', async (req, res) => {
  try {
    const pagePath = String(req.query.path || '/inara-e-lucas');

    if (!QR_ALLOWED_PATHS.has(pagePath)) {
      return res.status(400).json({ success: false, message: 'Página inválida.' });
    }

    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = String(req.get('x-forwarded-proto') || 'https').split(',')[0];
    const url = `${proto}://${host}${pagePath}`;

    const png = await QRCode.toBuffer(url, {
      width: 480,
      margin: 2,
      color: { dark: '#422b31', light: '#fffdfb' }
    });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.send(png);
  } catch (error) {
    console.error(error);

    res.status(500).json({ success: false, message: 'Erro ao gerar o QR Code.' });
  }
});

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'pic-moments-dev';
}

function createSessionToken(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  const [payload, signature] = String(token || '').split('.');

  if (!payload || !signature) {
    return null;
  }

  const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  const session = JSON.parse(Buffer.from(payload, 'base64url').toString());

  return session.exp > Date.now() ? session : null;
}

function requireSession(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  let session = null;

  try {
    session = verifySessionToken(token);
  } catch (err) {
    session = null;
  }

  if (!session) {
    return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
  }

  req.session = session;
  next();
}

function safeEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();

  return crypto.timingSafeEqual(hashA, hashB);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Muitas tentativas de login. Aguarde alguns minutos.'
  }
});

app.post('/api/login', loginLimiter, (req, res) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return res.status(500).json({ success: false, message: 'Login não configurado no servidor.' });
  }

  const { email, password } = req.body || {};
  const emailOk = safeEqual(String(email || '').trim().toLowerCase(), adminEmail.toLowerCase());
  const passwordOk = safeEqual(String(password || ''), adminPassword);

  if (!emailOk || !passwordOk) {
    console.warn(`[auth] tentativa de login falhou (ip=${req.ip})`);

    return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
  }

  res.json({ success: true, token: createSessionToken(adminEmail) });
});

app.get('/api/admin/stats', requireSession, async (req, res) => {
  try {
    const files = await listAllPhotos();
    const totalBytes = files.reduce((sum, file) => sum + ((file.metadata && file.metadata.size) || 0), 0);

    res.json({
      success: true,
      email: req.session.email,
      count: files.length,
      totalBytes
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao carregar as estatísticas.'
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/inara-e-lucas', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.get('/inara-e-lucas/album', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'album.html'));
});

app.get('*', (req, res) => {
  res.redirect('/');
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
