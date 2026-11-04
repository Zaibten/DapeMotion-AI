import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'data');
const TMP = path.join(__dirname, 'tmp');
await fs.mkdir(DATA, { recursive: true });
await fs.mkdir(TMP, { recursive: true });

const ts = () => new Date().toLocaleTimeString('en-GB');
const log = (job, msg) => console.log(`[${ts()}] ${job ? `[job ${job.id.slice(0, 8)}]` : '[server]'} ${msg}`);
const logErr = (job, msg) => console.error(`[${ts()}] ${job ? `[job ${job.id.slice(0, 8)}]` : '[server]'} ERROR: ${msg}`);
process.on('unhandledRejection', e => logErr(null, `Unhandled: ${e?.stack || e}`));

// ---------- config ----------
const API = 'https://api.openai.com/v1';
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { logErr(null, 'Missing OPENAI_API_KEY in .env'); process.exit(1); }
const auth = { Authorization: `Bearer ${KEY}` };
const IMAGE_MODELS = [...new Set([process.env.IMAGE_MODEL || 'gpt-image-2', 'gpt-image-1.5'])];
const VISION_MODELS = [...new Set([process.env.VISION_MODEL || 'gpt-5.6-luna', 'gpt-5.4-mini', 'gpt-4o-mini'])];
const FPS = 30;
const DEFAULT_REEL_SECONDS = 10;
const NEGATIVE = 'No text, no captions, no logo, no watermark, no brand name anywhere in the frame. Realistic skin, hands and fabric. Keep the outfit design, colours and embroidery exactly as in the reference photos.';

// ---------- segments + poses (46 total) ----------
// `preview` is an emoji fallback; drop a real jpg at /pose-previews/<key>.jpg to override.
export const SEGMENTS = {
  female: 'a beautiful Pakistani woman in her 20s with long soft wavy hair',
  male:   'a handsome Pakistani man in his late 20s with short neat hair and light stubble',
  kids:   'a cute Pakistani child aged 6–9 with a bright natural smile'
};

