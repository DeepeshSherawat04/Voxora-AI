// frontend/src/hooks/useCall.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws/call";

const hasVoice = !!(
  navigator.mediaDevices?.getUserMedia &&
  (window.AudioContext || window.webkitAudioContext) &&
  typeof AudioWorkletNode !== "undefined"
);

const FRAME_SAMPLES = 1600;     // 100 ms of 16 kHz audio per websocket frame
const RESUME_HOLD_MS = 700;     // was 400 - ignore the mic after the agent stops talking, so speaker echo can die out

// ---------- Sarvam TTS reliability ----------
const TTS_TIMEOUT_MS = 10000;       // was 8000 - give Sarvam a little longer before giving up
const TTS_RETRIES = 2;              // retry Sarvam this many extra times before failing
const ALLOW_BROWSER_VOICE = false;  // false = never switch to the Chrome voice (reply shows as text only)

// ---------- barge-in (customer interrupts the agent) ----------
const BARGE_IN_ENABLED = true;  // set false if the agent keeps cutting itself off (speaker echo)
const BARGE_MS = 350;           // customer must keep talking this long to count as an interruption
const BARGE_MIN_RMS = 0.015;    // lower = easier to interrupt, but more echo false-triggers
const BARGE_WARMUP_MS = 400;    // learn the agent's echo level for this long before listening
const BARGE_RING_MS = 700;      // audio kept from just BEFORE the interruption, so no words are lost

// ---------- background-noise handling ----------
// Only audio that sounds like the customer's voice is sent to STT; everything else is replaced by
// silence. The gate adapts to the room (noise floor) and to how loudly THIS customer speaks, so
// quieter background chatter / TV / keyboard noise is ignored.
const NOISE_GATE_ENABLED = true;
const GATE_OPEN_MIN_RMS = 0.008;   // was 0.006 - never open below this
const GATE_CLOSE_MIN_RMS = 0.004;
const GATE_OPEN_MS = 150;          // was 60 - voice must persist this long to open (ignores taps/breaths)
const GATE_HANG_MS = 600;          // keep passing audio this long after voice drops (word endings)
const GATE_PREROLL_MS = 300;       // audio from just before the gate opened (first syllable)
const SPEAKER_LOCK = 0.3;          // background must be louder than 30% of the customer's own level

const WORKLET_SRC = `
class Cap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.buf.push(ch.slice(0)); this.n += ch.length;
      if (this.n >= 1024) {
        const out = new Float32Array(this.n); let o = 0;
        for (const b of this.buf) { out.set(b, o); o += b.length; }
        this.port.postMessage(out, [out.buffer]);
        this.buf = []; this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("cap", Cap);`;

// ---------- audio helpers ----------
const downsample = (data, inRate, outRate = 16000) => {
  if (inRate === outRate) return data;
  const ratio = inRate / outRate;
  const out = new Float32Array(Math.floor(data.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const s = Math.floor(i * ratio);
    const e = Math.min(Math.floor((i + 1) * ratio), data.length);
    let sum = 0;
    for (let j = s; j < e; j++) sum += data[j];
    out[i] = sum / Math.max(1, e - s);
  }
  return out;
};

const floatToInt16 = (f32) => {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

const int16ToBase64 = (i16) => {
  const bytes = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x2000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x2000));
  }
  return btoa(bin);
};

// Split a reply so the first sentence(s) can start playing while the rest is still being synthesised.
// The first clip is kept short (>= ~20 chars) so audio starts as fast as possible.
const splitReply = (text) => {
  const t = (text || "").trim();
  if (t.length < 60) return [t];
  const re = /[.!?।]+(\s|$)/g;
  let m;
  while ((m = re.exec(t))) {
    const end = m.index + m[0].length;
    if (end >= t.length - 5) break;
    if (end >= 20) return [t.slice(0, end).trim(), t.slice(end).trim()];
  }
  return [t];
};

