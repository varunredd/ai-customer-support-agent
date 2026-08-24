import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = "/Users/varunreddy/Downloads/jobform-support-agent-phase1";
const OUT = path.join(ROOT, "docs/linkedin-video");
const WORK = path.join(OUT, "build-v4");
const SRC = path.join(OUT, "source-frames");
const VOICE_CACHE = path.join(OUT, "voice-cache-v4");
const FINAL = path.join(OUT, "jobform-linkedin-demo.mp4");
const DOWNLOADS = "/Users/varunreddy/Downloads/jobform-linkedin-demo.mp4";

/**
 * Screens + voiceover from the LinkedIn product demo script.
 * Timing targets: 1–4 quick, 5 longest, 6–10 medium, close on refunds.
 */
const SCENES = [
  {
    id: "01",
    image: "01-novashop-home.jpg",
    line:
      "I wanted to build an AI customer support agent that works with a real commerce experience — not just another chatbot running in isolation. So this is NovaShop.",
  },
  {
    id: "02",
    image: "02-novashop-products.jpg",
    line:
      "The store has its own products, customers, and orders. The AI doesn't need to own the storefront — it connects to the business data that already exists.",
  },
  {
    id: "03",
    image: "03-order-details.png",
    line:
      "When a customer opens an order, we already know the status, payment, delivery, shipment tracking, and the items purchased.",
  },
  {
    id: "04",
    image: "04-get-help.png",
    line:
      "And from the order itself, they can get help — without retyping order numbers and delivery details all over again.",
  },
  {
    id: "04b",
    // Animated architecture bridge: NovaShop → Order Context → AI → Policy → Refund
    images: ["arch-0.png", "arch-1.png", "arch-2.png", "arch-3.png", "arch-4.png"],
    holdPerImage: 0.85,
    line:
      "Here's the path: NovaShop, to order context, to the AI support agent, through the policy engine, to a refund.",
  },
  {
    id: "05",
    image: "05-support-agent.jpg",
    line:
      "This is where the AI support agent takes over. It gets the customer and active order automatically, and can talk in text or voice. But it does not simply decide whether money should be refunded — those decisions are checked against deterministic business policies first.",
  },
  {
    id: "06",
    image: "06-staff-login.png",
    line:
      "There's also a separate staff environment. Automation should never mean losing operational control.",
  },
  {
    id: "07",
    image: "07-admin-overview.jpg",
    line:
      "Once inside, ops gets a full overview — customers, orders, agent runs, policy outcomes, escalations, and cases that need attention.",
  },
  {
    id: "08",
    image: "08-conversations.png",
    line:
      "Every conversation is saved. Staff can review the transcript and see how the agent responded — instead of chats disappearing into a black box.",
  },
  {
    id: "09",
    image: "09-customers.png",
    line:
      "The system also keeps customer-level context: account status, order history, refund activity, and risk — so decisions use real business data.",
  },
  {
    id: "10",
    image: "10-refunds.png",
    line:
      "And every completed refund lands in a ledger with the customer, order, item, amount, status, and policy. What started as an AI support agent became a production system — controlled, traceable, and safe. And this same support layer can plug into other commerce platforms through APIs. This is only the beginning.",
  },
];

const XFADE = 0.4;
const PAD_BEFORE = 0.3;
const PAD_AFTER = 0.85;

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
  if (res.status !== 0) throw new Error(`${label} failed\n${res.stderr || res.stdout}`);
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

function normalizeFrame(input, output) {
  run(
    "ffmpeg",
    [
      "-y",
      "-i",
      input,
      "-vf",
      "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=0xF4F1F8,format=yuv420p",
      output,
    ],
    `normalize ${path.basename(input)}`,
  );
}

async function synthesize(env, text, outFile) {
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
          "Speak like a founder walking a colleague through a product demo. Natural, clear, warm, and confident. Conversational pacing. No stiff textbook tone. No heavy bass.",
      },
    },
    {
      model: "tts-1-hd",
      voice: "alloy",
      body: { model: "tts-1-hd", voice: "alloy", input: text, response_format: "mp3" },
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

function buildStillClip({ frame, audio, clip, clipDur, fadeOutStart }) {
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
      `fade=t=in:st=0:d=0.25,fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${XFADE.toFixed(3)},fps=30,format=yuv420p`,
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
    `clip ${path.basename(clip)}`,
  );
}

