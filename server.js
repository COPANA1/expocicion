require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const SUPABASE_CONFIGURED = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const supabase = SUPABASE_CONFIGURED
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;
const BUCKET = 'archivos';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(express.json());
app.use(express.static('public'));

// Listar archivos
app.get('/api/files', async (req, res) => {
  if (!SUPABASE_CONFIGURED) return res.json([]);
  const { data, error } = await supabase
    .from('archivos')
    .select('*')
    .order('creado_en', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Login admin
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ ok: true, token: Buffer.from(ADMIN_PASSWORD).toString('base64') });
  } else {
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

// Subir archivo (protegido)
app.post('/api/upload', upload.single('archivo'), async (req, res) => {
  if (!SUPABASE_CONFIGURED) return res.status(503).json({ error: 'Supabase no configurado. Crea el archivo .env' });
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer ' + Buffer.from(ADMIN_PASSWORD).toString('base64')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { titulo, descripcion } = req.body;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No se recibió archivo' });

  const ext = path.extname(file.originalname);
  const filename = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file.buffer, { contentType: file.mimetype });

  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  const { error: dbError } = await supabase.from('archivos').insert({
    titulo: titulo || file.originalname,
    descripcion: descripcion || '',
    nombre_archivo: filename,
    url: urlData.publicUrl,
    tipo: ext.replace('.', '').toUpperCase(),
    tamano: file.size,
  });

  if (dbError) return res.status(500).json({ error: dbError.message });
  res.json({ ok: true });
});

// Ver archivo HTML renderizado
app.get('/view/:id', async (req, res) => {
  if (!SUPABASE_CONFIGURED) return res.status(503).send('Supabase no configurado');
  const { data: file } = await supabase.from('archivos').select('*').eq('id', req.params.id).single();
  if (!file) return res.status(404).send('Archivo no encontrado');

  if (['HTML', 'HTM'].includes((file.tipo || '').toUpperCase())) {
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(file.nombre_archivo);
    if (error) return res.status(500).send('Error al cargar el archivo');
    const html = await blob.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
  res.redirect(file.url);
});

// Eliminar archivo (protegido)
app.delete('/api/files/:id', async (req, res) => {
  if (!SUPABASE_CONFIGURED) return res.status(503).json({ error: 'Supabase no configurado' });
  const auth = req.headers.authorization;
  if (!auth || auth !== 'Bearer ' + Buffer.from(ADMIN_PASSWORD).toString('base64')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { data: file } = await supabase.from('archivos').select('nombre_archivo').eq('id', req.params.id).single();
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });

  await supabase.storage.from(BUCKET).remove([file.nombre_archivo]);
  await supabase.from('archivos').delete().eq('id', req.params.id);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
