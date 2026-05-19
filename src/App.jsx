import { useState, useEffect, useRef, useCallback } from "react";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LANGUAGE DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const LANGUAGES = [
  { code: "en", name: "English",    flag: "🇬🇧", bcp: "en-US",  nativeName: "English"   },
  { code: "hi", name: "Hindi",      flag: "🇮🇳", bcp: "hi-IN",  nativeName: "हिन्दी"    },
  { code: "ta", name: "Tamil",      flag: "🇮🇳", bcp: "ta-IN",  nativeName: "தமிழ்"    },
  { code: "te", name: "Telugu",     flag: "🇮🇳", bcp: "te-IN",  nativeName: "తెలుగు"   },
  { code: "kn", name: "Kannada",    flag: "🇮🇳", bcp: "kn-IN",  nativeName: "ಕನ್ನಡ"    },
  { code: "mr", name: "Marathi",    flag: "🇮🇳", bcp: "mr-IN",  nativeName: "मराठी"    },
  { code: "bn", name: "Bengali",    flag: "🇧🇩", bcp: "bn-IN",  nativeName: "বাংলা"    },
  { code: "es", name: "Spanish",    flag: "🇪🇸", bcp: "es-ES",  nativeName: "Español"   },
  { code: "fr", name: "French",     flag: "🇫🇷", bcp: "fr-FR",  nativeName: "Français"  },
  { code: "de", name: "German",     flag: "🇩🇪", bcp: "de-DE",  nativeName: "Deutsch"   },
  { code: "ja", name: "Japanese",   flag: "🇯🇵", bcp: "ja-JP",  nativeName: "日本語"    },
  { code: "zh", name: "Chinese",    flag: "🇨🇳", bcp: "zh-CN",  nativeName: "中文"      },
  { code: "ar", name: "Arabic",     flag: "🇸🇦", bcp: "ar-SA",  nativeName: "العربية"   },
  { code: "ru", name: "Russian",    flag: "🇷🇺", bcp: "ru-RU",  nativeName: "Русский"   },
  { code: "pt", name: "Portuguese", flag: "🇧🇷", bcp: "pt-BR",  nativeName: "Português" },
  { code: "ko", name: "Korean",     flag: "🇰🇷", bcp: "ko-KR",  nativeName: "한국어"    },
];
const LMAP = Object.fromEntries(LANGUAGES.map(l => [l.code, l]));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TTS ENGINE — picks best voice for each language
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
let _voiceCache = [];
function loadVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const v = window.speechSynthesis.getVoices();
  if (v.length) _voiceCache = v;
}
if (typeof window !== "undefined") {
  loadVoices();
  window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
}

function getBestVoice(langCode) {
  const lang = LMAP[langCode];
  if (!lang) return null;
  const voices = _voiceCache.length ? _voiceCache : (window.speechSynthesis?.getVoices() || []);
  const bcp = lang.bcp;
  const base = bcp.slice(0, 2).toLowerCase();
  return (
    voices.find(v => v.lang === bcp) ||
    voices.find(v => v.lang.toLowerCase().startsWith(bcp.toLowerCase())) ||
    voices.find(v => v.lang.toLowerCase().startsWith(base)) ||
    null
  );
}

