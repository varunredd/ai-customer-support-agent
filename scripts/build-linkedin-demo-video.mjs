import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = "/Users/varunreddy/Downloads/jobform-support-agent-phase1";
const OUT = path.join(ROOT, "docs/linkedin-video");
const WORK = path.join(OUT, "build-v3");
const SRC = path.join(ROOT, ".data/demo-screenshots");
const FINAL = path.join(OUT, "jobform-linkedin-demo.mp4");
const DOWNLOADS = "/Users/varunreddy/Downloads/jobform-linkedin-demo.mp4";

/** Launch-style lines — one beat per frame so audio and picture stay locked. */
const SCENES = [
  {
    id: "01",
    image: "store-03-after-login.png",
    line: "Introducing Jobform — AI refund support built for real e-commerce operations.",
  },
  {
    id: "02",
    image: "store-08-order-details.png",
    line: "It pairs with NovaShop, where customers shop, sign in, and track live orders.",
  },
  {
    id: "03",
    image: "local-01-landing.png",
    line: "Jobform is the support layer. Policy decides the money. The agent handles the conversation.",
  },
  {
    id: "04",
    image: "local-03-support-portal.png",
    line: "Shoppers open the portal with the email on their account — no hunting for order IDs.",
  },
  {
    id: "05",
    image: "local-04-order-picker.png",
    line: "They choose an owned order, and the session stays locked to that customer for the whole chat.",
  },
  {
    id: "06",
    image: "local-05-support-workspace.png",
    line: "Text or voice — same agent, same tools, same refund path, with replies that can play aloud.",
  },
  {
    id: "07",
    image: "local-07b-conversation-detail.png",
    line: "Every session is visible to staff — transcripts, status, and order context in one console.",
  },
  {
    id: "08",
    image: "local-09-refunds.png",
    line: "Approved refunds hit an idempotent ledger after policy is re-checked in a transaction.",
  },
  {
    id: "09",
    image: "local-15-policies.png",
    line: "Merchants draft, validate, and publish the checklist the agent must follow — the model cannot override it.",
  },
  {
    id: "10",
    image: "local-16-integrations.png",
    line: "Store sync, webhooks, and delivery health live here too. Production support — not a chatbot demo.",
  },
];

const XFADE = 0.5;
/** Quiet before the line starts on a new frame (lets the transition settle). */
const PAD_BEFORE = 0.45;
/**
 * Quiet after each line while the same frame is still on screen.
 * Must be longer than XFADE so the next voice never overlaps the previous line
 * during the picture crossfade (that was making scenes feel mixed together).
 */
const PAD_AFTER = 1.25;

function loadEnvLocal(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function run(cmd, args, label) {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`${label} failed\n${res.stderr || res.stdout}`);
  }
  return res;
}

function probeDuration(file) {
  const res = run(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    `ffprobe ${file}`,
  );
  return Number.parseFloat(res.stdout.trim());
}

async function synthesize(env, text, outFile) {
  // Prefer gpt-4o-mini-tts + marin for smooth launch narration; fall back to tts-1-hd + alloy.
  const attempts = [
    {
      model: "gpt-4o-mini-tts",
      voice: "marin",
      body: {
        model: "gpt-4o-mini-tts",
        voice: "marin",
        input: text,
        response_format: "mp3",
        instructions:
          "Speak as a polished product launch narrator. Smooth, clear, warm, and professional. Light midrange, no heavy bass, no gravel. Calm confidence, natural pacing, no hype.",
      },
    },
    {
      model: "tts-1-hd",
      voice: "alloy",
      body: {
        model: "tts-1-hd",
        voice: "alloy",
        input: text,
        response_format: "mp3",
      },
    },
    {
      model: "tts-1",
      voice: "alloy",
      body: {
        model: "tts-1",
        voice: "alloy",
        input: text,
        response_format: "mp3",
      },
    },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(attempt.body),
    });
    if (res.ok) {
      fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
      return attempt;
    }
    lastError = `${attempt.model}/${attempt.voice}: ${res.status} ${await res.text()}`;
  }
  throw new Error(`TTS failed\n${lastError}`);
}

const VOICE_CACHE = path.join(OUT, "voice-cache");
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(VOICE_CACHE, { recursive: true });

const env = loadEnvLocal(path.join(ROOT, ".env.local"));
const narrationLines = [];
const usedVoice = { model: "", voice: "" };