export const POSES = {
  // ---- female (existing 6 + 14 new = 20) ----
  front:   { label: 'Front standing',   seg: 'female', preview: '🧍‍♀️', text: 'full-body front view, standing straight and elegant, hands relaxed, soft natural smile' },
  turn:    { label: 'Over-shoulder',    seg: 'female', preview: '🔄', text: 'three-quarter turn, looking back over her shoulder at the camera, full body visible' },
  walk:    { label: 'Walking',          seg: 'female', preview: '🚶‍♀️', text: 'walking slowly toward the camera mid-stride, dupatta and hem softly in motion, full body' },
  sit:     { label: 'Seated',           seg: 'female', preview: '🪑', text: 'seated gracefully, hands resting on her lap, relaxed confident expression, outfit fully visible' },
  back:    { label: 'Back view',        seg: 'female', preview: '🔙', text: 'back view showing the full back embroidery and hem, head turned slightly to the side' },
  detail:  { label: 'Detail close-up',  seg: 'female', preview: '🔍', text: 'waist-up close-up, one hand gently touching the sleeve embroidery, sharp beadwork detail' },
  twirl:   { label: 'Twirl / flare',    seg: 'female', preview: '💃', text: 'mid-twirl with the skirt and dupatta flaring outward, motion blur on fabric edges, joyful smile' },
  handhip: { label: 'Hand on hip',      seg: 'female', preview: '🕺', text: 'standing with one hand on hip, other arm relaxed, confident editorial pose, weight on one leg' },
  lean:    { label: 'Wall lean',        seg: 'female', preview: '🧱', text: 'leaning one shoulder against a wall, legs crossed at ankles, calm gaze at camera' },
  duppata: { label: 'Dupatta veil',     seg: 'female', preview: '🧣', text: 'holding the dupatta lightly over her head with both hands, face framed, serene expression' },
  stairs:  { label: 'Descending stairs',seg: 'female', preview: '🪜', text: 'descending a short flight of stairs, one hand trailing the railing, hem lifted slightly' },
  window:  { label: 'Window light',     seg: 'female', preview: '🪟', text: 'standing by a large window, side profile, soft light on face and fabric, looking outward' },
  flowers: { label: 'With flowers',     seg: 'female', preview: '🌸', text: 'holding a small bouquet of fresh flowers near the chest, gentle smile, outfit fully visible' },
  mirror:  { label: 'Mirror reflection',seg: 'female', preview: '🪞', text: 'three-quarter view with a soft mirror reflection behind, showing front and back of outfit' },
  chair:   { label: 'Chair pose',       seg: 'female', preview: '🪑', text: 'sitting on a simple wooden chair, legs crossed at knee, hands on thigh, elegant posture' },
  jump:    { label: 'Joyful jump',      seg: 'female', preview: '🤸‍♀️', text: 'mid-air joyful jump, fabric and dupatta caught in motion, laughing, full body' },
  closeface:{ label: 'Face close-up',   seg: 'female', preview: '🙂', text: 'tight beauty close-up of face and neckline, natural makeup, sharp embroidery at the collar' },
  hands:   { label: 'Hands / jewellery',seg: 'female', preview: '💍', text: 'close-up of hands and wrists showing jewellery, henna and cuff embroidery' },
  feet:    { label: 'Shoes / hem',      seg: 'female', preview: '👠', text: 'low-angle close-up of shoes, ankles and embroidered hem of the outfit' },
  profile: { label: 'Side profile',     seg: 'female', preview: '➡️', text: 'full side profile showing silhouette, embroidery on the side seam, face looking forward' },

  // ---- male (14) ----
  m_front:   { label: 'Front standing',  seg: 'male', preview: '🧍‍♂️', text: 'full-body front view, standing straight and confident, hands relaxed at sides' },
  m_walk:    { label: 'Walking',         seg: 'male', preview: '🚶‍♂️', text: 'walking slowly toward the camera mid-stride, sherwani hem in motion, full body' },
  m_turn:    { label: 'Three-quarter',   seg: 'male', preview: '🔄', text: 'three-quarter turn, looking at the camera, full body visible' },
  m_back:    { label: 'Back view',       seg: 'male', preview: '🔙', text: 'back view showing the full back of the sherwani and shoulders, head slightly turned' },
  m_sit:     { label: 'Seated',          seg: 'male', preview: '🪑', text: 'seated on a low chair, hands on knees, relaxed confident expression, outfit fully visible' },
  m_pocket:  { label: 'Hand in pocket',  seg: 'male', preview: '🕴️', text: 'one hand in pocket, other adjusting the collar, editorial pose, weight on back leg' },
  m_watch:   { label: 'Watch close-up',  seg: 'male', preview: '⌚', text: 'close-up of the wrist, watch and cuff embroidery detail, sharp fabric texture' },
  m_collar:  { label: 'Collar close-up', seg: 'male', preview: '👔', text: 'waist-up close-up of the collar, buttons and embroidery, face included' },
  m_lean:    { label: 'Wall lean',       seg: 'male', preview: '🧱', text: 'shoulder leaning on a wall, arms crossed, calm expression, full body' },
  m_stairs:  { label: 'Descending stairs',seg: 'male', preview: '🪜', text: 'descending a short flight of stairs, one hand on railing, full body' },
  m_jump:    { label: 'Jump',            seg: 'male', preview: '🤸‍♂️', text: 'mid-air jump, sherwani flare, laughing, full body' },
  m_pair:    { label: 'Pair pose',       seg: 'male', preview: '👬', text: 'posing alongside a female model in a complementary outfit, both fully visible, formal stance' },
  m_profile: { label: 'Side profile',    seg: 'male', preview: '➡️', text: 'full side profile showing silhouette, side embroidery, face looking forward' },
  m_groom:   { label: 'Groom portrait',  seg: 'male', preview: '🤵', text: 'groom portrait with a subtle sehra or turban, half-body, warm light, confident smile' },

  // ---- kids (12) ----
  k_front:   { label: 'Front standing',  seg: 'kids', preview: '🧒', text: 'full-body front view, standing straight with a bright smile, hands relaxed' },
  k_walk:    { label: 'Walking',         seg: 'kids', preview: '🚶', text: 'walking toward the camera mid-stride, outfit and dupatta fluttering, full body' },
  k_run:     { label: 'Running',         seg: 'kids', preview: '🏃', text: 'running joyfully toward the camera, hair and fabric flying, laughing' },
  k_jump:    { label: 'Jumping',         seg: 'kids', preview: '🤸', text: 'mid-air jump with arms out, laughing, full body' },
  k_sit:     { label: 'Seated',          seg: 'kids', preview: '🪑', text: 'sitting on a small stool, hands on lap, cheerful expression, outfit fully visible' },
  k_twirl:   { label: 'Twirl',           seg: 'kids', preview: '💫', text: 'mid-twirl with skirt flaring, laughing, full body' },
  k_back:    { label: 'Back view',       seg: 'kids', preview: '🔙', text: 'back view showing the back embroidery, head slightly turned to the side' },
  k_detail:  { label: 'Detail close-up', seg: 'kids', preview: '🔍', text: 'waist-up close-up with one hand touching the embroidery, sharp beadwork' },
  k_flowers: { label: 'With flowers',    seg: 'kids', preview: '🌸', text: 'holding a small bunch of flowers near the chest, gentle smile' },
  k_group:   { label: 'Siblings group',  seg: 'kids', preview: '👫', text: 'two children in matching outfits standing together, both fully visible, cheerful' },
  k_family:  { label: 'Family trio',     seg: 'kids', preview: '👨‍👩‍👧', text: 'child standing with two adults in complementary outfits, all fully visible, warm mood' },
  k_closeface:{ label: 'Face close-up',  seg: 'kids', preview: '🙂', text: 'tight beauty close-up of the face and neckline, natural skin, sharp collar embroidery' }
};

