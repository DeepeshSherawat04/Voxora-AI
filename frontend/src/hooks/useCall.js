// frontend/src/hooks/useCall.js
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws/call";
const API = `${API_BASE}/api`;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function useCall(onCallEnded) {
  const [phase, setPhase] = useState("idle"); // idle | connecting | in_call | ended
  const [transcript, setTranscript] = useState([]);
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

  const wsRef = useRef(null);
  const recRef = useRef(null);
  const timerRef = useRef(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const speakingRef = useRef(false);
  const callIdRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const micStreamRef = useRef(null);

  const hasVoice = !!SR && "speechSynthesis" in window;

  // ---------- speech ----------
  const speak = useCallback((text) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    u.rate = 1;
    speakingRef.current = true;
    setLive((l) => ({ ...l, speaking: true }));
    try { recRef.current?.stop(); } catch {}           // avoid echo while Aria talks
    u.onend = u.onerror = () => {
      speakingRef.current = false;
      setLive((l) => ({ ...l, speaking: false }));
      if (activeRef.current && !mutedRef.current) startRecRef.current();
    };
    window.speechSynthesis.speak(u);
    setTimeout(() => {       
      if (!window.speechSynthesis.speaking && activeRef.current && !mutedRef.current) {
        speakingRef.current = false;
        setLive((l) => ({ ...l, speaking: false }));
        startRecRef.current();
      }
    }, 12000);
  }, []);

  const startRec = useCallback(() => {
    if (!SR || !activeRef.current || mutedRef.current || speakingRef.current) return;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      if (!r.isFinal || speakingRef.current || mutedRef.current) return;
      const text = r[0].transcript.trim();
      if (text) sendTextRef.current(text);
    };
    rec.onend = () => {                                 // auto-restart until call ends
      if (activeRef.current && !mutedRef.current && !speakingRef.current) {
        setTimeout(() => startRecRef.current(), 200);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setError("Microphone blocked — allow access or type below.");
    };
    recRef.current = rec;
    try { rec.start(); } catch {}
  }, []);

  const startRecRef = useRef(startRec);
  startRecRef.current = startRec;

  // ---------- call recording (Stage 5) ----------
  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return;
    if (recorderRef.current && recorderRef.current.state !== "inactive") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) {                        // call ended while prompting
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      micStreamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start(1000);
      recorderRef.current = rec;
    } catch {
      // mic unavailable for recording — typed input still works
    }
  }, []);

  const stopMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }, []);

  // ---------- messaging ----------
  const sendText = useCallback((text) => {
    const t = (text || "").trim();
    if (!t || wsRef.current?.readyState !== WebSocket.OPEN) return;
    setTyping(true);
    wsRef.current.send(JSON.stringify({ type: "user_text", text: t }));
  }, []);
  const sendTextRef = useRef(sendText);
  sendTextRef.current = sendText;

  // ---------- lifecycle ----------
  const finish = useCallback((packet) => {
    activeRef.current = false;
    try { recRef.current?.stop(); } catch {}
    window.speechSynthesis?.cancel();
    clearInterval(timerRef.current);
    setPhase("ended");
    setTyping(false);
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
            await fetch(`${API}/calls/${callId}/recording`,
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
  }, [onCallEnded, stopMic]);

  const startCall = useCallback(({ name, consent: recConsent }) => {
    if (phase !== "idle" && phase !== "ended") return;
    setError(null); setTranscript([]); setElapsed(0); setEnded(null); setTyping(false);
    setCustomerName(name || "Customer");
    setConsent(!!recConsent);
    callIdRef.current = null;
    recorderRef.current = null;
    setLive({ buying_intent: 50, sentiment: "Neutral", topic: "General", speaking: false });
    setPhase("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({
      type: "start_call",
      customer_name: name || "Customer",
      recording_consent: !!recConsent,
    }));

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "call_started") {
        activeRef.current = true;
        callIdRef.current = msg.call_id;   // needed for the recording upload
        setPhase("in_call");
        startRecRef.current();
        startRecording();
      } else if (msg.type === "transcript") {
        setTranscript((t) => [...t, msg]);
        if (msg.sender === "ai") {
          setTyping(false);
          setLive((l) => ({ ...l, buying_intent: msg.buying_intent,
                           sentiment: msg.sentiment, topic: msg.topic }));
          speak(msg.text);
        }
      } else if (msg.type === "call_ended") {
        finish(msg);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };

    ws.onerror = () => setError("Backend unreachable — is uvicorn running on :8000?");
    ws.onclose = () => { if (activeRef.current) finish(null); };
  }, [phase, speak, finish, startRecording]);

  const endCall = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_call" }));
    } else {
      finish(null);
    }
  }, [finish]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (next) { try { recRef.current?.stop(); } catch {} }
      else if (activeRef.current && !speakingRef.current) startRecRef.current();
      return next;
    });
  }, []);

  useEffect(() => {
    if (phase !== "in_call") return;
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => () => {   // cleanup on unmount
    activeRef.current = false;
    try { recRef.current?.stop(); } catch {}
    window.speechSynthesis?.cancel();
    clearInterval(timerRef.current);
    stopMic();
    wsRef.current?.close();
  }, [stopMic]);

  return { phase, transcript, typing, live, customerName, consent, elapsed,
           muted, ended, error, hasVoice, startCall, endCall, sendText, toggleMute };
}