function speakText(text, langCode, rate = 0.88) {
  return new Promise(resolve => {
    if (!window.speechSynthesis || !text?.trim()) { resolve(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.trim());
    u.lang = LMAP[langCode]?.bcp || "en-US";
    u.rate = rate;
    u.pitch = 1;
    u.volume = 1;
    const voice = getBestVoice(langCode);
    if (voice) u.voice = voice;
    u.onend = resolve;
    u.onerror = resolve;
    setTimeout(() => window.speechSynthesis.speak(u), 80);
  });
}

async function speakSequence(items) {
  for (const item of items) {
    if (!item?.text?.trim()) continue;
    await speakText(item.text, item.lang);
    await new Promise(r => setTimeout(r, 350));
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CLAUDE API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const MODEL = "claude-sonnet-4-20250514";

async function claudeCall(prompt, maxTokens = 600) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return data.content?.find(b => b.type === "text")?.text?.trim() || "";
  } catch { return ""; }
}

async function detectLanguage(text) {
  if (!text?.trim() || text.trim().length < 2) return "en";
  const r = await claudeCall(
    `What language is this text? Reply with ONLY the 2-letter ISO 639-1 code (en, hi, ta, te, kn, fr, de, ja, zh, ar, ru, es, pt, ko, mr, bn, etc). Nothing else.\nText: "${text.slice(0, 300)}"`
  );
  const code = r.toLowerCase().replace(/[^a-z]/g, "").slice(0, 2);
  return LMAP[code] ? code : "en";
}

async function translateFull(text, fromLang, toLang) {
  if (!text?.trim()) return { translation: "", pronunciation: "", tip: "" };
  if (fromLang === toLang) return { translation: text, pronunciation: "", tip: "" };
  const from = LMAP[fromLang]?.name || fromLang;
  const to = LMAP[toLang]?.name || toLang;
  const raw = await claudeCall(
    `Translate from ${from} to ${to}. Return ONLY valid JSON with no markdown:\n{"translation":"...","pronunciation":"romanized/phonetic pronunciation of the translation","tip":"one brief usage note or cultural context"}\n\nText to translate: "${text}"`,
    700
  );
  try {
    const clean = raw.replace(/```[\w]*/g, "").replace(/```/g, "").trim();
    const j = JSON.parse(clean);
    return { translation: j.translation || text, pronunciation: j.pronunciation || "", tip: j.tip || "" };
  } catch {
    const simple = await claudeCall(`Translate this from ${from} to ${to}. Return ONLY the translated text, nothing else:\n${text}`);
    return { translation: simple || text, pronunciation: "", tip: "" };
  }
}

async function batchTranslate(words, toLang) {
  if (!words.length) return {};
  const toName = LMAP[toLang]?.name || toLang;
  const raw = await claudeCall(
    `Translate each English phrase to ${toName}. Return ONLY a JSON object mapping each original phrase to its translation. No markdown, no backticks, no extra text:\n${JSON.stringify(words)}`,
    1200
  );
  try {
    const clean = raw.replace(/```[\w]*/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    const out = {};
    for (const w of words) {
      const t = await claudeCall(`Translate to ${toName}, return ONLY the translation: ${w}`);
      out[w] = t || w;
    }
    return out;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const PHRASE_CATS = {
  "Essentials": ["Hello","Thank you","Please","Sorry","Yes","No","Help","Excuse me","Goodbye","You're welcome"],
  "Food":       ["Water","Menu","Bill please","Vegetarian","Too spicy","Delicious","I am hungry","No sugar","Take away","Cheers"],
  "Navigation": ["Where is the exit","Toilet","Hotel","Hospital","Airport","Bus stop","Train station","Police station","Turn left","Go straight"],
  "Shopping":   ["How much does this cost","Too expensive","Any discount","I will take this","Card payment","Give me receipt","Is it open","Is it closed","Is this free","Is there a sale"],
  "Emergency":  ["Call a doctor","Call an ambulance","Fire","I need help","Call the police","I am lost","I am injured","I am allergic to this","Where is emergency exit","I am safe now"],
};

const CHALLENGES = [
  { id:1, emoji:"🍳", name:"Kitchen",    words:["Refrigerator","Stove","Bowl","Knife","Spoon","Plate"], xp:50 },
  { id:2, emoji:"🛒", name:"Market",     words:["Price","Buy","Sell","Cheap","Expensive","Receipt"],    xp:60 },
  { id:3, emoji:"🏥", name:"Hospital",   words:["Doctor","Medicine","Pain","Emergency","Nurse","Blood"],xp:80 },
  { id:4, emoji:"🚆", name:"Transport",  words:["Train","Bus","Ticket","Platform","Departure","Arrival"],xp:55 },
  { id:5, emoji:"🍽️", name:"Restaurant", words:["Menu","Order","Bill","Waiter","Spicy","Vegetarian"],   xp:45 },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SHARED STYLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const S = {
  page: { minHeight:"100vh", background:"#05050f", color:"#fff", fontFamily:"'SF Pro Display','Segoe UI',system-ui,sans-serif", display:"flex", flexDirection:"column" },
  card: { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:16, padding:"14px 16px" },
  backBtn: { background:"none", border:"none", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:22, padding:0, display:"flex", alignItems:"center" },
  head: { padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", gap:12 },
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AR CAMERA SCREEN — fully rebuilt
   KEY FIX: We detect what language the text IS, then translate
   TO the user's chosen target. Labels show the TARGET translation.
   Audio: DETECTED language first → TARGET language second.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ARScreen({ targetLang, onBack }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const streamRef = useRef(null);
  const scanRef   = useRef(null);
  const mounted   = useRef(true);
  const scanning  = useRef(false);

  const [camReady,  setCamReady]  = useState(false);
  const [camDenied, setCamDenied] = useState(false);
  const [ocrReady,  setOcrReady]  = useState(false);
  const [ocrStatus, setOcrStatus] = useState("Loading OCR engine…");
  const [labels,    setLabels]    = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [facing,    setFacing]    = useState("environment");
  const [toast,     setToast]     = useState("");
  const [isSpeaking,setIsSpeaking]= useState(false);
  const [statusMsg, setStatusMsg] = useState("Initializing…");

  const tgtLang = LMAP[targetLang] || LMAP.en;

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  /* ── Camera ── */
  const startCam = useCallback(async () => {
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCamReady(true);
        };
      }
    } catch (e) {
      if (e.name === "NotAllowedError") setCamDenied(true);
      else showToast("Camera error: " + e.message);
    }
  }, [facing]);

  useEffect(() => {
    mounted.current = true;
    startCam();
    return () => {
      mounted.current = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(scanRef.current);
      workerRef.current?.terminate();
      window.speechSynthesis?.cancel();
    };
  }, [startCam]);

  /* ── Load Tesseract ── */
  useEffect(() => {
    const tryInit = () => { if (window.Tesseract) { initOCR(); } };
    if (window.Tesseract) { initOCR(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload  = () => { if (mounted.current) initOCR(); };
    s.onerror = () => { if (mounted.current) setOcrStatus("OCR load failed — try reloading"); };
    document.head.appendChild(s);
  }, []);

  async function initOCR() {
    try {
      setOcrStatus("Loading text recognition…");
      const worker = await window.Tesseract.createWorker(["eng", "hin", "tam", "tel", "kan"], 1, {
        logger: () => {},
      });
      await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "6" });
      workerRef.current = worker;
      if (mounted.current) { setOcrReady(true); setOcrStatus(""); setStatusMsg("Point camera at text"); }
    } catch (err) {
      if (mounted.current) setOcrStatus("OCR failed: " + (err?.message || "reload page"));
    }
  }

  /* ── Auto scan every 5s ── */
  useEffect(() => {
    if (!camReady || !ocrReady) return;
    scanRef.current = setInterval(doScan, 5000);
    return () => clearInterval(scanRef.current);
  }, [camReady, ocrReady, targetLang]);

  const doScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current) return;
    if (scanning.current) return;
    const v = videoRef.current;
    if (v.readyState < 2 || v.paused) return;

    scanning.current = true;
    setStatusMsg("Scanning…");

    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    c.width  = v.videoWidth  || 1280;
    c.height = v.videoHeight || 720;

    // Enhanced preprocessing for better OCR
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    // Convert to grayscale + increase contrast
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      const contrast = Math.min(255, Math.max(0, (gray - 128) * 2.2 + 128));
      d[i] = d[i+1] = d[i+2] = contrast;
    }
    ctx.putImageData(imgData, 0, 0);

    try {
      const { data } = await workerRef.current.recognize(c);
      if (!mounted.current) { scanning.current = false; return; }

      // Extract clean text blocks — ignore junk
      const lines = (data.lines || []).filter(ln =>
        ln.confidence > 55 &&
        ln.text.trim().length >= 3 &&
        !/^[\s\W_]+$/.test(ln.text.trim())  // not just symbols/spaces
      );

      if (!lines.length) {
        setStatusMsg("No clear text found — move closer");
        scanning.current = false;
        return;
      }

      // Merge into meaningful groups (max 5 shown)
      const groups = buildGroups(lines, c.width, c.height).slice(0, 5);

      if (!groups.length) {
        setStatusMsg("No readable text — try better lighting");
        scanning.current = false;
        return;
      }

      setScanCount(n => n + 1);
      // Show placeholder labels immediately
      const init = groups.map((g, i) => ({
        id: `${Date.now()}_${i}`,
        originalText: g.text,
        detectedLang: null,
        translation: null,
        pronunciation: "",
        tip: "",
        x: g.x, y: g.y, w: g.w, h: g.h,
        phase: "detecting",
      }));
      if (mounted.current) setLabels(init);
      setStatusMsg(`Reading ${init.length} text block${init.length > 1 ? "s" : ""}…`);

      // Process each group: detect lang → translate → update
      let spokenFirst = false;
      for (let i = 0; i < init.length; i++) {
        if (!mounted.current) break;
        const item = init[i];
        try {
          // 1. Detect language of the text
          const detLang = await detectLanguage(item.originalText);
          if (!mounted.current) break;
          init[i] = { ...item, detectedLang: detLang, phase: "translating" };
          setLabels([...init]);

          // 2. Translate to user's target language
          let translation = item.originalText;
          let pronunciation = "";
          let tip = "";

          if (detLang !== targetLang) {
            const res = await translateFull(item.originalText, detLang, targetLang);
            translation  = res.translation;
            pronunciation = res.pronunciation;
            tip          = res.tip;
          }
          if (!mounted.current) break;

          init[i] = { ...init[i], translation, pronunciation, tip, phase: "done" };
          setLabels([...init]);

          // 3. Auto-speak FIRST result: original lang first, then target lang
          if (!spokenFirst && translation) {
            spokenFirst = true;
            setIsSpeaking(true);
            const seq = [];
            if (item.originalText?.trim()) seq.push({ text: item.originalText, lang: detLang });
            if (translation && translation !== item.originalText) seq.push({ text: translation, lang: targetLang });
            speakSequence(seq).then(() => { if (mounted.current) setIsSpeaking(false); });
          }
        } catch { /* skip */ }
      }
      setStatusMsg(`${init.filter(l=>l.phase==="done").length} translated — tap to hear`);
    } catch (err) {
      if (mounted.current) setStatusMsg("Scan error — try again");
    }
    scanning.current = false;
  }, [targetLang]);

  function buildGroups(lines, W, H) {
    const seen = new Set();
    return lines
      .map(ln => {
        const text = ln.text.trim().replace(/\s+/g, " ");
        const key = text.toLowerCase().replace(/\W/g, "");
        if (key.length < 2 || seen.has(key)) return null;
        seen.add(key);
        const b = ln.bbox;
        return {
          text,
          x: Math.max(0, (b.x0 / W) * 100),
          y: Math.max(0, (b.y0 / H) * 100),
          w: ((b.x1 - b.x0) / W) * 100,
          h: ((b.y1 - b.y0) / H) * 100,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.y - b.y);
  }

  function handleLabelTap(lbl) {
    setSelected(s => s?.id === lbl.id ? null : lbl);
    if (lbl.phase !== "done") return;
    // Speak: detected language first, then target translation
    const seq = [];
    if (lbl.originalText && lbl.detectedLang) seq.push({ text: lbl.originalText, lang: lbl.detectedLang });
    if (lbl.translation && lbl.translation !== lbl.originalText) seq.push({ text: lbl.translation, lang: targetLang });
    if (seq.length) {
      setIsSpeaking(true);
      speakSequence(seq).then(() => { if (mounted.current) setIsSpeaking(false); });
    }
  }

  if (camDenied) return (
    <div style={{ height:"100vh", background:"#000", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, padding:32, textAlign:"center", color:"#fff" }}>
      <div style={{ fontSize:60 }}>📷</div>
      <div style={{ fontSize:22, fontWeight:700 }}>Camera Access Required</div>
      <p style={{ fontSize:14, color:"rgba(255,255,255,0.45)", lineHeight:1.8, maxWidth:300 }}>
        Please allow camera permission in your browser settings, then reload the page.
      </p>
      <button onClick={onBack} style={{ background:"#00d4ff", border:"none", borderRadius:14, padding:"13px 32px", color:"#000", fontWeight:700, fontSize:15, cursor:"pointer" }}>← Go Back</button>
    </div>
  );

  const isLive = ocrReady && !scanning.current;

  return (
    <div style={{ position:"relative", width:"100%", height:"100svh", background:"#000", overflow:"hidden" }}>
      <style>{`
        @keyframes scanPulse { 0%{top:8%} 100%{top:88%} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes popIn { from{opacity:0;transform:scale(0.8) translateY(4px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes waveBar { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes dotPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
      `}</style>

      <video ref={videoRef} playsInline muted autoPlay
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
      <canvas ref={canvasRef} style={{ display:"none" }} />

      {/* Vignette overlay */}
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 50% 40%,transparent 30%,rgba(0,0,0,0.6) 100%)", pointerEvents:"none", zIndex:2 }} />

      {/* Scanning beam */}
      {scanning.current && (
        <div style={{ position:"absolute", left:0, right:0, height:2, background:"linear-gradient(90deg,transparent 0%,rgba(0,212,255,0.9) 50%,transparent 100%)", animation:"scanPulse 1.6s ease-in-out infinite", zIndex:10, pointerEvents:"none" }} />
      )}

      {/* Viewfinder corners */}
      {[
        { top:58, left:14 },
        { top:58, right:14 },
        { bottom:120, left:14 },
        { bottom:120, right:14 },
      ].map((pos, i) => {
        const isTop = pos.top !== undefined;
        const isLeft = pos.left !== undefined;
        return (
          <div key={i} style={{
            position:"absolute", zIndex:5, pointerEvents:"none", width:28, height:28,
            ...pos,
            borderTop: isTop ? "2px solid rgba(0,212,255,0.8)" : undefined,
            borderBottom: !isTop ? "2px solid rgba(0,212,255,0.8)" : undefined,
            borderLeft: isLeft ? "2px solid rgba(0,212,255,0.8)" : undefined,
            borderRight: !isLeft ? "2px solid rgba(0,212,255,0.8)" : undefined,
          }} />
        );
      })}

      {/* AR LABELS */}
      {labels.map(lbl => {
        const isSel = selected?.id === lbl.id;
        const isDone = lbl.phase === "done";
        const isDetecting = lbl.phase === "detecting";
        const labelText = isDone ? (lbl.translation || lbl.originalText) : isDetecting ? "detecting…" : "translating…";
        const detLangInfo = lbl.detectedLang ? LMAP[lbl.detectedLang] : null;

        return (
          <div key={lbl.id} onClick={() => handleLabelTap(lbl)}
            style={{
              position:"absolute",
              left: `${Math.min(lbl.x, 60)}%`,
              top: `${lbl.y}%`,
              zIndex: 20,
              cursor: "pointer",
              animation: "popIn 0.2s ease",
              maxWidth: "55vw",
            }}>
            {/* Box around original text */}
            <div style={{
              position:"absolute",
              inset: -6,
              minWidth: `${Math.max(lbl.w, 10)}vw`,
              minHeight: `${Math.max(lbl.h, 2)}vh`,
              border: `1.5px solid ${isSel ? "#00d4ff" : "rgba(0,212,255,0.35)"}`,
              borderRadius: 6,
              pointerEvents:"none",
              boxSizing:"border-box",
              transition:"border-color 0.2s",
            }} />

            {/* Translation bubble */}
            <div style={{
              background: isSel ? "#00d4ff" : "rgba(0,6,20,0.92)",
              color: isSel ? "#000" : "#00d4ff",
              border: `1px solid ${isSel ? "#00d4ff" : "rgba(0,212,255,0.5)"}`,
              borderRadius: 10,
              padding: "5px 12px",
              fontSize: 14,
              fontWeight: 700,
              backdropFilter: "blur(20px)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              transition: "all 0.2s",
              marginTop: -4,
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}>
              {!isDone && (
                <div style={{ display:"flex", gap:3 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width:4, height:4, borderRadius:"50%", background:"rgba(0,212,255,0.7)", animation:`dotPulse 1s ${i*0.2}s infinite` }} />
                  ))}
                </div>
              )}
              {isDone && detLangInfo && detLangInfo.code !== targetLang && (
                <span style={{ fontSize:11, opacity:0.6 }}>{tgtLang.flag}</span>
              )}
              <span style={{ maxWidth: "48vw", overflow:"hidden", textOverflow:"ellipsis" }}>
                {labelText}
              </span>
            </div>
          </div>
        );
      })}

      {/* TOP HUD */}
      <div style={{
        position:"absolute", top:0, left:0, right:0, zIndex:30,
        padding:"12px 14px",
        background:"linear-gradient(to bottom,rgba(0,0,0,0.88) 0%,transparent 100%)",
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <button onClick={onBack} style={{
          background:"rgba(0,0,0,0.65)", border:"1px solid rgba(255,255,255,0.15)",
          color:"#fff", borderRadius:22, padding:"7px 16px", fontSize:13, cursor:"pointer",
          fontFamily:"inherit", fontWeight:600,
        }}>← Back</button>

        <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(0,0,0,0.65)", borderRadius:22, padding:"6px 13px", border:"1px solid rgba(0,212,255,0.2)" }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background: ocrReady ? (scanning.current ? "#ff9500" : "#00e676") : "#555", animation: ocrReady && !scanning.current ? "blink 2s infinite" : "none" }} />
          <span style={{ fontSize:11, color:"rgba(255,255,255,0.85)", letterSpacing:1.5, fontWeight:700 }}>
            {!ocrReady ? "LOADING" : scanning.current ? "SCANNING" : "LIVE"}
          </span>
        </div>

        <div style={{ background:"rgba(0,0,0,0.65)", border:"1px solid rgba(0,212,255,0.25)", borderRadius:22, padding:"6px 13px", fontSize:12, color:"#00d4ff", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
          {tgtLang.flag} {tgtLang.name}
        </div>
      </div>

      {/* Speaking indicator */}
      {isSpeaking && (
        <div style={{
          position:"absolute", top:66, left:"50%", transform:"translateX(-50%)",
          background:"rgba(0,212,255,0.1)", border:"1px solid rgba(0,212,255,0.4)",
          borderRadius:22, padding:"7px 18px", zIndex:35, display:"flex", alignItems:"center", gap:10,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:3 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width:3, background:"#00d4ff", borderRadius:2, height:16, transformOrigin:"center", animation:`waveBar 0.7s ${i*0.12}s infinite` }} />
            ))}
          </div>
          <span style={{ fontSize:11, color:"#00d4ff", letterSpacing:1.5, fontWeight:700 }}>SPEAKING</span>
        </div>
      )}

      {/* Side controls */}
      <div style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", display:"flex", flexDirection:"column", gap:10, zIndex:30 }}>
        <button onClick={() => setFacing(f => f === "environment" ? "user" : "environment")} title="Flip camera"
          style={{ width:46, height:46, background:"rgba(0,0,0,0.7)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:13, color:"#fff", cursor:"pointer", fontSize:22, display:"flex", alignItems:"center", justifyContent:"center" }}>
          🔄
        </button>
        <button onClick={doScan} title="Scan now"
          style={{ width:46, height:46, background:"rgba(0,212,255,0.12)", border:"1px solid rgba(0,212,255,0.35)", borderRadius:13, color:"#00d4ff", cursor:"pointer", fontSize:22, display:"flex", alignItems:"center", justifyContent:"center" }}>
          📸
        </button>
        {labels.length > 0 && (
          <button onClick={() => { setLabels([]); setSelected(null); setStatusMsg("Cleared — point at text"); }} title="Clear labels"
            style={{ width:46, height:46, background:"rgba(255,50,50,0.1)", border:"1px solid rgba(255,50,50,0.3)", borderRadius:13, color:"#ff5555", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
            ✕
          </button>
        )}
      </div>

      {/* OCR Loading overlay */}
      {!ocrReady && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, zIndex:25, background:"rgba(0,0,16,0.8)" }}>
          <div style={{ width:56, height:56, border:"3px solid rgba(0,212,255,0.2)", borderTopColor:"#00d4ff", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
          <div style={{ color:"#00d4ff", fontSize:14, letterSpacing:2, fontWeight:700 }}>{ocrStatus || "LOADING"}</div>
          <div style={{ color:"rgba(255,255,255,0.25)", fontSize:12, textAlign:"center", padding:"0 40px" }}>
            Multi-language OCR loading…{"\n"}First time takes ~20 seconds
          </div>
        </div>
      )}

      {/* Detail panel (tapped label) */}
      {selected ? (
        <div style={{
          position:"absolute", bottom:0, left:0, right:0, zIndex:40,
          background:"rgba(1,3,18,0.97)", backdropFilter:"blur(30px)",
          borderTop:"1px solid rgba(0,212,255,0.35)",
          padding:"20px 18px 36px",
          animation:"slideUp 0.25s ease",
        }}>
          <div style={{ display:"flex", gap:14 }}>
            <div style={{ flex:1, minWidth:0 }}>
              {/* Detected language */}
              {selected.detectedLang && (
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:2.5, marginBottom:6 }}>
                  {LMAP[selected.detectedLang]?.flag} ORIGINAL · {LMAP[selected.detectedLang]?.name?.toUpperCase()}
                </div>
              )}
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.4)", marginBottom:14, wordBreak:"break-word", lineHeight:1.6 }}>
                {selected.originalText}
              </div>
              {/* Target translation */}
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:2.5, marginBottom:6 }}>
                {tgtLang.flag} TRANSLATION · {tgtLang.name?.toUpperCase()}
              </div>
              <div style={{ fontSize:28, fontWeight:800, color:"#00d4ff", lineHeight:1.3, wordBreak:"break-word", paddingRight:60 }}>
                {selected.phase !== "done" ? (
                  <span style={{ fontSize:16, color:"rgba(0,212,255,0.5)" }}>Translating…</span>
                ) : (selected.translation || selected.originalText)}
              </div>
              {selected.pronunciation && (
                <div style={{ fontSize:14, color:"#7ec8e3", marginTop:8, fontStyle:"italic", letterSpacing:0.5 }}>
                  / {selected.pronunciation} /
                </div>
              )}
              {selected.tip && (
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.3)", marginTop:12, borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:12, lineHeight:1.8 }}>
                  💡 {selected.tip}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
              {/* Speak original */}
              <button onClick={() => selected.detectedLang && speakText(selected.originalText, selected.detectedLang)}
                title={`Hear in ${LMAP[selected.detectedLang]?.name || "original language"}`}
                style={{ width:48, height:48, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:13, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2 }}>
                <span style={{ fontSize:20 }}>🔊</span>
                <span style={{ fontSize:9, color:"rgba(255,255,255,0.35)" }}>{LMAP[selected.detectedLang]?.flag || "🌐"}</span>
              </button>
              {/* Speak translation */}
              {selected.translation && selected.translation !== selected.originalText && (
                <button onClick={() => speakText(selected.translation, targetLang)}
                  title={`Hear in ${tgtLang.name}`}
                  style={{ width:48, height:48, background:"rgba(0,212,255,0.1)", border:"1px solid rgba(0,212,255,0.35)", borderRadius:13, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2 }}>
                  <span style={{ fontSize:20 }}>🔊</span>
                  <span style={{ fontSize:9, color:"rgba(0,212,255,0.7)" }}>{tgtLang.flag}</span>
                </button>
              )}
              {/* Speak both */}
              <button onClick={() => {
                setIsSpeaking(true);
                const seq = [];
                if (selected.originalText) seq.push({ text: selected.originalText, lang: selected.detectedLang || "en" });
                if (selected.translation && selected.translation !== selected.originalText) seq.push({ text: selected.translation, lang: targetLang });
                speakSequence(seq).then(() => setIsSpeaking(false));
              }} title="Hear both languages"
                style={{ width:48, height:48, background:"rgba(255,200,0,0.08)", border:"1px solid rgba(255,200,0,0.25)", borderRadius:13, color:"#ffc800", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
                ⇄
              </button>
              {/* Copy */}
              <button onClick={() => { navigator.clipboard?.writeText(selected.translation || selected.originalText); showToast("Copied!"); }}
                style={{ width:48, height:48, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:13, color:"#666", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
                📋
              </button>
              {/* Close */}
              <button onClick={() => setSelected(null)}
                style={{ width:48, height:48, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:13, color:"#444", cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>
                ✕
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Bottom status bar */
        <div style={{
          position:"absolute", bottom:0, left:0, right:0, zIndex:30,
          padding:"14px 18px 28px",
          background:"linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 100%)",
          display:"flex", justifyContent:"space-between", alignItems:"center",
        }}>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", maxWidth:"75%" }}>{statusMsg}</div>
          <div style={{ fontSize:11, color:"rgba(0,212,255,0.4)", fontWeight:700, fontVariantNumeric:"tabular-nums" }}>
            #{scanCount}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:140, left:"50%", transform:"translateX(-50%)", background:"#fff", color:"#000", padding:"9px 24px", borderRadius:24, fontSize:13, fontWeight:700, zIndex:999, whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(0,0,0,0.5)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LANGUAGE SELECT DROPDOWN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function LangSelect({ value, onChange, label, exclude }) {
  return (
    <div style={{ flex:1 }}>
      <div style={{ fontSize:9, color:"#555", letterSpacing:1.5, marginBottom:5 }}>{label}</div>
      <div style={{ position:"relative" }}>
        <select value={value} onChange={e => onChange(e.target.value)}
          style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"10px 32px 10px 12px", color:"#fff", fontSize:14, outline:"none", cursor:"pointer", appearance:"none", WebkitAppearance:"none", fontFamily:"inherit" }}>
          {LANGUAGES.filter(l => l.code !== exclude).map(l => (
            <option key={l.code} value={l.code} style={{ background:"#111" }}>{l.flag} {l.name}</option>
          ))}
        </select>
        <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#555", pointerEvents:"none", fontSize:10 }}>▼</div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TEXT TRANSLATE SCREEN
   CORRECT FLOW:
   - Source = language the user types in
   - Target = language they want translation in
   - Hear Original = speaks in source language voice
   - Hear Translation = speaks in target language voice
   - ⇄ = hears source first, then target
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function TranslateScreen({ defaultTarget, onBack }) {
  const [srcLang, setSrcLang] = useState("hi");  // what they type
  const [tgtLang, setTgtLang] = useState(defaultTarget || "en");  // what they want
  const [input,   setInput]   = useState("");
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [spkSrc,  setSpkSrc]  = useState(false);
  const [spkTgt,  setSpkTgt]  = useState(false);

  const swap = () => {
    setSrcLang(tgtLang);
    setTgtLang(srcLang);
    if (result?.translation) { setInput(result.translation); setResult(null); }
  };

  const doTranslate = async () => {
    if (!input.trim()) return;
    setLoading(true); setResult(null);
    const r = await translateFull(input.trim(), srcLang, tgtLang);
    if (r) {
      setResult(r);
      setHistory(h => [{ input, srcLang, tgtLang, ...r }, ...h.slice(0, 9)]);
    }
    setLoading(false);
  };

  const hearSrc = async () => {
    setSpkSrc(true);
    await speakText(input, srcLang);
    setSpkSrc(false);
  };

  const hearTgt = async () => {
    setSpkTgt(true);
    await speakText(result?.translation, tgtLang);
    setSpkTgt(false);
  };

  const hearBoth = async () => {
    setSpkSrc(true); setSpkTgt(false);
    await speakText(input, srcLang);
    setSpkSrc(false); setSpkTgt(true);
    await speakText(result?.translation, tgtLang);
    setSpkTgt(false);
  };

  return (
    <div style={{ ...S.page }}>
      <div style={{ ...S.head }}>
        <button onClick={onBack} style={S.backBtn}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>Text Translate</div>
          <div style={{ fontSize:11, color:"#444", marginTop:1 }}>Claude AI · Accurate translations</div>
        </div>
      </div>

      <div style={{ flex:1, overflow:"auto", padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>
        {/* Language selection */}
        <div style={{ display:"flex", alignItems:"flex-end", gap:8 }}>
          <LangSelect value={srcLang} onChange={v => { setSrcLang(v); setResult(null); }} label="I SPEAK" exclude={tgtLang} />
          <button onClick={swap}
            style={{ flexShrink:0, width:40, height:40, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, color:"#00d4ff", cursor:"pointer", fontSize:20, display:"flex", alignItems:"center", justifyContent:"center" }}>
            ⇄
          </button>
          <LangSelect value={tgtLang} onChange={v => { setTgtLang(v); setResult(null); }} label="TRANSLATE TO" exclude={srcLang} />
        </div>

        {/* Language badges showing voice availability */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {[srcLang, tgtLang].map(lc => {
            const voice = getBestVoice(lc);
            const l = LMAP[lc];
            return (
              <div key={lc} style={{ background: voice ? "rgba(0,230,118,0.06)" : "rgba(255,100,0,0.06)", border:`1px solid ${voice ? "rgba(0,230,118,0.2)" : "rgba(255,100,0,0.2)"}`, borderRadius:20, padding:"3px 10px", fontSize:11 }}>
                {l?.flag} {l?.name} {voice ? "✓ voice" : "⚠ no voice"}
              </div>
            );
          })}
        </div>

        {/* Input textarea */}
        <div style={{ position:"relative" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && e.ctrlKey && doTranslate()}
            placeholder={`Type in ${LMAP[srcLang]?.name}…`}
            rows={4}
            style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"12px 52px 12px 14px", color:"#fff", fontSize:15, fontFamily:"inherit", resize:"vertical", outline:"none", lineHeight:1.6 }} />
          {input.trim() && (
            <button onClick={hearSrc} title={`Hear in ${LMAP[srcLang]?.name}`}
              style={{ position:"absolute", top:10, right:10, width:38, height:38, background: spkSrc ? "#00d4ff" : "rgba(0,212,255,0.1)", border:`1px solid ${spkSrc ? "#00d4ff" : "rgba(0,212,255,0.3)"}`, borderRadius:9, color: spkSrc ? "#000" : "#00d4ff", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
              🔊
            </button>
          )}
        </div>

        <button onClick={doTranslate} disabled={loading || !input.trim()}
          style={{ background: loading || !input.trim() ? "rgba(0,212,255,0.08)" : "#00d4ff", border:"none", borderRadius:11, padding:"14px", color: loading || !input.trim() ? "rgba(255,255,255,0.2)" : "#000", fontWeight:800, fontSize:14, cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontFamily:"inherit", letterSpacing:0.5 }}>
          {loading ? "Translating…" : `Translate → ${LMAP[tgtLang]?.name}`}
        </button>

        {/* Result card */}
        {result && (
          <div style={{ background:"rgba(0,212,255,0.04)", border:"1px solid rgba(0,212,255,0.2)", borderRadius:16, padding:18, position:"relative" }}>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.25)", letterSpacing:2.5, marginBottom:8 }}>
              {LMAP[tgtLang]?.flag} {LMAP[tgtLang]?.name?.toUpperCase()} TRANSLATION
            </div>
            <div style={{ fontSize:26, fontWeight:800, color:"#00d4ff", lineHeight:1.4, paddingRight:56, wordBreak:"break-word" }}>
              {result.translation}
            </div>
            {result.pronunciation && (
              <div style={{ fontSize:14, color:"#7ec8e3", marginTop:8, fontStyle:"italic" }}>
                / {result.pronunciation} /
              </div>
            )}
            {result.tip && (
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:10, marginTop:12, lineHeight:1.8 }}>
                💡 {result.tip}
              </div>
            )}
            {/* Audio controls */}
            <div style={{ position:"absolute", top:14, right:14, display:"flex", flexDirection:"column", gap:7 }}>
              <button onClick={hearSrc} title={`Hear original (${LMAP[srcLang]?.name})`}
                style={{ width:44, height:44, background: spkSrc ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:11, color:"#fff", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2 }}>
                <span style={{ fontSize:18 }}>🔊</span>
                <span style={{ fontSize:8, opacity:0.4 }}>{LMAP[srcLang]?.flag}</span>
              </button>
              <button onClick={hearBoth} title="Hear both languages in order"
                style={{ width:44, height:44, background:"rgba(255,200,0,0.08)", border:"1px solid rgba(255,200,0,0.25)", borderRadius:11, color:"#ffc800", cursor:"pointer", fontSize:17, display:"flex", alignItems:"center", justifyContent:"center" }}>
                ⇄
              </button>
              <button onClick={hearTgt} title={`Hear translation (${LMAP[tgtLang]?.name})`}
                style={{ width:44, height:44, background: spkTgt ? "#00d4ff" : "rgba(0,212,255,0.1)", border:`1px solid ${spkTgt ? "#00d4ff" : "rgba(0,212,255,0.3)"}`, borderRadius:11, color: spkTgt ? "#000" : "#00d4ff", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2 }}>
                <span style={{ fontSize:18 }}>🔊</span>
                <span style={{ fontSize:8, opacity: spkTgt ? 0.6 : 0.4 }}>{LMAP[tgtLang]?.flag}</span>
              </button>
              <button onClick={() => navigator.clipboard?.writeText(result.translation)}
                style={{ width:44, height:44, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:11, color:"#666", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>
                📋
              </button>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <div style={{ fontSize:9, color:"#2a2a2a", letterSpacing:2, marginBottom:10 }}>RECENT</div>
            {history.slice(0, 5).map((h, i) => (
              <div key={i} onClick={() => { setInput(h.input); setSrcLang(h.srcLang); setTgtLang(h.tgtLang); setResult(h); }}
                style={{ ...S.card, marginBottom:8, cursor:"pointer", opacity:0.85 }}>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span>{LMAP[h.srcLang]?.flag}</span>
                  <span style={{ fontSize:12, color:"rgba(255,255,255,0.3)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.input}</span>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:5 }}>
                  <span>{LMAP[h.tgtLang]?.flag}</span>
                  <span style={{ fontSize:14, color:"#00d4ff", fontWeight:700 }}>{h.translation}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PHRASEBOOK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function PhrasebookScreen({ targetLang, onBack }) {
  const [cat,     setCat]     = useState("Essentials");
  const [phrases, setPhrases] = useState({});
  const [loading, setLoading] = useState(false);
  const lang = LMAP[targetLang];

  useEffect(() => {
    const words = PHRASE_CATS[cat] || [];
    const missing = words.filter(w => !phrases[w]);
    if (!missing.length) return;
    setLoading(true);
    batchTranslate(missing, targetLang).then(map => {
      setPhrases(p => ({ ...p, ...map }));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [cat, targetLang]);

  return (
    <div style={{ ...S.page }}>
      <div style={{ ...S.head }}>
        <button onClick={onBack} style={S.backBtn}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>Phrasebook</div>
          <div style={{ fontSize:11, color:"#444", marginTop:1 }}>{lang?.flag} {lang?.name}</div>
        </div>
        {loading && <div style={{ fontSize:11, color:"#ff9500", fontWeight:600 }}>Translating…</div>}
      </div>

      <div style={{ padding:"10px 14px", display:"flex", gap:6, overflowX:"auto", borderBottom:"1px solid rgba(255,255,255,0.05)", scrollbarWidth:"none" }}>
        {Object.keys(PHRASE_CATS).map(c => (
          <button key={c} onClick={() => setCat(c)}
            style={{ flexShrink:0, background: cat===c ? "#ff9500" : "rgba(255,255,255,0.05)", border:"none", borderRadius:20, padding:"7px 15px", color: cat===c ? "#000" : "#666", fontSize:12, fontWeight: cat===c ? 800 : 400, cursor:"pointer", fontFamily:"inherit" }}>
            {c}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflow:"auto", padding:"12px 16px" }}>
        <div style={{ fontSize:10, color:"#2a2a2a", letterSpacing:2, marginBottom:14 }}>
          {LMAP["en"]?.flag} English &nbsp;→&nbsp; {lang?.flag} {lang?.name} &nbsp;·&nbsp; Tap 🔊 to hear each
        </div>
        {(PHRASE_CATS[cat] || []).map(word => {
          const tr = phrases[word];
          return (
            <div key={word} style={{ ...S.card, marginBottom:10, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.3)", marginBottom:4 }}>{word}</div>
                <div style={{ fontSize:22, fontWeight:700, color:"#ff9500", minHeight:28, wordBreak:"break-word" }}>
                  {tr ?? <span style={{ color:"#1e1e1e", fontSize:14 }}>Loading…</span>}
                </div>
              </div>
              <div style={{ display:"flex", gap:7, flexShrink:0 }}>
                <button onClick={() => speakText(word, "en")} title="Hear English"
                  style={{ width:38, height:38, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"50%", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:17, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  🔊
                </button>
                <button onClick={() => tr && speakText(tr, targetLang)} disabled={!tr}
                  title={`Hear in ${lang?.name}`}
                  style={{ width:38, height:38, background: tr ? "rgba(255,149,0,0.1)" : "rgba(255,255,255,0.02)", border:`1px solid ${tr ? "rgba(255,149,0,0.35)" : "rgba(255,255,255,0.05)"}`, borderRadius:"50%", color: tr ? "#ff9500" : "#222", cursor: tr ? "pointer" : "not-allowed", fontSize:17, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  🔊
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DAILY CHALLENGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ChallengeScreen({ targetLang, userXP, setUserXP, onBack }) {
  const [active,    setActive]    = useState(null);
  const [wordIdx,   setWordIdx]   = useState(0);
  const [answer,    setAnswer]    = useState("");
  const [feedback,  setFeedback]  = useState(null);
  const [completed, setCompleted] = useState([]);
  const [streak,    setStreak]    = useState(0);
  const [wordTr,    setWordTr]    = useState("");
  const [trLoading, setTrLoading] = useState(false);
  const lang = LMAP[targetLang];

  useEffect(() => {
    if (!active) return;
    setTrLoading(true); setWordTr("");
    translateFull(active.words[wordIdx], "en", targetLang).then(r => {
      setWordTr(r.translation || "");
      setTrLoading(false);
    });
  }, [active, wordIdx, targetLang]);

  const check = () => {
    if (!wordTr) return;
    const correct = answer.trim().toLowerCase() === wordTr.trim().toLowerCase();
    setFeedback({ correct, wordTr });
    if (correct) setStreak(s => s + 1); else setStreak(0);
    speakText(wordTr, targetLang);
  };

  const next = () => {
    if (!active) return;
    if (wordIdx < active.words.length - 1) {
      setWordIdx(i => i + 1); setAnswer(""); setFeedback(null); setWordTr("");
    } else {
      setCompleted(c => [...c, active.id]);
      setUserXP(x => x + active.xp);
      setActive(null); setWordIdx(0); setAnswer(""); setFeedback(null); setWordTr("");
    }
  };

  return (
    <div style={{ ...S.page }}>
      <div style={{ ...S.head, justifyContent:"space-between" }}>
        <button onClick={() => { setActive(null); onBack(); }} style={S.backBtn}>←</button>
        <div style={{ fontWeight:700, fontSize:16 }}>Daily Challenges</div>
        <div style={{ background:"rgba(0,230,118,0.1)", border:"1px solid rgba(0,230,118,0.25)", borderRadius:20, padding:"4px 12px", fontSize:12, color:"#00e676", fontWeight:700 }}>⚡ {userXP} XP</div>
      </div>

      {!active ? (
        <div style={{ flex:1, overflow:"auto", padding:18 }}>
          <div style={{ ...S.card, marginBottom:18, display:"flex", gap:14, alignItems:"center", borderColor:"rgba(0,230,118,0.2)", background:"rgba(0,230,118,0.04)" }}>
            <div style={{ fontSize:36 }}>🔥</div>
            <div>
              <div style={{ fontWeight:700, color:"#00e676", fontSize:16 }}>{streak} word streak</div>
              <div style={{ fontSize:12, color:"#444", marginTop:2 }}>Keep going to earn more XP</div>
            </div>
          </div>
          <div style={{ fontSize:9, color:"#2a2a2a", letterSpacing:2, marginBottom:12 }}>TODAY'S CHALLENGES</div>
          {CHALLENGES.map(ch => (
            <div key={ch.id} onClick={() => { if (!completed.includes(ch.id)) { setActive(ch); setWordIdx(0); setAnswer(""); setFeedback(null); setWordTr(""); }}}
              style={{ ...S.card, marginBottom:10, cursor: completed.includes(ch.id) ? "default" : "pointer", display:"flex", alignItems:"center", gap:14,
                borderColor: completed.includes(ch.id) ? "rgba(0,200,83,0.3)" : undefined,
                background: completed.includes(ch.id) ? "rgba(0,200,83,0.04)" : undefined }}>
              <div style={{ fontSize:30 }}>{ch.emoji}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{ch.name}</div>
                <div style={{ fontSize:12, color:"#444", marginTop:2 }}>{ch.words.length} words · {ch.xp} XP</div>
              </div>
              <div style={{ fontSize:20 }}>{completed.includes(ch.id) ? "✅" : "▶"}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex:1, padding:"22px 20px", display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:28 }}>{active.emoji}</span>
            <div>
              <div style={{ fontWeight:700, fontSize:16 }}>{active.name}</div>
              <div style={{ fontSize:12, color:"#444" }}>{wordIdx+1} / {active.words.length}</div>
            </div>
          </div>
          <div style={{ height:4, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(wordIdx/active.words.length)*100}%`, background:"#00e676", transition:"width 0.4s", borderRadius:2 }} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:9, color:"#444", letterSpacing:2, marginBottom:10 }}>
              TRANSLATE TO {lang?.name?.toUpperCase()} {lang?.flag}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <div style={{ fontSize:40, fontWeight:700 }}>{active.words[wordIdx]}</div>
              <button onClick={() => speakText(active.words[wordIdx], "en")}
                style={{ width:42, height:42, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"50%", color:"#fff", cursor:"pointer", fontSize:20, display:"flex", alignItems:"center", justifyContent:"center" }}>
                🔊
              </button>
            </div>
            <input value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !feedback && check()}
              placeholder={trLoading ? "Loading translation…" : `Type in ${lang?.name}…`}
              disabled={!!feedback || trLoading}
              style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.05)", border:`1.5px solid ${feedback ? (feedback.correct ? "#00e676" : "#ff4444") : "rgba(255,255,255,0.12)"}`, borderRadius:12, padding:"14px 16px", color:"#fff", fontSize:16, fontFamily:"inherit", outline:"none", transition:"border-color 0.2s" }} />
            {feedback && (
              <div style={{ marginTop:14, padding:14, background: feedback.correct ? "rgba(0,230,118,0.07)" : "rgba(255,68,68,0.07)", border:`1px solid ${feedback.correct ? "rgba(0,230,118,0.3)" : "rgba(255,68,68,0.3)"}`, borderRadius:12 }}>
                <div style={{ fontWeight:700, color: feedback.correct ? "#00e676" : "#ff4444", marginBottom:6 }}>
                  {feedback.correct ? "🎉 Correct!" : "❌ Not quite"}
                </div>
                {!feedback.correct && (
                  <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", display:"flex", alignItems:"center", gap:10 }}>
                    Correct: <strong style={{ color:"#fff", fontSize:15 }}>{feedback.wordTr}</strong>
                    <button onClick={() => speakText(feedback.wordTr, targetLang)}
                      style={{ background:"none", border:"none", color:"#ff9500", cursor:"pointer", fontSize:20, padding:0 }}>🔊</button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            {!feedback ? (
              <button onClick={check} disabled={!answer.trim() || trLoading}
                style={{ flex:1, background: answer.trim() && !trLoading ? "#00c853" : "rgba(0,200,83,0.1)", border:"none", borderRadius:12, padding:14, color: answer.trim() && !trLoading ? "#000" : "rgba(255,255,255,0.2)", fontWeight:700, fontSize:15, cursor: answer.trim() && !trLoading ? "pointer" : "not-allowed", fontFamily:"inherit" }}>
                {trLoading ? "Loading…" : "Check Answer"}
              </button>
            ) : (
              <>
                <button onClick={() => speakText(feedback.wordTr, targetLang)}
                  style={{ width:52, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, fontSize:22, cursor:"pointer", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center" }}>🔊</button>
                <button onClick={next}
                  style={{ flex:1, background:"#00c853", border:"none", borderRadius:12, padding:14, color:"#000", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>
                  {wordIdx < active.words.length - 1 ? "Next Word →" : "Complete! 🎉"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HOME SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function App() {
  const [screen,     setScreen]     = useState("home");
  const [tgtLang,    setTgtLang]    = useState("hi");
  const [showPicker, setShowPicker] = useState(false);
  const [userXP,     setUserXP]     = useState(120);
  const streak = 3;

  if (screen === "ar")         return <ARScreen        targetLang={tgtLang}                                   onBack={() => setScreen("home")} />;
  if (screen === "translate")  return <TranslateScreen defaultTarget={tgtLang}                                onBack={() => setScreen("home")} />;
  if (screen === "phrasebook") return <PhrasebookScreen targetLang={tgtLang}                                  onBack={() => setScreen("home")} />;
  if (screen === "challenge")  return <ChallengeScreen  targetLang={tgtLang} userXP={userXP} setUserXP={setUserXP} onBack={() => setScreen("home")} />;

  const lang  = LMAP[tgtLang];
  const level = Math.floor(userXP / 100) + 1;
  const xpPct = userXP % 100;

  return (
    <div style={{ minHeight:"100vh", background:"#05050f", color:"#fff", fontFamily:"'SF Pro Display','Segoe UI',system-ui,sans-serif", position:"relative", maxWidth:520, margin:"0 auto" }}>
      <style>{`* { box-sizing:border-box; } ::-webkit-scrollbar{width:4px;background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}`}</style>

      {/* Header */}
      <div style={{ padding:"24px 20px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:32, fontWeight:900, letterSpacing:-1.5 }}>
            <span style={{ color:"#00d4ff" }}>AR</span><span style={{ color:"#fff" }}>Lens</span>
          </div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.1)", letterSpacing:4, marginTop:2 }}>TRANSLATE THE WORLD</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
          <div style={{ background:"rgba(0,212,255,0.08)", border:"1px solid rgba(0,212,255,0.2)", borderRadius:20, padding:"4px 12px", fontSize:12, color:"#00d4ff", fontWeight:700 }}>Lv.{level} · ⚡{userXP} XP</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.1)" }}>🔥 {streak}-day streak</div>
        </div>
      </div>

      <div style={{ margin:"12px 20px 0" }}>
        <div style={{ height:3, background:"rgba(255,255,255,0.05)", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${xpPct}%`, background:"linear-gradient(90deg,#00d4ff,#0055ff)", borderRadius:2, transition:"width 0.8s" }} />
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.1)", marginTop:4 }}>{100 - xpPct} XP to Lv.{level + 1}</div>
      </div>

      {/* Target language picker button */}
      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.18)", letterSpacing:2.5, marginBottom:8 }}>TRANSLATE TO</div>
        <button onClick={() => setShowPicker(true)}
          style={{ width:"100%", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:16, padding:"14px 18px", color:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", fontFamily:"inherit" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <span style={{ fontSize:30 }}>{lang?.flag}</span>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:17, fontWeight:700 }}>{lang?.name}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.2)", marginTop:1 }}>{lang?.nativeName}</div>
            </div>
          </div>
          <span style={{ color:"#00d4ff", fontSize:18 }}>⌄</span>
        </button>
      </div>

      {/* AR Camera hero button */}
      <div style={{ padding:"14px 20px 0" }}>
        <button onClick={() => setScreen("ar")}
          style={{ width:"100%", background:"rgba(0,212,255,0.05)", border:"1.5px solid rgba(0,212,255,0.3)", borderRadius:22, padding:"26px 20px", cursor:"pointer", fontFamily:"inherit", textAlign:"center", position:"relative", overflow:"hidden" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📷</div>
          <div style={{ fontSize:21, fontWeight:800, color:"#fff" }}>Launch AR Camera</div>
          <div style={{ fontSize:13, color:"rgba(0,212,255,0.65)", marginTop:6, lineHeight:1.6 }}>
            Scan text → auto-detects language → speaks it → translates to {lang?.name}
          </div>
          <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:14, flexWrap:"wrap" }}>
            {["Auto Language Detection","Claude AI Translation","TTS Both Languages"].map(t => (
              <span key={t} style={{ background:"rgba(0,212,255,0.07)", border:"1px solid rgba(0,212,255,0.18)", borderRadius:20, padding:"3px 10px", fontSize:10, color:"rgba(0,212,255,0.55)" }}>{t}</span>
            ))}
          </div>
        </button>
      </div>

      {/* Feature grid */}
      <div style={{ padding:"12px 20px 0", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {[
          { icon:"💬", label:"Text Translate",  sub:"Type & translate both ways", color:"#00d4ff", screen:"translate"  },
          { icon:"📚", label:"Phrasebook",       sub:"Common phrases + TTS",       color:"#ff9500", screen:"phrasebook" },
          { icon:"🎮", label:"Daily Challenge",  sub:"Earn XP · Build streak",     color:"#00e676", screen:"challenge"  },
          { icon:"🔊", label:"Pronunciation",    sub:"Hear native-speaker voices", color:"#c97dff", screen:"translate"  },
        ].map(f => (
          <button key={f.label} onClick={() => setScreen(f.screen)}
            style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"16px 14px", color:"#fff", cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
            <div style={{ fontSize:26, marginBottom:8 }}>{f.icon}</div>
            <div style={{ fontSize:13, fontWeight:700 }}>{f.label}</div>
            <div style={{ fontSize:11, color:f.color, marginTop:3 }}>{f.sub}</div>
          </button>
        ))}
      </div>

      {/* How it works */}
      <div style={{ margin:"14px 20px 32px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:16, padding:"16px 18px" }}>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.1)", letterSpacing:2, marginBottom:14 }}>HOW IT WORKS</div>
        {[
          ["📷", "Camera scans text in view"],
          ["🔍", "OCR reads the text content"],
          ["🌐", "Claude detects the text's language automatically"],
          ["🔊", "Speaks the original text in its detected language"],
          ["🤖", "Claude translates it to your chosen language"],
          ["🔊", "Speaks the translation in your target language"],
          ["✨", "Tap any label to replay or see details"],
        ].map(([icon, text]) => (
          <div key={text} style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:10, lastChild:{ marginBottom:0 } }}>
            <span style={{ fontSize:15, flexShrink:0 }}>{icon}</span>
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.28)", lineHeight:1.7 }}>{text}</span>
          </div>
        ))}
      </div>

      {/* Language Picker Modal */}
      {showPicker && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:100, display:"flex", alignItems:"flex-end" }}
          onClick={() => setShowPicker(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ width:"100%", background:"#0a0a18", borderRadius:"24px 24px 0 0", padding:"22px 20px 44px", maxHeight:"78vh", overflow:"auto" }}>
            <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>Select Target Language</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.2)", marginBottom:18 }}>AR camera and all features will translate to this</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9 }}>
              {LANGUAGES.filter(l => l.code !== "en").map(l => (
                <button key={l.code} onClick={() => { setTgtLang(l.code); setShowPicker(false); }}
                  style={{ background: tgtLang===l.code ? "rgba(0,212,255,0.1)" : "rgba(255,255,255,0.03)", border:`1px solid ${tgtLang===l.code ? "rgba(0,212,255,0.5)" : "rgba(255,255,255,0.07)"}`, borderRadius:13, padding:"12px 14px", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:10, fontFamily:"inherit", textAlign:"left" }}>
                  <span style={{ fontSize:22 }}>{l.flag}</span>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{l.name}</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.22)", marginTop:1 }}>{l.nativeName}</div>
                  </div>
                  {tgtLang === l.code && <span style={{ marginLeft:"auto", color:"#00d4ff", fontSize:16 }}>✓</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setShowPicker(false)}
              style={{ width:"100%", marginTop:18, background:"rgba(255,255,255,0.03)", border:"none", borderRadius:13, padding:13, color:"rgba(255,255,255,0.25)", cursor:"pointer", fontFamily:"inherit", fontSize:14 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