export const SETTINGS = {
  livingroom: 'a bright minimal beige living room with a cream sofa and soft window light',
  courtyard:  'a sunlit white courtyard with palm plants and a white cast-iron table, golden daylight',
  studio:     'a clean neutral studio with a soft beige backdrop and soft diffused light',
  garden:     'a lush green garden with soft golden-hour backlight and gentle bokeh',
  rooftop:    'a modern city rooftop at golden hour with a soft skyline bokeh',
  marble:     'a marble-floored palace hallway with tall arches and warm hanging light',
  street:     'a calm old-city street with warm stone walls, soft afternoon light',
  beach:      'a quiet sandy beach at sunset with gentle waves and warm rim light'
};

export const ACCESSORIES = {
  none:      '',
  jewelry:   'delicate gold jewellery: earrings, a thin necklace and bangles',
  heavyjewel:'heavy bridal gold jewellery: jhumka earrings, matha patti, choker and stacked bangles',
  watch:     'a slim leather-strap wristwatch',
  glasses:   'subtle designer eyeglasses',
  dupatta:   'a matching embroidered dupatta draped over one shoulder',
  handbag:   'a small beaded handbag held in one hand',
  heels:     'elegant matching heels',
  khussa:    'embroidered khussa shoes',
  flowers:   'a small bouquet of fresh flowers held near the chest',
  turban:    'a neatly tied matching turban',
  sehra:     'a light groom sehra over the face'
};

const MOTIONS = ['zoom', 'pan', 'mixed', 'dolly', 'tilt', 'orbit', 'push', 'kenburns'];
const TRANSITIONS = ['fade', 'wipe', 'slide', 'circle', 'smooth', 'dissolve'];
const ASPECTS = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080] };
const OUT_SCALES = { '1080': 1, '1440': 1.3333 };

const UUID = /^[0-9a-f-]{36}$/;
const jdir = id => path.join(DATA, id);
const furl = (id, f) => `/data/${id}/${f}`;
const upload = multer({ dest: TMP, limits: { fileSize: 200 * 1024 * 1024 } });
const jobs = new Map();
const saving = new Map();

function persist(job) {
  const prev = saving.get(job.id) || Promise.resolve();
  const next = prev.then(() => fs.writeFile(path.join(jdir(job.id), 'meta.json'), JSON.stringify(job, null, 2))).catch(() => {});
  saving.set(job.id, next);
  return next;
}
const upd = (job, patch) => { Object.assign(job, patch); persist(job); };

const run = (cmd, args, capture = false) => new Promise((resolve, reject) => {
  const quiet = cmd === 'ffmpeg' && !['-version', '-filters'].includes(args[0]);
  const p = spawn(cmd, quiet ? ['-loglevel', 'error', ...args] : args);
  let err = '', out = '';
  p.stdout.on('data', d => (out += d));
  p.stderr.on('data', d => (err += d));
  p.on('error', e => reject(new Error(e.code === 'ENOENT' ? `${cmd} not found. Install ffmpeg and add it to PATH (then reopen cmd).` : e.message)));
  p.on('close', c => (c === 0 ? resolve(capture ? out : undefined) : reject(new Error(`${cmd} failed: ${err.slice(-600)}`))));
});

let capsPromise;
const ffmpegCaps = () => (capsPromise ||= run('ffmpeg', ['-filters'], true)
  .then(t => ({ full: /\bzoompan\b/.test(t) && /\bxfade\b/.test(t) }))
  .catch(() => ({ full: false })));

// ---------- OpenAI ----------
const hint = (status, body) => {
  if (status === 401) return ' → Your OPENAI_API_KEY is invalid.';
  if (status === 429) return ' → Rate limit or no credit left.';
  if (status === 403 && /verif/i.test(body)) return ' → Your OpenAI organization must be verified.';
  return '';
};