export function useCall(onCallEnded) {
  const { apiFetch, withToken } = useAuth();
  const [phase, setPhase] = useState("idle"); // idle | connecting | in_call | ended
  const [transcript, setTranscript] = useState([]);
  const [partial, setPartial] = useState(null);       // { text, ts } — live, still being spoken
  const [typing, setTyping] = useState(false);
  const [live, setLive] = useState({
    buying_intent: 50, sentiment: "Neutral", topic: "General", speaking: false,
  });
  const [customerName, setCustomerName] = useState("Customer");
  const [consent, setConsent] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(null);
  const [error, setError] = useState(null);
  const [speakerOn, setSpeakerOn] = useState(true);

  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const speakingRef = useRef(false);
  const callIdRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const micStreamRef = useRef(null);
  const finishedRef = useRef(false);        // idempotency guard for finish()
  const audioRef = useRef(null);
  const playResolveRef = useRef(null);      // lets stopAudio() release a pending playChunk
  const speakIdRef = useRef(0);             // invalidates stale TTS responses
  const speakerRef = useRef(true);
  const aiQueueRef = useRef(Promise.resolve());   // keeps AI replies in order
  const micGraphRef = useRef(null);         // { ctx, node } built in startMic
  const awaitingRef = useRef(0);            // customer turns the agent hasn't answered yet
  const holdUntilRef = useRef(0);           // mic ignored until this timestamp
  const consentRef = useRef(false);
  const turnT0Ref = useRef(0);              // for latency logging in the console

  // ---------- speech (Sarvam TTS; browser voice only if ALLOW_BROWSER_VOICE) ----------
  const stopAudio = useCallback(() => {
    speakIdRef.current += 1;                       // anything still loading is now stale
    const a = audioRef.current;
    if (a) {
      a.onended = a.onerror = null;
      a.pause();
      try { URL.revokeObjectURL(a.src); } catch {}
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    const r = playResolveRef.current;              // unblock any awaiting speakReply loop
    playResolveRef.current = null;
    r?.();
  }, []);

  const doneSpeaking = useCallback(() => {
    speakingRef.current = false;
    holdUntilRef.current = performance.now() + RESUME_HOLD_MS;   // let echo die out
    setLive((l) => ({ ...l, speaking: false }));
  }, []);

  const browserSpeak = useCallback((text, onDone) => {
    if (!("speechSynthesis" in window)) { onDone?.(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    u.onend = u.onerror = () => onDone?.();
    window.speechSynthesis.speak(u);
  }, []);

  // What to do when Sarvam audio is unavailable: use the browser voice, or just stay silent.
  const voiceFallback = useCallback((text, onDone) => {
    if (ALLOW_BROWSER_VOICE) browserSpeak(text, onDone);
    else onDone?.();
  }, [browserSpeak]);

  // Download one TTS clip (does NOT play it). Retries Sarvam before giving up.
  // Returns a blob URL, or null on failure.
  const fetchTtsUrl = useCallback(async (text) => {
    for (let attempt = 0; attempt <= TTS_RETRIES; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TTS_TIMEOUT_MS);
      try {
        const res = await apiFetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: ctrl.signal,
        });
        if (res.ok === false) throw new Error(`TTS failed (${res.status})`);
        return URL.createObjectURL(await res.blob());
      } catch (err) {
        console.warn(`Sarvam TTS attempt ${attempt + 1} of ${TTS_RETRIES + 1} failed:`, err);
        if (attempt < TTS_RETRIES) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));   // short pause, then retry
        }
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }, [apiFetch]);

  // Play one clip; resolves when it ends (or is cancelled / fails over).
  const playChunk = useCallback((url, text, id) => new Promise((resolve) => {
    if (id !== speakIdRef.current) { if (url) URL.revokeObjectURL(url); resolve(); return; }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      if (playResolveRef.current === done) playResolveRef.current = null;
      resolve();
    };
    playResolveRef.current = done;

    if (!url) { voiceFallback(text, done); return; }

    const audio = new Audio(url);
    audioRef.current = audio;
    const release = () => {
      URL.revokeObjectURL(url);
      if (audioRef.current === audio) audioRef.current = null;
    };
    const fallback = () => {
      release();
      if (id === speakIdRef.current) voiceFallback(text, done); else done();
    };
    audio.onended = () => { release(); done(); };
    audio.onerror = fallback;
    audio.play().catch(fallback);
  }), [voiceFallback]);

  // Speak chunks in order. Clip 2 is already downloading while clip 1 plays.
  const speakReply = useCallback(async (chunks, urlPromises, id) => {
    speakingRef.current = true;                    // mic frames are blanked while the agent talks
    setLive((l) => ({ ...l, speaking: true }));
    try {
      for (let i = 0; i < chunks.length; i++) {
        const url = await urlPromises[i];
        const stale = id !== speakIdRef.current || !activeRef.current || !speakerRef.current;
        if (stale) {
          if (url) URL.revokeObjectURL(url);
          urlPromises.slice(i + 1).forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)));
          break;
        }
        await playChunk(url, chunks[i], id);
      }
    } finally {
      if (id === speakIdRef.current) doneSpeaking();
    }
  }, [playChunk, doneSpeaking]);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerRef.current;
    speakerRef.current = next;
    setSpeakerOn(next);
    if (!next && speakingRef.current) { stopAudio(); doneSpeaking(); }  // cut off current reply
  }, [stopAudio, doneSpeaking]);

  // ---------- mic -> 16 kHz PCM frames -> backend -> Sarvam realtime STT ----------
  const stopMic = useCallback(() => {
    const g = micGraphRef.current;
    if (g) {
      micGraphRef.current = null;
      try { g.node.port.onmessage = null; g.node.disconnect(); } catch {}
      try { g.ctx.close(); } catch {}
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }, []);

  const startMic = useCallback(async () => {
    if (!hasVoice) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,      // boosts quiet / distant speech
        },
      });
    } catch {
      setError("Microphone blocked — allow access or type below.");
      return;
    }
    if (!activeRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
    micStreamRef.current = stream;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    let node;
    try {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      if (ctx.state === "suspended") await ctx.resume();
      node = new AudioWorkletNode(ctx, "cap");
      // high-pass at 100 Hz: removes fan / AC rumble and desk thumps before anything else
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 100;
      ctx.createMediaStreamSource(stream).connect(hp);
      hp.connect(node);                                    // not wired to speakers: no echo
    } catch (err) {
      console.error("Mic setup failed:", err);
      try { ctx.close(); } catch {}
      stream.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setError("Could not start the microphone — type your reply below.");
      return;
    }
    if (!activeRef.current) {                        // call ended during setup
      try { node.disconnect(); ctx.close(); } catch {}
      stream.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      return;
    }
    micGraphRef.current = { ctx, node };

    let pending = [];
    let pendingLen = 0;

    const sendFrame = (i16) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 1_000_000) return;
      ws.send(JSON.stringify({ type: "audio_chunk", audio: int16ToBase64(i16) }));
    };

    // state for noise gate + barge-in detection
    const bd = {
      floor: 0.002,                       // room noise level (learned while idle)
      speechLevel: 0,                     // how loudly THIS customer speaks (learned)
      gateOpen: false, openMs: 0, hangMs: 0,
      pre: [], preSamples: 0,             // gate pre-roll
      ring: [], ringSamples: 0,           // barge-in lead-in while the agent talks
      speakMs: 0, voicedMs: 0, echoPeak: 0,
    };
    const resetBarge = () => {
      bd.ring = []; bd.ringSamples = 0; bd.speakMs = 0; bd.voicedMs = 0; bd.echoPeak = 0;
    };
    const resetGate = () => {
      bd.gateOpen = false; bd.openMs = 0; bd.hangMs = 0; bd.pre = []; bd.preSamples = 0;
    };
    const emit = (a) => { pending.push(a); pendingLen += a.length; };

    node.port.onmessage = (e) => {
      if (!activeRef.current) return;
      const raw = e.data;
      const dtMs = (raw.length / ctx.sampleRate) * 1000;
      let sum = 0;
      for (let i = 0; i < raw.length; i++) sum += raw[i] * raw[i];
      const rms = Math.sqrt(sum / raw.length);

      const i16 = floatToInt16(downsample(raw, ctx.sampleRate, 16000));
      const silence = () => new Int16Array(i16.length);
      const speakerCap = (k, cap) => Math.min(bd.speechLevel * k, cap);

      if (mutedRef.current || performance.now() < holdUntilRef.current) {
        resetGate(); resetBarge();
        emit(silence());

      } else if (speakingRef.current) {
        // Agent is talking. Send SILENCE to STT (so its own voice isn't transcribed) but watch the
        // mic locally: if the customer keeps talking over the agent, that is an interruption.
        resetGate();
        bd.ring.push(i16);
        bd.ringSamples += i16.length;
        while (bd.ring.length > 1 && bd.ringSamples > 16 * BARGE_RING_MS) {
          bd.ringSamples -= bd.ring.shift().length;
        }
        bd.speakMs += dtMs;

        let interrupted = false;
        if (BARGE_IN_ENABLED) {
          // threshold sits above the agent's own echo, the room noise and (if known) 50% of the
          // customer's usual level, so background chatter can't interrupt the agent
          const th = Math.max(BARGE_MIN_RMS, bd.echoPeak * 1.6, bd.floor * 6, speakerCap(0.5, 0.06));
          if (bd.speakMs < BARGE_WARMUP_MS) {
            bd.echoPeak = Math.max(bd.echoPeak, rms);                 // learn echo level
          } else if (rms > th) {
            bd.voicedMs += dtMs;
          } else {
            bd.voicedMs = Math.max(0, bd.voicedMs - dtMs);
            bd.echoPeak = Math.max(bd.echoPeak * 0.995, rms);
          }
          interrupted = bd.voicedMs >= BARGE_MS;
        }

        if (interrupted) {
          // ---- INTERRUPTION: cut the agent off and start listening immediately ----
          stopAudio();
          doneSpeaking();
          holdUntilRef.current = 0;                      // no echo hold: the customer IS talking
          for (const p of bd.ring) emit(p);              // include the lead-in audio
          resetBarge();
          bd.gateOpen = true; bd.hangMs = 0;
        } else {
          emit(silence());
        }

      } else {
        resetBarge();
        if (!NOISE_GATE_ENABLED) {
          if (rms < bd.floor * 2 + 0.002) bd.floor = bd.floor * 0.97 + rms * 0.03;
          emit(i16);
        } else {
          const openTh = Math.max(GATE_OPEN_MIN_RMS, bd.floor * 3, speakerCap(SPEAKER_LOCK, 0.05));
          const closeTh = Math.max(GATE_CLOSE_MIN_RMS, bd.floor * 2, speakerCap(SPEAKER_LOCK / 2, 0.025));

          if (!bd.gateOpen) {
            if (rms < bd.floor * 2 + 0.002) bd.floor = bd.floor * 0.97 + rms * 0.03;
            bd.speechLevel *= 0.9995;                    // forget slowly (customer may move away)
            bd.pre.push(i16);
            bd.preSamples += i16.length;
            while (bd.pre.length > 1 && bd.preSamples > 16 * GATE_PREROLL_MS) {
              bd.preSamples -= bd.pre.shift().length;
            }
            bd.openMs = rms > openTh ? bd.openMs + dtMs : 0;
            if (bd.openMs >= GATE_OPEN_MS) {
              bd.gateOpen = true; bd.hangMs = 0; bd.openMs = 0;
              for (const p of bd.pre) emit(p);           // voice found: send it WITH its lead-in
              bd.pre = []; bd.preSamples = 0;
            } else {
              emit(silence());                           // noise: STT hears silence
            }
          } else {
            emit(i16);
            if (rms > closeTh) {
              bd.hangMs = 0;
              if (rms > openTh) {                        // learn the customer's own voice level
                bd.speechLevel = bd.speechLevel === 0 ? rms : bd.speechLevel * 0.98 + rms * 0.02;
              }
            } else {
              bd.hangMs += dtMs;
              if (bd.hangMs >= GATE_HANG_MS) bd.gateOpen = false;
            }
          }
        }
      }

      while (pendingLen >= FRAME_SAMPLES) {
        const all = new Int16Array(pendingLen);
        let o = 0;
        for (const p of pending) { all.set(p, o); o += p.length; }
        sendFrame(all.subarray(0, FRAME_SAMPLES));
        const rest = all.slice(FRAME_SAMPLES);
        pending = rest.length ? [rest] : [];
        pendingLen = rest.length;
      }
    };

    // tell the backend to open the Sarvam realtime session
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stt_start" }));
    }

    // consent recording reuses the SAME stream (one mic prompt, two consumers)
    if (consentRef.current && window.MediaRecorder) {
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start(1000);
      recorderRef.current = rec;
    }
  }, [stopAudio, doneSpeaking]);

  // ---------- messaging ----------
  const sendText = useCallback((text) => {
    const t = (text || "").trim();
    if (!t || wsRef.current?.readyState !== WebSocket.OPEN) return;
    setTyping(true);
    wsRef.current.send(JSON.stringify({ type: "user_text", text: t }));
  }, []);

  // ---------- lifecycle ----------
  const finish = useCallback((packet) => {
    if (finishedRef.current) {            // already ended — no double upload / phase flip
      if (packet) setEnded(packet);       // late server summary still captured
      return;
    }
    finishedRef.current = true;
    activeRef.current = false;
    stopAudio();
    clearInterval(timerRef.current);
    setPhase("ended");
    setTyping(false);
    setPartial(null);
    if (packet) setEnded(packet);

    // stop recorder -> upload -> then refresh history
    const rec = recorderRef.current;
    stopMic();
    if (rec && rec.state !== "inactive") {
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const callId = callIdRef.current;
        if (blob.size > 0 && callId) {
          const fd = new FormData();
          fd.append("file", blob, `call_${callId}.webm`);
          try {
            await apiFetch(`/api/calls/${callId}/recording`,
                           { method: "POST", body: fd });
          } catch {
            setError("Recording upload failed — is uvicorn running on :8000?");
          }
        }
        onCallEnded?.();
      };
      try { rec.stop(); } catch { onCallEnded?.(); }
    } else {
      onCallEnded?.();
    }
  }, [onCallEnded, stopMic, apiFetch, stopAudio]);

  // accepts `email` and sends it to the backend as customer_email
  const startCall = useCallback(({ name, email, consent: recConsent }) => {
    if (phase !== "idle" && phase !== "ended") return;
    finishedRef.current = false;          // reset the finish guard for the new call
    awaitingRef.current = 0;
    holdUntilRef.current = 0;
    turnT0Ref.current = performance.now();   // greeting latency is measured from the Start click
    consentRef.current = !!recConsent;    // read by startMic for the consent recording
    aiQueueRef.current = Promise.resolve();
    setError(null); setTranscript([]); setPartial(null); setElapsed(0); setEnded(null); setTyping(false);
    setCustomerName(name || "Customer");
    setConsent(!!recConsent);
    callIdRef.current = null;
    recorderRef.current = null;
    setLive({ buying_intent: 50, sentiment: "Neutral", topic: "General", speaking: false });
    setPhase("connecting");

    const ws = new WebSocket(withToken(WS_URL));
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({
      type: "start_call",
      customer_name: name || "Customer",
      customer_email: (email || "").trim(),
      recording_consent: !!recConsent,
    }));

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "call_started") {
        activeRef.current = true;
        callIdRef.current = msg.call_id;   // needed for the recording upload
        setPhase("in_call");
        startMic();                        // streams mic to STT; also records if consent was given
      } else if (msg.type === "stt_partial") {
        // live words while the customer is still speaking
        if (!speakingRef.current) {
          setPartial((p) => ({ text: msg.text, ts: p?.ts || new Date().toISOString() }));
        }
      } else if (msg.type === "transcript") {
        if (msg.sender !== "ai") {
          // final customer sentence: replaces the live bubble, agent is now thinking
          setPartial(null);
          if (speakingRef.current) { stopAudio(); doneSpeaking(); holdUntilRef.current = 0; }
          turnT0Ref.current = performance.now();            // latency clock: customer finished
          setTranscript((t) => [...t, msg]);
          awaitingRef.current += 1;
          setTyping(true);
        } else {
          setLive((l) => ({ ...l, buying_intent: msg.buying_intent,
                           sentiment: msg.sentiment, topic: msg.topic }));
          // A reply is "stale" if the customer already said something newer (they interrupted or
          // corrected themselves while the agent was thinking). Show its text, but don't speak it.
          awaitingRef.current = Math.max(0, awaitingRef.current - 1);
          const stale = awaitingRef.current > 0;

          // Queue so replies stay in order. Text shows and the first sentence starts speaking together.
          aiQueueRef.current = aiQueueRef.current.then(async () => {
            if (stale) {
              if (activeRef.current) setTranscript((t) => [...t, msg]);   // typing dots stay on
              return;
            }
            stopAudio();                                  // cut any previous reply
            const id = speakIdRef.current;
            const chunks = speakerRef.current ? splitReply(msg.text) : [];
            const urlPromises = chunks.map((c) => fetchTtsUrl(c));   // all clips download in parallel
            if (urlPromises.length) await urlPromises[0];            // only the FIRST must be ready
            if (!activeRef.current) {                     // call ended while we waited
              urlPromises.forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)));
              return;
            }
            console.info(`[latency] first audio ready ${Math.round(performance.now() - turnT0Ref.current)} ms after ` +
                         `${turnT0Ref.current ? "the trigger (Start click / you finishing)" : "start"}`);
            if (awaitingRef.current > 0) {                // customer spoke again while TTS loaded
              urlPromises.forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)));
              setTranscript((t) => [...t, msg]);
              return;
            }
            setTranscript((t) => [...t, msg]);
            setTyping(false);
            if (chunks.length) speakReply(chunks, urlPromises, id);   // not awaited: plays in background
          });
        }
      } else if (msg.type === "stt_empty") {
        setPartial(null);
        if (awaitingRef.current === 0) setTyping(false);
        if (msg.message) setError(msg.message);
      } else if (msg.type === "call_ended") {
        finish(msg);
      } else if (msg.type === "error") {
        awaitingRef.current = 0;
        setTyping(false);
        setError(msg.message);
      }
    };

    ws.onerror = () => setError("Could not connect. Check that the backend is running, or sign in again.");
    ws.onclose = () => { if (activeRef.current) finish(null); };
  }, [phase, fetchTtsUrl, speakReply, stopAudio, doneSpeaking, finish, startMic, withToken]);

  const endCall = useCallback(() => {
    if (phase !== "in_call") return;      // extra clicks are ignored
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "end_call" }));
      }
    } catch {}
    finish(null);                          // end NOW; don't wait for the server
  }, [phase, finish]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      mutedRef.current = !m;               // the audio loop checks mutedRef itself
      return !m;
    });
  }, []);

  useEffect(() => {
    if (phase !== "in_call") return;
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => () => {   // cleanup on unmount
    activeRef.current = false;
    stopAudio();
    clearInterval(timerRef.current);
    stopMic();
    wsRef.current?.close();
  }, [stopMic, stopAudio]);

  // The live (partial) sentence is appended as a normal customer bubble, flagged `partial: true`,
  // so TranscriptPanel shows it without any UI change.
  const shownTranscript = useMemo(
    () => (partial
      ? [...transcript, { type: "transcript", sender: "customer", text: partial.text,
                          timestamp: partial.ts, partial: true }]
      : transcript),
    [transcript, partial],
  );

  return { phase, transcript: shownTranscript, typing, live, customerName, consent, elapsed,
           muted, ended, error, hasVoice, speakerOn,
           startCall, endCall, sendText, toggleMute, toggleSpeaker };
}