for (const scene of SCENES) {
  const srcImage = path.join(SRC, scene.image);
  const frame = path.join(WORK, `${scene.id}-frame.png`);
  const speechRaw = path.join(VOICE_CACHE, `${scene.id}-speech.mp3`);
  const audio = path.join(WORK, `${scene.id}-voice-padded.m4a`);
  const clip = path.join(WORK, `${scene.id}-clip.mp4`);

  run(
    "ffmpeg",
    [
      "-y",
      "-i",
      srcImage,
      "-vf",
      "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=0xF4F1F8,format=yuv420p",
      frame,
    ],
    `normalize ${scene.id}`,
  );

  if (!fs.existsSync(speechRaw) || fs.statSync(speechRaw).size < 1000) {
    const voiceMeta = await synthesize(env, scene.line, speechRaw);
    usedVoice.model = voiceMeta.model;
    usedVoice.voice = voiceMeta.voice;
  } else if (!usedVoice.model) {
    usedVoice.model = "cached";
    usedVoice.voice = "marin";
  }

  const speechDur = probeDuration(speechRaw);
  const clipDur = PAD_BEFORE + speechDur + PAD_AFTER;
  narrationLines.push(
    `${scene.id}\t${clipDur.toFixed(2)}s\t(pre ${PAD_BEFORE}s + speech ${speechDur.toFixed(2)}s + pause ${PAD_AFTER}s)\t${scene.line}`,
  );

  // Explicit lead-in + trail silence so the next scene never talks over this one.
  const delayMs = Math.round(PAD_BEFORE * 1000);
  run(
    "ffmpeg",
    [
      "-y",
      "-i",
      speechRaw,
      "-af",
      `adelay=${delayMs}:all=1,apad=pad_dur=${PAD_AFTER.toFixed(3)}`,
      "-t",
      clipDur.toFixed(3),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      audio,
    ],
    `pad audio ${scene.id}`,
  );

  // Still image + padded audio; picture fade lives inside the quiet trail.
  const fadeOutStart = Math.max(PAD_BEFORE + speechDur + 0.15, clipDur - XFADE);
  run(
    "ffmpeg",
    [
      "-y",
      "-loop",
      "1",
      "-i",
      frame,
      "-i",
      audio,
      "-vf",
      `fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${XFADE.toFixed(3)},fps=30,format=yuv420p`,
      "-c:v",
      "libx264",
      "-tune",
      "stillimage",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      clipDur.toFixed(3),
      "-shortest",
      clip,
    ],
    `clip ${scene.id}`,
  );
}

// Crossfade pictures only inside the quiet gap after each line.
// Audio uses the same acrossfade window, but that window is silence-only
// (PAD_AFTER / PAD_BEFORE), so voices never overlap or feel mixed.
const clips = SCENES.map((s) => path.join(WORK, `${s.id}-clip.mp4`));
const durations = clips.map((c) => probeDuration(c));

let filter = "";
for (let i = 0; i < clips.length; i += 1) {
  filter += `[${i}:v]settb=AVTB,fps=30,format=yuv420p[v${i}];`;
  filter += `[${i}:a]aformat=sample_rates=48000:channel_layouts=mono[a${i}];`;
}

let vPrev = "v0";
let aPrev = "a0";
let offset = durations[0] - XFADE;
for (let i = 1; i < clips.length; i += 1) {
  const vOut = i === clips.length - 1 ? "vout" : `vx${i}`;
  const aOut = i === clips.length - 1 ? "aout" : `ax${i}`;
  filter += `[${vPrev}][v${i}]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}[${vOut}];`;
  filter += `[${aPrev}][a${i}]acrossfade=d=${XFADE}:c1=tri:c2=tri[${aOut}];`;
  vPrev = vOut;
  aPrev = aOut;
  if (i < clips.length - 1) {
    offset += durations[i] - XFADE;
  }
}

const args = ["-y"];
for (const clip of clips) args.push("-i", clip);
args.push(
  "-filter_complex",
  filter,
  "-map",
  "[vout]",
  "-map",
  "[aout]",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  FINAL,
);

run("ffmpeg", args, "xfade assemble");

fs.copyFileSync(FINAL, DOWNLOADS);
fs.writeFileSync(
  path.join(OUT, "narration.txt"),
  SCENES.map((s) => s.line).join("\n\n") + "\n",
);
fs.writeFileSync(
  path.join(OUT, "scene-timing.txt"),
  [
    `voice=${usedVoice.model}/${usedVoice.voice}`,
    `xfade=${XFADE}s`,
    ...narrationLines,
    `final=${probeDuration(FINAL).toFixed(2)}s`,
  ].join("\n") + "\n",
);

console.log(
  JSON.stringify(
    {
      final: FINAL,
      downloads: DOWNLOADS,
      duration: probeDuration(FINAL),
      voice: usedVoice,
      scenes: SCENES.length,
    },
    null,
    2,
  ),
);
