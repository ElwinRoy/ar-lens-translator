import { useState, useEffect, useRef, useCallback } from "react";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LANGUAGE DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const LANGUAGES = [
  { code: "en", name: "English",    flag: "🇬🇧", bcp: "en-US", nativeName: "English" },
  { code: "hi", name: "Hindi",      flag: "🇮🇳", bcp: "hi-IN", nativeName: "हिन्दी" },
  { code: "ta", name: "Tamil",      flag: "🇮🇳", bcp: "ta-IN", nativeName: "தமிழ்" },
  { code: "te", name: "Telugu",     flag: "🇮🇳", bcp: "te-IN", nativeName: "తెలుగు" },
  { code: "kn", name: "Kannada",    flag: "🇮🇳", bcp: "kn-IN", nativeName: "ಕನ್ನಡ" },
  { code: "mr", name: "Marathi",    flag: "🇮🇳", bcp: "mr-IN", nativeName: "मराठी" },
  { code: "bn", name: "Bengali",    flag: "🇧🇩", bcp: "bn-IN", nativeName: "বাংলা" },
  { code: "es", name: "Spanish",    flag: "🇪🇸", bcp: "es-ES", nativeName: "Español" },
  { code: "fr", name: "French",     flag: "🇫🇷", bcp: "fr-FR", nativeName: "Français" },
  { code: "de", name: "German",     flag: "🇩🇪", bcp: "de-DE", nativeName: "Deutsch" },
  { code: "ja", name: "Japanese",   flag: "🇯🇵", bcp: "ja-JP", nativeName: "日本語" },
  { code: "zh", name: "Chinese",    flag: "🇨🇳", bcp: "zh-CN", nativeName: "中文" },
  { code: "ar", name: "Arabic",     flag: "🇸🇦", bcp: "ar-SA", nativeName: "العربية" },
  { code: "ru", name: "Russian",    flag: "🇷🇺", bcp: "ru-RU", nativeName: "Русский" },
  { code: "pt", name: "Portuguese", flag: "🇧🇷", bcp: "pt-BR", nativeName: "Português" },
  { code: "ko", name: "Korean",     flag: "🇰🇷", bcp: "ko-KR", nativeName: "한국어" },
];
const LMAP = Object.fromEntries(LANGUAGES.map(l => [l.code, l]));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TTS ENGINE — properly selects voice for each language
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
let _voices = [];
function refreshVoices() {
  if (window.speechSynthesis) _voices = window.speechSynthesis.getVoices();
}
if (typeof window !== "undefined") {
  refreshVoices();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }
}

function getBestVoice(langCode) {
  const lang = LMAP[langCode];
  if (!lang) return null;
  const bcp = lang.bcp;
  const voices = _voices.length ? _voices : (window.speechSynthesis?.getVoices() || []);
  return (
    voices.find(v => v.lang === bcp) ||
    voices.find(v => v.lang.toLowerCase().startsWith(bcp.toLowerCase())) ||
    voices.find(v => v.lang.toLowerCase().startsWith(bcp.slice(0,2).toLowerCase())) ||
    null
  );
}

let _speaking = false;
function speakText(text, langCode, onDone) {
  if (!window.speechSynthesis || !text?.trim()) { onDone?.(); return; }
  window.speechSynthesis.cancel();
  _speaking = true;
  const u = new SpeechSynthesisUtterance(text.trim());
  u.lang = LMAP[langCode]?.bcp || "en-US";
  u.rate = 0.85;
  u.pitch = 1;
  u.volume = 1;
  const voice = getBestVoice(langCode);
  if (voice) u.voice = voice;
  u.onend = () => { _speaking = false; onDone?.(); };
  u.onerror = () => { _speaking = false; onDone?.(); };
  setTimeout(() => window.speechSynthesis.speak(u), 100);
}