async function vision(job, buffers, instruction) {
  const content = [
    { type: 'text', text: instruction },
    ...buffers.map(b => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b.toString('base64')}` } }))
  ];
  let last = '';
  for (const model of VISION_MODELS) {
    const r = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], max_completion_tokens: 2000 })
    });
    if (r.ok) {
      const text = ((await r.json()).choices?.[0]?.message?.content || '').trim();
      if (text) { log(job, `Vision OK (model ${model})`); return text; }
      last = `${model}: empty answer`; continue;
    }
    const body = (await r.text()).slice(0, 300);
    last = `${model}: ${r.status} ${body}${hint(r.status, body)}`;
    logErr(job, `Vision model ${model} failed -> ${r.status} ${body}`);
    if (![400, 403, 404].includes(r.status)) break;
  }
  throw new Error(`Vision call failed (${last})`);
}

function posePrompt(poseKey, setting, note, segment = 'female', accessories = 'none') {
  const seg = SEGMENTS[segment] || SEGMENTS.female;
  const acc = ACCESSORIES[accessories] ? ` Accessories: ${ACCESSORIES[accessories]}.` : '';
  return `Photorealistic high-end fashion photograph of ${seg}, wearing the exact outfit shown in the reference images (match colours, ombré, fabric sheen, embroidery, beadwork, sleeves, hem, trousers and dupatta precisely). Pose: ${POSES[poseKey].text}. Setting: ${SETTINGS[setting] || SETTINGS.livingroom}.${acc} ${note ? `Mood notes: ${note.slice(0, 300)}. ` : ''}85mm lens, natural skin texture, vertical portrait composition, keep the whole outfit centred with margin at the sides. ${NEGATIVE}`;
}

async function genImage(job, refBuffers, prompt) {
  let last = '';
  for (const model of IMAGE_MODELS) {
    const form = new FormData();
    form.set('model', model);
    form.set('prompt', prompt);
    form.set('size', '1024x1536');
    form.set('quality', 'high');
    form.set('n', '1');
    refBuffers.forEach((b, i) => form.append('image[]', new Blob([b], { type: 'image/jpeg' }), `ref${i}.jpg`));
    const r = await fetch(`${API}/images/edits`, { method: 'POST', headers: auth, body: form });
    if (r.ok) {
      const d = (await r.json()).data?.[0];
      if (d?.b64_json) return Buffer.from(d.b64_json, 'base64');
      if (d?.url) return Buffer.from(await (await fetch(d.url)).arrayBuffer());
      throw new Error('Image API returned no image');
    }
    const body = (await r.text()).slice(0, 400);
    last = `${model}: ${r.status} ${body}${hint(r.status, body)}`;
    logErr(job, `Image model ${model} failed -> ${r.status} ${body}`);
    if (r.status !== 404) break;
  }
  throw new Error(`Image generation failed (${last})`);
}

async function readRefs(job, max = 4) {
  const out = [];
  for (const r of (job.refs || []).slice(0, max)) out.push(await fs.readFile(path.join(jdir(job.id), path.basename(r))));
  return out;
}

async function generatePoses(job, keys, setting, note, segment, accessories) {
  await fs.mkdir(path.join(jdir(job.id), 'poses'), { recursive: true });
  job.poses = job.poses || [];
  const entries = keys.map(key => {
    const e = { id: crypto.randomUUID().slice(0, 8), key, label: POSES[key].label, status: 'pending' };
    job.poses.push(e);
    return e;
  });
  persist(job);
  const refs = await readRefs(job, 4);
  const queue = [...entries];
  let finished = 0;
  const worker = async () => {
    while (queue.length) {
      const e = queue.shift();
      log(job, `Pose "${e.label}" generating...`);
      const t = Date.now();
      try {
        const png = await genImage(job, refs, posePrompt(e.key, setting, note, segment, accessories));
        const file = `poses/${e.key}_${e.id}.jpg`;
        await sharp(png).jpeg({ quality: 95 }).toFile(path.join(jdir(job.id), file));
        Object.assign(e, { status: 'done', file, url: furl(job.id, file) });
        log(job, `Pose "${e.label}" done in ${((Date.now() - t) / 1000).toFixed(0)}s (${++finished}/${entries.length})`);
      } catch (err) {
        Object.assign(e, { status: 'error', error: err.message });
        logErr(job, `Pose "${e.label}" failed (${++finished}/${entries.length}): ${err.message}`);
      }
      persist(job);
    }
  };
  await Promise.all([worker(), worker()]);
  return entries;
}

// ---------- reel builder ----------
function buildZoomPan(mode, F, zoomAmt, panSpeed) {
  const cy = `y='ih/2-(ih/zoom/2)'`;
  const cx = `x='iw/2-(iw/zoom/2)'`;
  const z = (1 + zoomAmt).toFixed(3);
  switch (mode) {
    case 'in':      return `z='min(1+${zoomAmt}*on/${F},${z})':${cx}:${cy}`;
    case 'out':     return `z='max(${z}-${zoomAmt}*on/${F},1)':${cx}:${cy}`;
    case 'panR':    return `z='${z}':x='(iw-iw/zoom)*on/${F}*${panSpeed}':${cy}`;
    case 'panL':    return `z='${z}':x='(iw-iw/zoom)*(1-on/${F})*${panSpeed}':${cy}`;
    case 'tiltU':   return `z='${z}':${cx}:y='(ih-ih/zoom)*(1-on/${F})*${panSpeed}'`;
    case 'tiltD':   return `z='${z}':${cx}:y='(ih-ih/zoom)*on/${F}*${panSpeed}'`;
    case 'dolly':   return `z='min(1+${zoomAmt}*on/${F},${z})':x='iw/2-(iw/zoom/2)+(iw*0.02*sin(on/${F}*3.14))':${cy}`;
    case 'orbit':   return `z='${z}':x='iw/2-(iw/zoom/2)+(iw*0.03*sin(on/${F}*6.28))':${cy}`;
    case 'kenburns':return `z='min(1+${zoomAmt}*on/${F},${z})':x='(iw-iw/zoom)*(on/${F})':y='(ih-ih/zoom)*(on/${F})'`;
    default:        return `z='min(1+${zoomAmt}*on/${F},${z})':${cx}:${cy}`;
  }
}

function pickModes(motion, K) {
  const seq = {
    zoom:     ['in', 'out', 'in', 'out'],
    pan:      ['panL', 'panR', 'panL', 'panR'],
    mixed:    ['in', 'panR', 'out', 'panL'],
    dolly:    ['dolly', 'dolly', 'dolly', 'dolly'],
    tilt:     ['tiltU', 'tiltD', 'tiltU', 'tiltD'],
    orbit:    ['orbit', 'orbit', 'orbit', 'orbit'],
    push:     ['in', 'in', 'in', 'in'],
    kenburns: ['kenburns', 'kenburns', 'kenburns', 'kenburns']
  }[motion] || ['in', 'out'];
  return Array.from({ length: K }, (_, i) => seq[i % seq.length]);
}

const XFADE_MAP = {
  fade: 'fade', wipe: 'wipeleft', slide: 'slideleft',
  circle: 'circleopen', smooth: 'smoothleft', dissolve: 'dissolve'
};

async function buildReel(job, images, opts, outFile) {
  const caps = await ffmpegCaps();
  log(job, `  reel method: ${caps.full ? 'full' : 'compatible'}`);
  const K = images.length;
  const [AW, AH] = ASPECTS[opts.aspect] || ASPECTS['9:16'];
  const scale = OUT_SCALES[opts.outScale] || 1;
  const W = Math.round(AW * scale / 2) * 2;
  const H = Math.round(AH * scale / 2) * 2;
  const T = caps.full && K > 1 ? opts.transition : 0;
  const reelSec = opts.reelSeconds || DEFAULT_REEL_SECONDS;
  const L = (reelSec + (K - 1) * T) / K;
  const frames = Math.round(L * FPS);
  const F = frames - 1;
  const cdir = path.join(jdir(job.id), 'clips');
  await fs.mkdir(cdir, { recursive: true });
  const modes = pickModes(opts.motion, K);
  const clips = [];

  for (const [i, img] of images.entries()) {
    const mode = modes[i];
    const clip = path.join(cdir, `c${i}.mp4`);
    log(job, `  clip ${i + 1}/${K} (${mode}, ${L.toFixed(1)}s, ${W}x${H})...`);
    if (caps.full) {
      const zp = buildZoomPan(mode, F, opts.zoomAmt, opts.panSpeed);
      await run('ffmpeg', ['-y', '-i', img,
        '-vf', `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W * 2}:${H * 2},zoompan=${zp}:d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p`,
        '-frames:v', String(frames), '-c:v', 'libx264', '-crf', '12', '-preset', 'medium', '-pix_fmt', 'yuv420p', clip]);
    } else {
      const big = path.join(cdir, `s${i}.jpg`);
      const sw = Math.round((W * 1.2) / 2) * 2, sh = Math.round((H * 1.2) / 2) * 2;
      await sharp(img).rotate().resize(sw, sh, { fit: 'cover' }).jpeg({ quality: 95 }).toFile(big);
      const mid = '(in_h-out_h)/2', midx = '(in_w-out_w)/2';
      const [x, y] = {
        panR: [`(in_w-out_w)*t/${L.toFixed(3)}`, mid],
        panL: [`(in_w-out_w)*(1-t/${L.toFixed(3)})`, mid],
        in:   [midx, `(in_h-out_h)*(1-t/${L.toFixed(3)})`],
        out:  [midx, `(in_h-out_h)*t/${L.toFixed(3)}`]
      }[mode] || [midx, mid];
      const fd = 15;
      await run('ffmpeg', ['-y', '-loop', '1', '-framerate', String(FPS), '-t', L.toFixed(3), '-i', big,
        '-vf', `crop=${W}:${H}:'${x}':'${y}',fade=in:0:${fd},fade=out:${Math.max(0, frames - fd)}:${fd},format=yuv420p`,
        '-r', String(FPS), '-frames:v', String(frames), '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p', clip]);
    }
    clips.push(clip);
  }

  log(job, `  joining ${K} clips...`);
  const args = ['-y'];
  clips.forEach(c => args.push('-i', c));
  if (K > 1) {
    let filter = '';
    if (caps.full) {
      const xf = XFADE_MAP[opts.transitionName] || 'fade';
      let prev = '[0:v]';
      for (let i = 1; i < K; i++) {
        const out = i === K - 1 ? '[v]' : `[x${i}]`;
        filter += `${prev}[${i}:v]xfade=transition=${xf}:duration=${T}:offset=${(i * (L - T)).toFixed(3)}${out};`;
        prev = out;
      }
      filter = filter.slice(0, -1);
    } else {
      filter = clips.map((_, i) => `[${i}:v]`).join('') + `concat=n=${K}:v=1:a=0[v]`;
    }
    args.push('-filter_complex', filter, '-map', '[v]');
  }
  args.push('-t', String(reelSec), '-r', String(FPS), '-c:v', 'libx264', '-crf', '12', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile);
  await run('ffmpeg', args);
  await fs.rm(cdir, { recursive: true, force: true });
}

async function ensureFrames(job) {
  if (!job.video || job.frames?.length) return;
  const dir = path.join(jdir(job.id), 'frames');
  await fs.mkdir(dir, { recursive: true });
  const times = Array.from({ length: 12 }, (_, i) => +(((i + 0.5) * 10) / 12).toFixed(2));
  const frames = [];
  for (const [i, t] of times.entries()) {
    const f = `t_${String(i).padStart(2, '0')}.jpg`;
    await run('ffmpeg', ['-y', '-ss', String(t), '-i', path.join(jdir(job.id), 'final.mp4'), '-frames:v', '1', '-vf', 'scale=220:-1', '-q:v', '4', path.join(dir, f)]);
    frames.push({ time: t, url: furl(job.id, `frames/${f}`) });
  }
  upd(job, { frames });
}

// ---------- main job ----------
async function processJob(job, opts) {
  const dir = jdir(job.id);
  let stageName = 'starting';
  const t0 = Date.now();
  const stage = async (i, label, fn) => {
    stageName = label;
    upd(job, { step: i, message: label });
    log(job, `STEP ${i + 1}/4 >> ${label}`);
    const t = Date.now();
    const out = await fn();
    log(job, `STEP ${i + 1}/4 OK  ${label} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    return out;
  };
  const { motion, prompt, setting, startFromModel, poseKeys, videoPath, segment, accessories, transition, transitionName, zoomAmt, panSpeed, reelSeconds, aspect, outScale } = opts;

  log(job, `Started: seg=${segment} motion=${motion} tr=${transitionName} ${aspect}@${outScale} setting=${setting} sfm=${startFromModel} poses=[${poseKeys.join(',') || '-'}] acc=${accessories} ${job.refs.length} photo(s)${videoPath ? ', ref video' : ''}`);
  try {
    const refs = await readRefs(job, 6);

    const { dress, style } = await stage(0, 'Analysing your photos' + (videoPath ? ' and reference video' : ''), async () => {
      const dress = await vision(job, refs, 'Describe this outfit: colours, fabric sheen, embroidery and beadwork, sleeves, hem, dupatta, trousers, accessories. Facts only, max 90 words.');
      let style = '';
      if (videoPath) {
        const fdir = path.join(TMP, `${job.id}_frames`);
        await fs.mkdir(fdir, { recursive: true });
        await run('ffmpeg', ['-y', '-i', videoPath, '-vf', 'fps=1/2,scale=512:-1', '-frames:v', '5', path.join(fdir, 'f_%d.jpg')]);
        const frames = await Promise.all((await fs.readdir(fdir)).sort().map(f => fs.readFile(path.join(fdir, f))));
        style = await vision(job, frames, 'These are frames from a fashion reel. Describe the style: setting, lighting, model poses, camera movement, pacing, mood. No brand names or on-screen text. Max 90 words.');
      }
      return { dress, style };
    });
    upd(job, { fullPrompt: [prompt, `Outfit details: ${dress}`, style && `Reference reel style: ${style}`, NEGATIVE].filter(Boolean).join('\n\n') });

    const keys = poseKeys.length ? poseKeys : (startFromModel ? ['front', 'turn', 'walk', 'detail'] : []);
    const entries = await stage(1, `Creating ${keys.length} AI model photo(s)`, () => (keys.length ? generatePoses(job, keys, setting, `${prompt}. ${style}`, segment, accessories) : []));

    const failed = entries.filter(e => e.status === 'error');
    const poseFiles = entries.filter(e => e.status === 'done').map(e => path.join(dir, e.file));
    const refFiles = job.refs.map(r => path.join(dir, path.basename(r)));
    let scenes = startFromModel ? poseFiles : [...refFiles.slice(0, 3), ...poseFiles];
    if (!scenes.length) {
      scenes = refFiles.slice(0, 4);
      upd(job, { warning: `No AI model photos could be created, so the reel uses your own dress photos. ${failed[0]?.error?.slice(0, 220) || ''}` });
      logErr(job, `No AI photos available, falling back to your ${scenes.length} dress photo(s)`);
    } else if (failed.length) {
      upd(job, { warning: `${failed.length} model photo(s) failed: ${failed[0].error.slice(0, 200)}` });
    }
    scenes = scenes.slice(0, 8);

    // Cover / start frame at target aspect
    const [AW, AH] = ASPECTS[aspect] || ASPECTS['9:16'];
    const sScale = OUT_SCALES[outScale] || 1;
    await sharp(scenes[0]).rotate().resize(Math.round(AW * sScale / 2) * 2, Math.round(AH * sScale / 2) * 2, { fit: 'cover' }).jpeg({ quality: 92 }).toFile(path.join(dir, 'start.jpg'));
    upd(job, { startFrame: furl(job.id, 'start.jpg') });

    await stage(2, `Building the ${reelSeconds}s HD reel from ${scenes.length} scene(s)`, () => buildReel(job, scenes, { motion, transition, transitionName, zoomAmt, panSpeed, reelSeconds, aspect, outScale }, path.join(dir, 'final.mp4')));
    upd(job, { video: { url: furl(job.id, 'final.mp4') } });

    await stage(3, 'Preparing cover frames', () => ensureFrames(job));
    upd(job, { status: 'done', step: 4, message: 'Complete' });
    log(job, `DONE in ${((Date.now() - t0) / 1000).toFixed(0)}s -> data/${job.id}/final.mp4`);
  } catch (e) {
    logErr(job, `FAILED at step "${stageName}": ${e.message}`);
    console.error(e.stack);
    upd(job, { status: 'error', error: `${stageName}: ${e.message}` });
  } finally {
    if (videoPath) fs.rm(videoPath, { force: true }).catch(() => {});
    fs.rm(path.join(TMP, `${job.id}_frames`), { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- startup ----------
for (const id of await fs.readdir(DATA)) {
  try {
    const job = JSON.parse(await fs.readFile(path.join(DATA, id, 'meta.json'), 'utf8'));
    if (job.status === 'running') { job.status = 'error'; job.error = 'Interrupted by a server restart.'; }
    for (const p of job.poses || []) if (p.status === 'pending') Object.assign(p, { status: 'error', error: 'Interrupted by a server restart.' });
    jobs.set(id, job);
  } catch { /* ignore */ }
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', (req, _res, next) => { if (req.method !== 'GET') log(null, `${req.method} ${req.originalUrl}`); next(); });
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(DATA, { index: false, extensions: [] }));
app.param('id', (req, res, next, id) => (UUID.test(id) && jobs.has(id) ? next() : res.status(404).json({ error: 'Not found' })));

const pickKeys = raw => [...new Set([].concat(raw || []).flatMap(s => String(s).split(',')).map(s => s.trim()).filter(k => POSES[k]))].slice(0, 8);
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

app.get('/api/config', (_req, res) => res.json({
  poses: Object.entries(POSES).map(([key, p]) => ({ key, label: p.label, seg: p.seg, preview: p.preview })),
  settings: Object.keys(SETTINGS),
  motions: MOTIONS,
  transitions: TRANSITIONS,
  aspects: Object.keys(ASPECTS),
  outScales: Object.keys(OUT_SCALES),
  accessories: Object.entries(ACCESSORIES).map(([k, v]) => ({ key: k, label: v ? v.split(':')[0] : 'None' })),
  segments: Object.keys(SEGMENTS)
}));

app.post('/api/generate', upload.fields([{ name: 'images', maxCount: 8 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  try {
    const images = req.files?.images || [];
    const prompt = (req.body.prompt || '').trim();
    if (!images.length) return res.status(400).json({ error: 'Upload at least one dress photo.' });
    if (!prompt) return res.status(400).json({ error: 'Write a prompt.' });
    const id = crypto.randomUUID();
    await fs.mkdir(jdir(id), { recursive: true });
    const refs = [];
    for (const [i, f] of images.entries()) {
      const name = `ref_${i}.jpg`;
      await sharp(f.path).rotate().resize(1024, 1536, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toFile(path.join(jdir(id), name));
      fs.rm(f.path, { force: true }).catch(() => {});
      refs.push(furl(id, name));
    }
    const motion = MOTIONS.includes(req.body.motion) ? req.body.motion : (MOTIONS.includes(req.body.model) ? req.body.model : 'zoom');
    const transitionName = TRANSITIONS.includes(req.body.transitionName) ? req.body.transitionName : 'fade';
    const setting = SETTINGS[req.body.setting] ? req.body.setting : 'livingroom';
    const segment = SEGMENTS[req.body.segment] ? req.body.segment : 'female';
    const accessories = ACCESSORIES[req.body.accessories] !== undefined ? req.body.accessories : 'none';
    const aspect = ASPECTS[req.body.aspect] ? req.body.aspect : '9:16';
    const outScale = OUT_SCALES[req.body.outScale] ? req.body.outScale : '1080';
    const zoomAmt = clamp(req.body.zoomAmt, 0.02, 0.4, 0.14);
    const panSpeed = clamp(req.body.panSpeed, 0.3, 1.5, 1);
    const reelSeconds = clamp(req.body.reelSeconds, 4, 30, DEFAULT_REEL_SECONDS);
    const transition = clamp(req.body.transition, 0.2, 1.5, 0.6);

    const job = {
      id, createdAt: Date.now(), title: prompt.slice(0, 70), prompt, model: motion, motion, setting, segment, accessories, aspect, outScale,
      transitionName, transition, zoomAmt, panSpeed, reelSeconds, refs,
      status: 'running', step: 0, steps: ['Analyse', 'Model photos', 'Build reel', 'Finish'], message: 'Queued', poses: []
    };
    jobs.set(id, job);
    await persist(job);
    processJob(job, {
      motion, prompt, setting, segment, accessories, transition, transitionName, zoomAmt, panSpeed, reelSeconds, aspect, outScale,
      startFromModel: req.body.startFromModel === 'on' || req.body.startFromModel === 'true',
      poseKeys: pickKeys(req.body.poses),
      videoPath: req.files?.video?.[0]?.path
    });
    res.json({ id });
  } catch (e) {
    logErr(null, `/api/generate failed: ${e.stack}`);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/jobs', (_req, res) => res.json([...jobs.values()].sort((a, b) => b.createdAt - a.createdAt)));

app.get('/api/jobs/:id', async (req, res) => {
  const job = jobs.get(req.params.id);
  if (job.video && !job.frames?.length) await ensureFrames(job).catch(e => logErr(job, `frames: ${e.message}`));
  res.json(job);
});

app.post('/api/jobs/:id/cover', async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job.video) return res.status(400).json({ error: 'Video not ready.' });
  const t = Math.min(job.reelSeconds - 0.1, Math.max(0, Number(req.body.time) || 0));
  try {
    await run('ffmpeg', ['-y', '-ss', String(t), '-i', path.join(jdir(job.id), 'final.mp4'), '-frames:v', '1', '-q:v', '2', path.join(jdir(job.id), 'cover.jpg')]);
    upd(job, { cover: { time: t, url: `${furl(job.id, 'cover.jpg')}?v=${Date.now()}` } });
    log(job, `Cover frame saved at ${t.toFixed(1)}s`);
    res.json(job.cover);
  } catch (e) { logErr(job, `cover: ${e.message}`); res.status(500).json({ error: e.message }); }
});

app.post('/api/jobs/:id/poses', (req, res) => {
  const job = jobs.get(req.params.id);
  const keys = pickKeys(req.body.poses);
  if (!keys.length) return res.status(400).json({ error: 'Choose at least one pose.' });
  log(job, `Extra poses requested: ${keys.join(', ')}`);
  generatePoses(job, keys, SETTINGS[req.body.setting] ? req.body.setting : job.setting, job.prompt, job.segment || 'female', job.accessories || 'none').catch(e => logErr(job, e.message));
  res.json({ ok: true });
});

app.delete('/api/jobs/:id', async (req, res) => {
  const id = req.params.id;
  jobs.delete(id);
  await fs.rm(jdir(id), { recursive: true, force: true });
  log(null, `Deleted project ${id.slice(0, 8)}`);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => { logErr(null, err.stack || err.message); res.status(500).json({ error: err.message }); });

async function selfCheck() {
  try { await run('ffmpeg', ['-version']); const c = await ffmpegCaps(); log(null, c.full ? 'ffmpeg: OK (full mode)' : 'ffmpeg: OLD build detected -> compatible mode'); }
  catch (e) { logErr(null, e.message); }
  for (const [label, models] of [['image', IMAGE_MODELS], ['vision', VISION_MODELS]]) {
    let ok = null;
    for (const m of models) {
      try {
        const r = await fetch(`${API}/models/${m}`, { headers: auth });
        if (r.status === 401) { logErr(null, 'OPENAI_API_KEY is invalid (401).'); return; }
        if (r.ok) { ok = m; break; }
      } catch (e) { logErr(null, `Cannot reach OpenAI: ${e.message}`); return; }
    }
    ok ? log(null, `OpenAI ${label} model available: ${ok}`) : logErr(null, `No ${label} model from [${models.join(', ')}] is available to your key.`);
  }
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  log(null, `Open http://localhost:${port}`);
  selfCheck();
});