// server.js — static host + Azure TTS proxy (CommonJS, Node 18+)
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env.local') });

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = 5173;

// Folders
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR   = path.join(__dirname, 'src', 'data'); // serve JSON from /data

// Static routes
app.use('/public', express.static(PUBLIC_DIR));
app.use('/data',   express.static(DATA_DIR));           // <-- this makes /data/quizData_*.json work

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

/**
 * POST /api/tts
 * body: { text: string, lang?: 'en'|'ja', voice?: string }
 * return: audio/mpeg (mp3)
 */
app.post('/api/tts', async (req, res) => {
  try {
    const { text, lang = 'en', voice } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing text' });
    }

    const KEY = process.env.AZURE_TTS_KEY;
    const REGION = process.env.AZURE_TTS_REGION;
    const ENDPOINT =
      process.env.AZURE_TTS_ENDPOINT || `https://${REGION}.tts.speech.microsoft.com`;

    if (!KEY || !REGION) {
      return res.status(500).json({ error: 'Azure Speech env not set' });
    }

    const defaultVoice =
      voice ||
      (lang === 'ja'
        ? (process.env.AZURE_TTS_DEFAULT_VOICE_JA || 'ja-JP-NanamiNeural')
        : (process.env.AZURE_TTS_DEFAULT_VOICE_EN || 'en-GB-LibbyNeural'));

    const xmlLang = lang === 'ja' ? 'ja-JP' : 'en-US';
    const safeText = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');

    const ssml = `
<speak version="1.0" xml:lang="${xmlLang}">
  <voice name="${defaultVoice}">
    ${safeText}
  </voice>
</speak>`.trim();

    const ttsUrl = `${ENDPOINT.replace(/\/+$/, '')}/cognitiveservices/v1`;

    const r = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3'
      },
      body: ssml
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: 'Azure TTS failed', detail });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buf);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}/public/test.html`);
});