function speakSequence(items) {
  // items: [{text, lang}]
  if (!items.length) return;
  const [first, ...rest] = items;
  speakText(first.text, first.lang, () => {
    if (rest.length) setTimeout(() => speakSequence(rest), 400);
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CLAUDE API — translation + language detection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const MODEL = "claude-sonnet-4-20250514";

async function claudeCall(prompt, maxTokens = 500) {
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

// Detect language of text and return language code
async function detectLanguage(text) {
  if (!text?.trim()) return "en";
  const r = await claudeCall(
    `Detect the language of this text and return ONLY the ISO 639-1 language code (2 letters, lowercase). Examples: en, hi, ta, te, kn, fr, de, ja, zh, ar, ru, es, pt, ko, mr, bn. Nothing else, just the code.\nText: "${text.slice(0, 200)}"`
  );
  const code = r.toLowerCase().trim().slice(0, 2);
  return LMAP[code] ? code : "en";
}

// Translate with full details
async function translateFull(text, fromLang, toLang) {
  if (!text?.trim() || fromLang === toLang) {
    return { translation: text, pronunciation: "", tip: "" };
  }
  const from = LMAP[fromLang]?.name || fromLang;
  const to = LMAP[toLang]?.name || toLang;
  const raw = await claudeCall(
    `Translate this text from ${from} to ${to}.\nReturn ONLY valid JSON, no markdown, no backticks:\n{"translation":"...","pronunciation":"romanized pronunciation of the translation","tip":"one brief usage note"}\nText: "${text}"`,
    600
  );
  try {
    const clean = raw.replace(/```[\w]*/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    const simple = await claudeCall(`Translate from ${from} to ${to}. Return ONLY the translated text:\n${text}`);
    return { translation: simple || text, pronunciation: "", tip: "" };
  }
}

// Batch translate for phrasebook
async function batchTranslate(words, toLang) {
  if (!words.length) return {};
  const toName = LMAP[toLang]?.name || toLang;
  const raw = await claudeCall(
    `Translate each English phrase to ${toName}.\nReturn ONLY a JSON object {originalPhrase: translation}. No markdown, no backticks:\n${words.join("\n")}`,
    1000
  );
  try {
    const clean = raw.replace(/```[\w]*/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    const results = await Promise.all(words.map(w => claudeCall(`Translate to ${toName}: ${w}`)));
    return Object.fromEntries(words.map((w, i) => [w, results[i] || w]));
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
  page: { minHeight:"100vh", background:"#080810", color:"#fff", fontFamily:"'SF Pro Display','Segoe UI',system-ui,sans-serif", display:"flex", flexDirection:"column" },
  card: { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:16, padding:"14px 16px" },
  backBtn: { background:"none", border:"none", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:22, padding:0, display:"flex", alignItems:"center" },
  head: { padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", gap:12 },
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AR CAMERA SCREEN — core rewrite
   Flow: scan → detect lang → speak original → translate → label
   Tap label → speak original + translation in correct voices
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ARScreen({ targetLang, onBack }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimer = useRef(null);
  const mounted   = useRef(true);

  const [camReady,   setCamReady]   = useState(false);
  const [camDenied,  setCamDenied]  = useState(false);
  const [ocrReady,   setOcrReady]   = useState(false);
  const [ocrStatus,  setOcrStatus]  = useState("Loading OCR…");
  const [labels,     setLabels]     = useState([]);   // [{id, text, detectedLang, translation, x,y,w,h, status}]
  const [selected,   setSelected]   = useState(null);
  const [scanning,   setScanning]   = useState(false);
  const [scanCount,  setScanCount]  = useState(0);
  const [facing,     setFacing]     = useState("environment");
  const [toast,      setToast]      = useState("");
  const [speaking,   setSpeaking]   = useState(false);

  const lang = LMAP[targetLang] || LMAP.en;

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  /* ── Camera ── */
  const startCam = useCallback(async () => {
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => { videoRef.current.play(); setCamReady(true); };
      }
    } catch (e) {
      if (e.name === "NotAllowedError") setCamDenied(true);
    }
  }, [facing]);

  useEffect(() => { mounted.current = true; startCam(); return () => { mounted.current = false; streamRef.current?.getTracks().forEach(t => t.stop()); clearInterval(scanTimer.current); workerRef.current?.terminate(); }; }, [startCam]);

  /* ── Tesseract ── */
  useEffect(() => {
    if (window.Tesseract) { initOCR(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload  = () => { if (mounted.current) initOCR(); };
    s.onerror = () => { if (mounted.current) setOcrStatus("OCR failed — reload"); };
    document.head.appendChild(s);
  }, []);

  async function initOCR() {
    try {
      setOcrStatus("Setting up text recognition…");
      // Support both Latin + Devanagari (Hindi/Marathi) + other scripts
      const w = await window.Tesseract.createWorker(["eng", "hin"], 1, {
        logger: () => {},
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
        corePath:   "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js",
      });
      await w.setParameters({ preserve_interword_spaces: "1" });
      workerRef.current = w;
      if (mounted.current) { setOcrReady(true); setOcrStatus(""); }
    } catch {
      if (mounted.current) setOcrStatus("OCR init failed — reload page");
    }
  }

  /* ── Auto scan loop every 4s ── */
  useEffect(() => {
    if (!camReady || !ocrReady) return;
    scanTimer.current = setInterval(doScan, 4000);
    return () => clearInterval(scanTimer.current);
  }, [camReady, ocrReady, targetLang]);

  const doScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current) return;
    const v = videoRef.current;
    if (v.readyState < 2 || v.paused || scanning) return;

    setScanning(true);
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    c.width  = v.videoWidth  || 640;
    c.height = v.videoHeight || 480;
    // Enhance for OCR: grayscale + contrast boost
    ctx.filter = "grayscale(1) contrast(2) brightness(1.15)";
    ctx.drawImage(v, 0, 0, c.width, c.height);
    ctx.filter = "none";

    try {
      const { data } = await workerRef.current.recognize(c);
      if (!mounted.current) return;

      // Extract meaningful word groups
      const rawWords = (data.words || []).filter(w =>
        w.confidence > 50 && w.text.trim().length > 1
      );
      const groups = buildGroups(rawWords, c.width, c.height);

      if (groups.length === 0) { setScanning(false); return; }

      // Build initial labels with "detecting" status
      const initLabels = groups.map((g, i) => ({
        id: i + Date.now(),
        text: g.text,
        detectedLang: null,
        translation: null,
        x: g.x, y: g.y, w: g.w, h: g.h,
        status: "detecting", // detecting | translating | ready
      }));
      if (mounted.current) setLabels(initLabels);
      setScanCount(n => n + 1);

      // For each group: detect language → translate → update label
      for (let i = 0; i < initLabels.length; i++) {
        const label = initLabels[i];
        try {
          const detLang = await detectLanguage(label.text);
          if (!mounted.current) break;

          setLabels(prev => prev.map(l => l.id === label.id ? { ...l, detectedLang: detLang, status: "translating" } : l));

          let translation = label.text;
          let pronunciation = "";
          let tip = "";
          if (detLang !== targetLang) {
            const res = await translateFull(label.text, detLang, targetLang);
            translation = res.translation;
            pronunciation = res.pronunciation;
            tip = res.tip;
          }
          if (!mounted.current) break;

          setLabels(prev => prev.map(l => l.id === label.id
            ? { ...l, translation, pronunciation, tip, status: "ready" }
            : l
          ));

          // Auto-speak first label: original then translation
          if (i === 0) {
            setSpeaking(true);
            const items = [{ text: label.text, lang: detLang }];
            if (detLang !== targetLang && translation) items.push({ text: translation, lang: targetLang });
            speakSequence(items);
            setTimeout(() => setSpeaking(false), (items.length * 2500));
          }
        } catch { /* skip failed label */ }
      }
    } catch {}
    if (mounted.current) setScanning(false);
  }, [targetLang, scanning]);

  function buildGroups(words, W, H) {
    // Sort by vertical position first
    words.sort((a, b) => a.bbox.y0 - b.bbox.y0);
    const used = new Set();
    const result = [];
    words.forEach((w, i) => {
      if (used.has(i)) return;
      let text = w.text.trim();
      let bbox = { ...w.bbox };
      let conf = w.confidence;
      used.add(i);
      // Group horizontally-adjacent words on same line
      words.forEach((w2, j) => {
        if (used.has(j)) return;
        const sameRow = Math.abs(w2.bbox.y0 - w.bbox.y0) < 22;
        const adjacent = w2.bbox.x0 > bbox.x0 && w2.bbox.x0 - bbox.x1 < 80;
        if (sameRow && adjacent) {
          text += " " + w2.text.trim();
          bbox.x1 = Math.max(bbox.x1, w2.bbox.x1);
          bbox.y1 = Math.max(bbox.y1, w2.bbox.y1);
          conf = (conf + w2.confidence) / 2;
          used.add(j);
        }
      });
      const clean = text.trim();
      if (clean.length < 2) return;
      result.push({
        text: clean,
        x: (bbox.x0 / W) * 100,
        y: (bbox.y0 / H) * 100,
        w: ((bbox.x1 - bbox.x0) / W) * 100,
        h: ((bbox.y1 - bbox.y0) / H) * 100,
        conf: conf / 100,
      });
    });
    // Deduplicate by text content
    const seen = new Set();
    return result.filter(g => { const k = g.text.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  }

  function handleLabelTap(label) {
    setSelected(s => s?.id === label.id ? null : label);
    if (label.status !== "ready") return;
    // Speak: original language first, then translation
    const items = [];
    if (label.text && label.detectedLang) items.push({ text: label.text, lang: label.detectedLang });
    if (label.translation && label.translation !== label.text && label.detectedLang !== targetLang) {
      items.push({ text: label.translation, lang: targetLang });
    }
    if (items.length) { setSpeaking(true); speakSequence(items); setTimeout(() => setSpeaking(false), items.length * 2800); }
  }

  if (camDenied) return (
    <div style={{ height:"100vh", background:"#000", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, padding:32, textAlign:"center", color:"#fff" }}>
      <div style={{ fontSize:56 }}>📷</div>
      <div style={{ fontSize:20, fontWeight:700 }}>Camera Permission Required</div>
      <p style={{ fontSize:14, color:"rgba(255,255,255,0.5)", lineHeight:1.7, maxWidth:280 }}>Please allow camera access in your browser settings and reload the page.</p>
      <button onClick={onBack} style={{ background:"#00d4ff", border:"none", borderRadius:12, padding:"12px 28px", color:"#000", fontWeight:700, cursor:"pointer" }}>← Go Back</button>
    </div>
  );

  const statusColor = scanning ? "#ff9500" : ocrReady ? "#00e676" : "#555";
  const statusText = scanning ? "SCANNING" : ocrReady ? "LIVE" : "LOADING";

  return (
    <div style={{ position:"relative", width:"100%", height:"100vh", background:"#000", overflow:"hidden" }}>
      <style>{`
        @keyframes scanLine { 0%{top:5%} 100%{top:95%} }
        @keyframes fadeIn { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes labelPop { 0%{opacity:0;transform:translateY(6px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes waveBar { 0%,100%{height:6px} 50%{height:18px} }
      `}</style>

      <video ref={videoRef} playsInline muted autoPlay
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
      <canvas ref={canvasRef} style={{ display:"none" }} />

      {/* Vignette */}
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,0.55) 100%)", pointerEvents:"none" }} />

      {/* Scan line */}
      {scanning && (
        <div style={{ position:"absolute", left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#00d4ff,transparent)", animation:"scanLine 1.4s ease-in-out infinite", zIndex:8, pointerEvents:"none" }} />
      )}

      {/* Corner brackets */}
      {[{t:60,l:12},{t:60,r:12},{b:80,l:12},{b:80,r:12}].map((pos,i) => (
        <div key={i} style={{ position:"absolute", width:24, height:24,
          ...(pos.t!==undefined?{top:pos.t}:{bottom:pos.b}),
          ...(pos.l!==undefined?{left:pos.l}:{right:pos.r}),
          borderTop: pos.t!==undefined?"2px solid rgba(0,212,255,0.7)":undefined,
          borderBottom: pos.b!==undefined?"2px solid rgba(0,212,255,0.7)":undefined,
          borderLeft: pos.l!==undefined?"2px solid rgba(0,212,255,0.7)":undefined,
          borderRight: pos.r!==undefined?"2px solid rgba(0,212,255,0.7)":undefined,
          pointerEvents:"none", zIndex:5 }} />
      ))}

      {/* AR Labels */}
      {labels.map(lbl => {
        const isSel = selected?.id === lbl.id;
        const isReady = lbl.status === "ready";
        const isDetecting = lbl.status === "detecting" || lbl.status === "translating";
        return (
          <div key={lbl.id} onClick={() => handleLabelTap(lbl)}
            style={{ position:"absolute", left:`${lbl.x}%`, top:`${lbl.y}%`, zIndex:20, cursor:"pointer", animation:"labelPop 0.25s ease" }}>
            {/* Highlight box around detected text */}
            <div style={{ position:"absolute", inset:-4, border:`1.5px solid ${isSel ? "#00d4ff" : "rgba(0,212,255,0.4)"}`, borderRadius:6, pointerEvents:"none", boxSizing:"border-box",
              minWidth:`${Math.max(lbl.w,12)}vw`, minHeight:`${Math.max(lbl.h,2)}vh` }} />
            {/* Translation label */}
            <div style={{
              background: isSel ? "#00d4ff" : "rgba(0,8,24,0.9)",
              color: isSel ? "#000" : "#00d4ff",
              border:`1px solid ${isSel ? "#00d4ff" : "rgba(0,212,255,0.5)"}`,
              borderRadius:8,
              padding:"4px 10px",
              fontSize:13,
              fontWeight:700,
              backdropFilter:"blur(16px)",
              maxWidth:"50vw",
              whiteSpace:"nowrap",
              overflow:"hidden",
              textOverflow:"ellipsis",
              transition:"all 0.2s",
              marginTop:-2,
            }}>
              {isDetecting ? (
                <span style={{ opacity:0.6, fontSize:11 }}>
                  {lbl.status === "detecting" ? "🔍 detecting…" : "⚡ translating…"}
                </span>
              ) : (
                lbl.translation || lbl.text
              )}
            </div>
          </div>
        );
      })}

      {/* Top HUD */}
      <div style={{ position:"absolute", top:0, left:0, right:0, padding:"12px 16px", background:"linear-gradient(to bottom,rgba(0,0,0,0.85),transparent)", display:"flex", alignItems:"center", justifyContent:"space-between", zIndex:30 }}>
        <button onClick={onBack} style={{ background:"rgba(0,0,0,0.6)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", borderRadius:20, padding:"6px 14px", fontSize:13, cursor:"pointer" }}>← Back</button>

        <div style={{ display:"flex", alignItems:"center", gap:7, background:"rgba(0,0,0,0.6)", borderRadius:20, padding:"5px 12px", border:`1px solid ${statusColor}44` }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:statusColor, animation:ocrReady&&!scanning?"pulse 2s infinite":"none" }} />
          <span style={{ fontSize:11, color:"rgba(255,255,255,0.85)", letterSpacing:1.2, fontWeight:600 }}>{statusText}</span>
        </div>

        <div style={{ background:"rgba(0,0,0,0.6)", border:"1px solid rgba(0,212,255,0.3)", borderRadius:16, padding:"5px 11px", fontSize:12, color:"#00d4ff", fontWeight:600 }}>
          {lang.flag} {lang.name}
        </div>
      </div>

      {/* Speaking indicator */}
      {speaking && (
        <div style={{ position:"absolute", top:70, left:"50%", transform:"translateX(-50%)", background:"rgba(0,212,255,0.12)", border:"1px solid rgba(0,212,255,0.4)", borderRadius:20, padding:"6px 16px", zIndex:35, display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:3 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width:3, background:"#00d4ff", borderRadius:2, animation:`waveBar 0.8s ${i*0.15}s infinite` }} />
            ))}
          </div>
          <span style={{ fontSize:11, color:"#00d4ff", letterSpacing:1 }}>SPEAKING</span>
        </div>
      )}

      {/* Side controls */}
      <div style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", display:"flex", flexDirection:"column", gap:10, zIndex:30 }}>
        {[
          { icon:"🔄", fn: () => setFacing(f => f === "environment" ? "user" : "environment"), label:"Flip" },
          { icon:"📸", fn: doScan, label:"Scan now" },
        ].map(b => (
          <button key={b.label} onClick={b.fn} title={b.label}
            style={{ width:44, height:44, background:"rgba(0,0,0,0.7)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:12, color:"#fff", cursor:"pointer", fontSize:20, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {b.icon}
          </button>
        ))}
      </div>

      {/* OCR loading overlay */}
      {!ocrReady && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:18, zIndex:25, background:"rgba(0,0,16,0.75)" }}>
          <div style={{ width:52, height:52, border:"3px solid #00d4ff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.9s linear infinite" }} />
          <div style={{ color:"#00d4ff", fontSize:13, letterSpacing:2, fontWeight:600 }}>{ocrStatus || "INITIALIZING"}</div>
          <div style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}>First load takes ~15 seconds</div>
        </div>
      )}

      {/* Selected label detail panel */}
      {selected ? (
        <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"rgba(2,4,20,0.97)", backdropFilter:"blur(28px)", borderTop:"1px solid rgba(0,212,255,0.4)", padding:"18px 18px 28px", zIndex:40, animation:"fadeIn 0.2s" }}>
          <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
            <div style={{ flex:1, minWidth:0 }}>
              {selected.detectedLang && (
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:2, marginBottom:5 }}>
                  {LMAP[selected.detectedLang]?.flag} DETECTED: {LMAP[selected.detectedLang]?.name?.toUpperCase()}
                </div>
              )}
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.45)", marginBottom:8, wordBreak:"break-word" }}>{selected.text}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:2, marginBottom:5 }}>
                {lang.flag} {lang.name?.toUpperCase()} TRANSLATION
              </div>
              <div style={{ fontSize:26, fontWeight:700, color:"#00d4ff", lineHeight:1.3, wordBreak:"break-word" }}>
                {selected.status !== "ready" ? "Translating…" : selected.translation}
              </div>
              {selected.pronunciation && (
                <div style={{ fontSize:13, color:"#7ec8e3", marginTop:6, fontStyle:"italic" }}>/ {selected.pronunciation} /</div>
              )}
              {selected.tip && (
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:10, borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:10, lineHeight:1.7 }}>
                  💡 {selected.tip}
                </div>
              )}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
              {/* Speak original */}
              <button
                onClick={() => selected.detectedLang && speakText(selected.text, selected.detectedLang)}
                title={`Hear in ${LMAP[selected.detectedLang]?.name}`}
                style={{ width:46, height:46, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:12, fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:2 }}>
                🔊
                <span style={{ fontSize:8, color:"rgba(255,255,255,0.4)", lineHeight:1 }}>{LMAP[selected.detectedLang]?.flag}</span>
              </button>
              {/* Speak translation */}
              <button
                onClick={() => selected.translation && speakText(selected.translation, targetLang)}
                title={`Hear in ${lang.name}`}
                style={{ width:46, height:46, background:"rgba(0,212,255,0.1)", border:"1px solid rgba(0,212,255,0.35)", borderRadius:12, fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:2 }}>
                🔊
                <span style={{ fontSize:8, color:"rgba(0,212,255,0.7)", lineHeight:1 }}>{lang.flag}</span>
              </button>
              {/* Copy */}
              <button
                onClick={() => { navigator.clipboard?.writeText(selected.translation || ""); showToast("Copied!"); }}
                style={{ width:46, height:46, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, fontSize:18, cursor:"pointer", color:"#888", display:"flex", alignItems:"center", justifyContent:"center" }}>
                📋
              </button>
              {/* Close */}
              <button onClick={() => setSelected(null)}
                style={{ width:46, height:46, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, fontSize:16, cursor:"pointer", color:"#555", display:"flex", alignItems:"center", justifyContent:"center" }}>
                ✕
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"14px 16px 24px", background:"linear-gradient(to top,rgba(0,0,0,0.8),transparent)", zIndex:30, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.45)" }}>
            {!ocrReady ? ocrStatus : labels.length > 0 ? `${labels.filter(l=>l.status==="ready").length}/${labels.length} translated — tap any to hear` : "Point camera at text to translate"}
          </div>
          <div style={{ fontSize:11, color:"rgba(0,212,255,0.5)", fontWeight:600 }}>#{scanCount}</div>
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:130, left:"50%", transform:"translateX(-50%)", background:"#fff", color:"#000", padding:"8px 22px", borderRadius:22, fontSize:13, fontWeight:700, zIndex:999 }}>{toast}</div>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LANGUAGE SELECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function LangSelect({ value, onChange, label, exclude }) {
  return (
    <div style={{ flex:1 }}>
      <div style={{ fontSize:9, color:"#444", letterSpacing:1.5, marginBottom:5 }}>{label}</div>
      <div style={{ position:"relative" }}>
        <select value={value} onChange={e => onChange(e.target.value)}
          style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.13)", borderRadius:10, padding:"10px 32px 10px 12px", color:"#fff", fontSize:14, outline:"none", cursor:"pointer", appearance:"none", WebkitAppearance:"none" }}>
          {LANGUAGES.filter(l => l.code !== exclude).map(l => (
            <option key={l.code} value={l.code} style={{ background:"#111" }}>{l.flag} {l.name}</option>
          ))}
        </select>
        <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#555", pointerEvents:"none", fontSize:11 }}>▼</div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TEXT TRANSLATE SCREEN
   Flow: type → translate → hear original in source lang → hear translation in target lang
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function TranslateScreen({ defaultTarget, onBack }) {
  const [srcLang, setSrcLang] = useState("en");
  const [tgtLang, setTgtLang] = useState(defaultTarget || "hi");
  const [input,   setInput]   = useState("");
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [spkSrc,  setSpkSrc]  = useState(false);
  const [spkTgt,  setSpkTgt]  = useState(false);

  const swap = () => {
    setSrcLang(tgtLang); setTgtLang(srcLang);
    if (result?.translation) { setInput(result.translation); setResult(null); }
  };

  const doTranslate = async () => {
    if (!input.trim()) return;
    setLoading(true); setResult(null);
    const r = await translateFull(input, srcLang, tgtLang);
    setResult(r);
    if (r?.translation) setHistory(h => [{ input, srcLang, tgtLang, ...r }, ...h.slice(0, 9)]);
    setLoading(false);
  };

  const hearOriginal = () => {
    setSpkSrc(true);
    speakText(input, srcLang, () => setSpkSrc(false));
  };

  const hearTranslation = () => {
    setSpkTgt(true);
    speakText(result?.translation, tgtLang, () => setSpkTgt(false));
  };

  const hearBoth = () => {
    setSpkSrc(true);
    speakSequence([
      { text: input, lang: srcLang },
      { text: result?.translation, lang: tgtLang },
    ]);
    const dur = 5000;
    setTimeout(() => setSpkSrc(false), dur / 2);
    setTimeout(() => setSpkTgt(false), dur);
    setSpkTgt(true);
  };

  return (
    <div style={{ ...S.page }}>
      <div style={{ ...S.head }}>
        <button onClick={onBack} style={S.backBtn}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>Translate</div>
          <div style={{ fontSize:11, color:"#444", marginTop:1 }}>Powered by Claude AI</div>
        </div>
      </div>

      <div style={{ flex:1, overflow:"auto", padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>
        {/* Lang row */}
        <div style={{ display:"flex", alignItems:"flex-end", gap:8 }}>
          <LangSelect value={srcLang} onChange={v => { setSrcLang(v); setResult(null); }} label="FROM" exclude={tgtLang} />
          <button onClick={swap}
            style={{ flexShrink:0, width:38, height:38, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, color:"#00d4ff", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
            ⇄
          </button>
          <LangSelect value={tgtLang} onChange={v => { setTgtLang(v); setResult(null); }} label="TO" exclude={srcLang} />
        </div>

        {/* Input */}
        <div style={{ position:"relative" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && e.ctrlKey && doTranslate()}
            placeholder={`Type in ${LMAP[srcLang]?.name}… (Ctrl+Enter to translate)`}
            rows={4}
            style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"12px 52px 12px 14px", color:"#fff", fontSize:15, fontFamily:"inherit", resize:"vertical", outline:"none" }} />
          {input.trim() && (
            <button onClick={hearOriginal}
              style={{ position:"absolute", top:10, right:10, width:36, height:36, background:spkSrc?"#00d4ff":"rgba(0,212,255,0.1)", border:`1px solid ${spkSrc?"#00d4ff":"rgba(0,212,255,0.3)"}`, borderRadius:9, color:spkSrc?"#000":"#00d4ff", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>
              🔊
            </button>
          )}
        </div>

        <button onClick={doTranslate} disabled={loading || !input.trim()}
          style={{ background: loading || !input.trim() ? "rgba(0,212,255,0.1)" : "#00d4ff", border:"none", borderRadius:10, padding:"13px", color: loading || !input.trim() ? "rgba(255,255,255,0.25)" : "#000", fontWeight:700, fontSize:14, cursor: loading || !input.trim() ? "not-allowed" : "pointer" }}>
          {loading ? "Translating…" : `Translate to ${LMAP[tgtLang]?.name} →`}
        </button>

        {/* Result */}
        {result && (
          <div style={{ background:"rgba(0,212,255,0.05)", border:"1px solid rgba(0,212,255,0.2)", borderRadius:16, padding:18, position:"relative" }}>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", letterSpacing:2, marginBottom:8 }}>
              {LMAP[tgtLang]?.flag} {LMAP[tgtLang]?.name?.toUpperCase()} TRANSLATION
            </div>
            <div style={{ fontSize:26, fontWeight:700, color:"#00d4ff", lineHeight:1.4, paddingRight:52 }}>{result.translation}</div>
            {result.pronunciation && (
              <div style={{ fontSize:13, color:"#7ec8e3", marginTop:8, fontStyle:"italic" }}>/ {result.pronunciation} /</div>
            )}
            {result.tip && (
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:10, marginTop:12, lineHeight:1.7 }}>💡 {result.tip}</div>
            )}
            <div style={{ position:"absolute", top:14, right:14, display:"flex", flexDirection:"column", gap:6 }}>
              {/* Hear both */}
              <button onClick={hearBoth}
                title="Hear original then translation"
                style={{ width:42, height:42, background:"rgba(255,200,0,0.1)", border:"1px solid rgba(255,200,0,0.35)", borderRadius:10, color:"#ffc800", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>
                🔄🔊
              </button>
              <button onClick={hearTranslation}
                style={{ width:42, height:42, background:spkTgt?"#00d4ff":"rgba(0,212,255,0.1)", border:`1px solid ${spkTgt?"#00d4ff":"rgba(0,212,255,0.3)"}`, borderRadius:10, color:spkTgt?"#000":"#00d4ff", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
                🔊
              </button>
              <button onClick={() => { navigator.clipboard?.writeText(result.translation); }}
                style={{ width:42, height:42, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#666", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>
                📋
              </button>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <div style={{ fontSize:9, color:"#2a2a2a", letterSpacing:2, marginBottom:10 }}>RECENT</div>
            {history.slice(0,5).map((h,i) => (
              <div key={i} onClick={() => { setInput(h.input); setSrcLang(h.srcLang); setTgtLang(h.tgtLang); setResult(h); }}
                style={{ ...S.card, marginBottom:8, cursor:"pointer" }}>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ fontSize:11 }}>{LMAP[h.srcLang]?.flag}</span>
                  <span style={{ fontSize:12, color:"rgba(255,255,255,0.35)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.input}</span>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:4 }}>
                  <span style={{ fontSize:11 }}>{LMAP[h.tgtLang]?.flag}</span>
                  <span style={{ fontSize:14, color:"#00d4ff", fontWeight:600 }}>{h.translation}</span>
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
    const words   = PHRASE_CATS[cat] || [];
    const missing = words.filter(w => !phrases[w]);
    if (!missing.length) return;
    setLoading(true);
    batchTranslate(missing, targetLang)
      .then(map => { setPhrases(p => ({ ...p, ...map })); setLoading(false); })
      .catch(() => setLoading(false));
  }, [cat, targetLang]);

  return (
    <div style={{ ...S.page }}>
      <div style={{ ...S.head }}>
        <button onClick={onBack} style={S.backBtn}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>Phrasebook</div>
          <div style={{ fontSize:11, color:"#444", marginTop:1 }}>{lang?.flag} {lang?.name}</div>
        </div>
        {loading && <div style={{ fontSize:11, color:"#ff9500" }}>Translating…</div>}
      </div>

      <div style={{ padding:"10px 14px", display:"flex", gap:6, overflowX:"auto", borderBottom:"1px solid rgba(255,255,255,0.05)", scrollbarWidth:"none" }}>
        {Object.keys(PHRASE_CATS).map(c => (
          <button key={c} onClick={() => setCat(c)}
            style={{ flexShrink:0, background: cat===c ? "#ff9500" : "rgba(255,255,255,0.05)", border:"none", borderRadius:20, padding:"7px 14px", color: cat===c ? "#000" : "#666", fontSize:12, fontWeight: cat===c ? 700 : 400, cursor:"pointer" }}>
            {c}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflow:"auto", padding:"14px 16px" }}>
        <div style={{ fontSize:10, color:"#2a2a2a", letterSpacing:2, marginBottom:14 }}>
          Left 🔊 = English &nbsp;·&nbsp; Right 🔊 = {lang?.name}
        </div>
        {(PHRASE_CATS[cat] || []).map(word => {
          const tr = phrases[word];
          return (
            <div key={word} style={{ ...S.card, marginBottom:10, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginBottom:4 }}>{word}</div>
                <div style={{ fontSize:21, fontWeight:700, color:"#ff9500", minHeight:26, wordBreak:"break-word" }}>
                  {tr ?? <span style={{ color:"#1a1a1a" }}>…</span>}
                </div>
              </div>
              <div style={{ display:"flex", gap:7, flexShrink:0 }}>
                <button onClick={() => speakText(word, "en")}
                  style={{ width:38, height:38, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"50%", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:17, display:"flex", alignItems:"center", justifyContent:"center" }}
                  title="Hear English">🔊</button>
                <button onClick={() => tr && speakText(tr, targetLang)} disabled={!tr}
                  style={{ width:38, height:38, background: tr ? "rgba(255,149,0,0.1)" : "rgba(255,255,255,0.02)", border:`1px solid ${tr ? "rgba(255,149,0,0.3)" : "rgba(255,255,255,0.05)"}`, borderRadius:"50%", color: tr ? "#ff9500" : "#2a2a2a", cursor: tr ? "pointer" : "not-allowed", fontSize:17, display:"flex", alignItems:"center", justifyContent:"center" }}
                  title={`Hear in ${lang?.name}`}>🔊</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CHALLENGE
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

  useEffect(() => {
    if (!active) return;
    setTrLoading(true); setWordTr("");
    translateFull(active.words[wordIdx], "en", targetLang)
      .then(r => { setWordTr(r.translation); setTrLoading(false); });
  }, [active, wordIdx, targetLang]);

  const check = () => {
    if (!wordTr) return;
    const correct = answer.trim().toLowerCase() === wordTr.trim().toLowerCase();
    setFeedback({ correct, wordTr });
    if (correct) { setStreak(s => s + 1); speakText(wordTr, targetLang); }
    else { setStreak(0); speakText(wordTr, targetLang); }
  };

  const next = () => {
    if (!active) return;
    if (wordIdx < active.words.length - 1) { setWordIdx(i => i + 1); setAnswer(""); setFeedback(null); setWordTr(""); }
    else { setCompleted(c => [...c, active.id]); setUserXP(x => x + active.xp); setActive(null); setWordIdx(0); setAnswer(""); setFeedback(null); setWordTr(""); }
  };

  const lang = LMAP[targetLang];
  return (
    <div style={{ ...S.page }}>
      <div style={{ ...S.head, justifyContent:"space-between" }}>
        <button onClick={() => { setActive(null); onBack(); }} style={S.backBtn}>←</button>
        <div style={{ fontWeight:700, fontSize:16 }}>Daily Challenges</div>
        <div style={{ background:"rgba(0,230,118,0.1)", border:"1px solid rgba(0,230,118,0.25)", borderRadius:20, padding:"4px 12px", fontSize:12, color:"#00e676" }}>⚡ {userXP} XP</div>
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
            <div key={ch.id} onClick={() => { if (!completed.includes(ch.id)) { setActive(ch); setWordIdx(0); setAnswer(""); setFeedback(null); setWordTr(""); } }}
              style={{ ...S.card, marginBottom:10, cursor: completed.includes(ch.id) ? "default" : "pointer", display:"flex", alignItems:"center", gap:14,
                borderColor: completed.includes(ch.id) ? "rgba(0,200,83,0.3)" : undefined,
                background:  completed.includes(ch.id) ? "rgba(0,200,83,0.04)" : undefined }}>
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
              <div style={{ fontSize:12, color:"#444" }}>{wordIdx + 1} / {active.words.length}</div>
            </div>
          </div>
          <div style={{ height:4, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(wordIdx / active.words.length) * 100}%`, background:"#00e676", transition:"width 0.4s", borderRadius:2 }} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:9, color:"#444", letterSpacing:2, marginBottom:10 }}>
              TRANSLATE THIS WORD TO {lang?.name?.toUpperCase()} {lang?.flag}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <div style={{ fontSize:38, fontWeight:700 }}>{active.words[wordIdx]}</div>
              <button onClick={() => speakText(active.words[wordIdx], "en")}
                style={{ width:40, height:40, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"50%", color:"#fff", cursor:"pointer", fontSize:19, display:"flex", alignItems:"center", justifyContent:"center" }}>🔊</button>
            </div>
            <input value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !feedback && check()}
              placeholder={trLoading ? "Loading…" : `Type in ${lang?.name}…`}
              disabled={!!feedback || trLoading}
              style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.05)", border:`1.5px solid ${feedback ? (feedback.correct ? "#00e676" : "#ff4444") : "rgba(255,255,255,0.12)"}`, borderRadius:12, padding:"14px 16px", color:"#fff", fontSize:16, fontFamily:"inherit", outline:"none" }} />
            {feedback && (
              <div style={{ marginTop:14, padding:14, background: feedback.correct ? "rgba(0,230,118,0.07)" : "rgba(255,68,68,0.07)", border:`1px solid ${feedback.correct ? "rgba(0,230,118,0.3)" : "rgba(255,68,68,0.3)"}`, borderRadius:12 }}>
                <div style={{ fontWeight:700, color: feedback.correct ? "#00e676" : "#ff4444" }}>
                  {feedback.correct ? "🎉 Correct!" : "❌ Not quite"}
                </div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginTop:6, display:"flex", alignItems:"center", gap:8 }}>
                  {!feedback.correct && <>Correct: <strong style={{ color:"#fff" }}>{feedback.wordTr}</strong></>}
                  <button onClick={() => speakText(feedback.wordTr, targetLang)}
                    style={{ background:"none", border:"none", color:"#ff9500", cursor:"pointer", fontSize:18, padding:0 }}>🔊</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            {!feedback ? (
              <button onClick={check} disabled={!answer.trim() || trLoading}
                style={{ flex:1, background: answer.trim() && !trLoading ? "#00c853" : "rgba(0,200,83,0.1)", border:"none", borderRadius:12, padding:14, color: answer.trim() && !trLoading ? "#000" : "rgba(255,255,255,0.2)", fontWeight:700, fontSize:15, cursor: answer.trim() && !trLoading ? "pointer" : "not-allowed" }}>
                {trLoading ? "Loading…" : "Check Answer"}
              </button>
            ) : (
              <>
                <button onClick={() => speakText(feedback.wordTr, targetLang)}
                  style={{ width:52, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, fontSize:22, cursor:"pointer", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center" }}>🔊</button>
                <button onClick={next}
                  style={{ flex:1, background:"#00c853", border:"none", borderRadius:12, padding:14, color:"#000", fontWeight:700, fontSize:15, cursor:"pointer" }}>
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
   HOME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function App() {
  const [screen,     setScreen]     = useState("home");
  const [tgtLang,    setTgtLang]    = useState("hi");
  const [showPicker, setShowPicker] = useState(false);
  const [userXP,     setUserXP]     = useState(120);
  const streak = 3;

  if (screen === "ar")         return <ARScreen        targetLang={tgtLang}                              onBack={() => setScreen("home")} />;
  if (screen === "translate")  return <TranslateScreen defaultTarget={tgtLang}                           onBack={() => setScreen("home")} />;
  if (screen === "phrasebook") return <PhrasebookScreen targetLang={tgtLang}                             onBack={() => setScreen("home")} />;
  if (screen === "challenge")  return <ChallengeScreen  targetLang={tgtLang} userXP={userXP} setUserXP={setUserXP} onBack={() => setScreen("home")} />;

  const lang  = LMAP[tgtLang];
  const level = Math.floor(userXP / 100) + 1;
  const xpPct = userXP % 100;

  return (
    <div style={{ minHeight:"100vh", background:"#080810", color:"#fff", fontFamily:"'SF Pro Display','Segoe UI',system-ui,sans-serif", position:"relative", maxWidth:520, margin:"0 auto" }}>
      <style>{`* { box-sizing:border-box; } ::-webkit-scrollbar{width:4px;background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}`}</style>

      {/* Header */}
      <div style={{ padding:"24px 20px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:30, fontWeight:800, letterSpacing:-1 }}>
            <span style={{ color:"#00d4ff" }}>AR</span><span style={{ color:"#fff" }}>Lens</span>
          </div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.12)", letterSpacing:4, marginTop:2 }}>TRANSLATE THE WORLD</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
          <div style={{ background:"rgba(0,212,255,0.08)", border:"1px solid rgba(0,212,255,0.2)", borderRadius:20, padding:"4px 12px", fontSize:12, color:"#00d4ff" }}>Lv.{level} · ⚡{userXP} XP</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.12)" }}>🔥 {streak}-day streak</div>
        </div>
      </div>

      {/* XP bar */}
      <div style={{ margin:"12px 20px 0" }}>
        <div style={{ height:3, background:"rgba(255,255,255,0.05)", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${xpPct}%`, background:"linear-gradient(90deg,#00d4ff,#0055ff)", borderRadius:2, transition:"width 0.6s" }} />
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.1)", marginTop:4 }}>{100 - xpPct} XP to Lv.{level + 1}</div>
      </div>

      {/* Target language */}
      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.2)", letterSpacing:2, marginBottom:8 }}>TRANSLATE TO</div>
        <button onClick={() => setShowPicker(true)}
          style={{ width:"100%", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"14px 16px", color:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", fontFamily:"inherit" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:28 }}>{lang?.flag}</span>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:16, fontWeight:600 }}>{lang?.name}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.2)", marginTop:1 }}>{lang?.nativeName}</div>
            </div>
          </div>
          <span style={{ color:"#00d4ff", fontSize:16 }}>⌄</span>
        </button>
      </div>

      {/* AR Camera CTA */}
      <div style={{ padding:"14px 20px 0" }}>
        <button onClick={() => setScreen("ar")}
          style={{ width:"100%", background:"rgba(0,212,255,0.05)", border:"1.5px solid rgba(0,212,255,0.3)", borderRadius:20, padding:"24px 20px", cursor:"pointer", fontFamily:"inherit", position:"relative", overflow:"hidden", textAlign:"center" }}>
          <div style={{ fontSize:46, marginBottom:10 }}>📷</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff" }}>Launch AR Camera</div>
          <div style={{ fontSize:13, color:"rgba(0,212,255,0.7)", marginTop:6 }}>
            Point at any text → hear it → get translation in {lang?.name}
          </div>
          <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:12, flexWrap:"wrap" }}>
            {["Detects Language", "Claude AI Translation", "Auto TTS"].map(t => (
              <span key={t} style={{ background:"rgba(0,212,255,0.07)", border:"1px solid rgba(0,212,255,0.18)", borderRadius:20, padding:"3px 10px", fontSize:10, color:"rgba(0,212,255,0.6)" }}>{t}</span>
            ))}
          </div>
        </button>
      </div>

      {/* Feature grid */}
      <div style={{ padding:"12px 20px 0", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {[
          { icon:"💬", label:"Text Translate",  sub:"AI translation both ways", color:"#00d4ff", screen:"translate"  },
          { icon:"📚", label:"Phrasebook",       sub:"Common phrases + TTS",     color:"#ff9500", screen:"phrasebook" },
          { icon:"🎮", label:"Daily Challenge",  sub:"Earn XP · Build streak",   color:"#00e676", screen:"challenge"  },
          { icon:"🔊", label:"Pronunciation",    sub:"Hear any language aloud",  color:"#c97dff", screen:"translate"  },
        ].map(f => (
          <button key={f.label} onClick={() => setScreen(f.screen)}
            style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"16px 14px", color:"#fff", cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
            <div style={{ fontSize:26, marginBottom:8 }}>{f.icon}</div>
            <div style={{ fontSize:13, fontWeight:600 }}>{f.label}</div>
            <div style={{ fontSize:11, color:f.color, marginTop:3 }}>{f.sub}</div>
          </button>
        ))}
      </div>

      {/* How it works */}
      <div style={{ margin:"14px 20px 28px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:14, padding:"14px 16px" }}>
        <div style={{ fontSize:9, color:"rgba(255,255,255,0.1)", letterSpacing:2, marginBottom:12 }}>HOW AR TRANSLATION WORKS</div>
        {[
          ["📷", "Camera captures live video"],
          ["🔍", "OCR reads text in the frame"],
          ["🌐", "AI detects text language automatically"],
          ["🔊", "Speaks original text in detected language"],
          ["🤖", "Claude AI translates to your chosen language"],
          ["✨", "Speaks translation — tap labels for details"],
        ].map(([icon, text]) => (
          <div key={text} style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:10 }}>
            <span style={{ fontSize:16 }}>{icon}</span>
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.3)", lineHeight:1.6 }}>{text}</span>
          </div>
        ))}
      </div>

      {/* Language Picker */}
      {showPicker && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:100, display:"flex", alignItems:"flex-end" }}
          onClick={() => setShowPicker(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ width:"100%", background:"#0c0c1a", borderRadius:"22px 22px 0 0", padding:"20px 20px 40px", maxHeight:"76vh", overflow:"auto" }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>Select Target Language</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.2)", marginBottom:16 }}>All screens will translate to this language</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {LANGUAGES.filter(l => l.code !== "en").map(l => (
                <button key={l.code} onClick={() => { setTgtLang(l.code); setShowPicker(false); }}
                  style={{ background: tgtLang===l.code ? "rgba(0,212,255,0.1)" : "rgba(255,255,255,0.03)", border:`1px solid ${tgtLang===l.code ? "rgba(0,212,255,0.45)" : "rgba(255,255,255,0.07)"}`, borderRadius:12, padding:"12px 14px", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:10, fontFamily:"inherit", textAlign:"left" }}>
                  <span style={{ fontSize:22 }}>{l.flag}</span>
                  <div>
                    <div style={{ fontSize:13 }}>{l.name}</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", marginTop:1 }}>{l.nativeName}</div>
                  </div>
                  {tgtLang === l.code && <span style={{ marginLeft:"auto", color:"#00d4ff", fontSize:14 }}>✓</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setShowPicker(false)}
              style={{ width:"100%", marginTop:16, background:"rgba(255,255,255,0.03)", border:"none", borderRadius:12, padding:12, color:"rgba(255,255,255,0.3)", cursor:"pointer", fontFamily:"inherit", fontSize:14 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