function buildAnimatedClip({ frames, holdPerImage, audio, clip, minDur }) {
  const list = path.join(WORK, `${path.basename(clip, ".mp4")}-slides.txt`);
  const lines = [];
  for (const frame of frames) {
    lines.push(`file '${frame}'`);
    lines.push(`duration ${holdPerImage}`);
  }
  lines.push(`file '${frames[frames.length - 1]}'`);
  fs.writeFileSync(list, lines.join("\n") + "\n");

  const silentVideo = path.join(WORK, `${path.basename(clip, ".mp4")}-silent.mp4`);
  const animDur = Math.max(minDur, holdPerImage * frames.length);
  run(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-vf",
      `fps=30,format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0.3, animDur - XFADE).toFixed(3)}:d=${XFADE}`,
      "-c:v",
      "libx264",
      "-tune",
      "stillimage",
      "-t",
      animDur.toFixed(3),
      silentVideo,
    ],
    `animate ${path.basename(clip)}`,
  );

  run(
    "ffmpeg",
    [
      "-y",
      "-i",
      silentVideo,
      "-i",
      audio,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      animDur.toFixed(3),
      "-shortest",
      clip,
    ],
    `mux animate ${path.basename(clip)}`,
  );
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(VOICE_CACHE, { recursive: true });

const env = loadEnvLocal(path.join(ROOT, ".env.local"));
const narrationLines = [];
const usedVoice = { model: "", voice: "" };

for (const scene of SCENES) {
  const speechRaw = path.join(VOICE_CACHE, `${scene.id}-speech.mp3`);
  const audio = path.join(WORK, `${scene.id}-voice-padded.m4a`);
  const clip = path.join(WORK, `${scene.id}-clip.mp4`);

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

  if (scene.images?.length) {
    const frames = scene.images.map((name, idx) => {
      const out = path.join(WORK, `${scene.id}-f${idx}.png`);
      normalizeFrame(path.join(SRC, name), out);
      return out;
    });
    const hold = scene.holdPerImage ?? 0.8;
    const animMin = Math.max(clipDur, hold * frames.length + 0.4);
    // Extend audio pad if animation is longer than speech+pads
    if (animMin > clipDur) {
      run(
        "ffmpeg",
        [
          "-y",
          "-i",
          audio,
          "-af",
          `apad=pad_dur=${(animMin - clipDur + 0.05).toFixed(3)}`,
          "-t",
          animMin.toFixed(3),
          path.join(WORK, `${scene.id}-voice-ext.m4a`),
        ],
        `extend audio ${scene.id}`,
      );
      buildAnimatedClip({
        frames,
        holdPerImage: hold,
        audio: path.join(WORK, `${scene.id}-voice-ext.m4a`),
        clip,
        minDur: animMin,
      });
      narrationLines[narrationLines.length - 1] = `${scene.id}\t${animMin.toFixed(2)}s\t(architecture animation)\t${scene.line}`;
    } else {
      buildAnimatedClip({ frames, holdPerImage: hold, audio, clip, minDur: clipDur });
    }
  } else {
    const frame = path.join(WORK, `${scene.id}-frame.png`);
    normalizeFrame(path.join(SRC, scene.image), frame);
    const fadeOutStart = Math.max(PAD_BEFORE + speechDur + 0.1, clipDur - XFADE);
    buildStillClip({ frame, audio, clip, clipDur, fadeOutStart });
  }
}

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
  if (i < clips.length - 1) offset += durations[i] - XFADE;
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
fs.writeFileSync(path.join(OUT, "narration.txt"), SCENES.map((s) => s.line).join("\n\n") + "\n");
fs.writeFileSync(
  path.join(OUT, "scene-timing.txt"),
  [`voice=${usedVoice.model}/${usedVoice.voice}`, `xfade=${XFADE}s`, ...narrationLines, `final=${probeDuration(FINAL).toFixed(2)}s`].join("\n") +
    "\n",
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
