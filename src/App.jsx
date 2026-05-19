import { useState, useEffect, useRef, useCallback } from "react";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LANGUAGE DATA  — English included so TTS works for EN target/source
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const LANGUAGES = [
  { code:"en", name:"English",    flag:"🇬🇧", bcp:"en-US" },
  { code:"hi", name:"Hindi",      flag:"🇮🇳", bcp:"hi-IN" },
  { code:"ta", name:"Tamil",      flag:"🇮🇳", bcp:"ta-IN" },
  { code:"te", name:"Telugu",     flag:"🇮🇳", bcp:"te-IN" },
  { code:"kn", name:"Kannada",    flag:"🇮🇳", bcp:"kn-IN" },
  { code:"mr", name:"Marathi",    flag:"🇮🇳", bcp:"mr-IN" },
  { code:"bn", name:"Bengali",    flag:"🇧🇩", bcp:"bn-IN" },
  { code:"es", name:"Spanish",    flag:"🇪🇸", bcp:"es-ES" },
  { code:"fr", name:"French",     flag:"🇫🇷", bcp:"fr-FR" },
  { code:"de", name:"German",     flag:"🇩🇪", bcp:"de-DE" },
  { code:"ja", name:"Japanese",   flag:"🇯🇵", bcp:"ja-JP" },
  { code:"zh", name:"Chinese",    flag:"🇨🇳", bcp:"zh-CN" },
  { code:"ar", name:"Arabic",     flag:"🇸🇦", bcp:"ar-SA" },
  { code:"ru", name:"Russian",    flag:"🇷🇺", bcp:"ru-RU" },
  { code:"pt", name:"Portuguese", flag:"🇧🇷", bcp:"pt-BR" },
  { code:"ko", name:"Korean",     flag:"🇰🇷", bcp:"ko-KR" },
];
const LMAP = Object.fromEntries(LANGUAGES.map(l => [l.code, l]));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TTS ENGINE — waits for voices, picks the best match
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
let _voices = [];

function loadVoicesNow() {
  if (!window.speechSynthesis) return;
  _voices = window.speechSynthesis.getVoices();
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  loadVoicesNow();
  window.speechSynthesis.addEventListener("voiceschanged", loadVoicesNow);
}

function speak(text, langCode) {
  if (!window.speechSynthesis || !text?.trim()) return;
  window.speechSynthesis.cancel();

  const lang = LMAP[langCode];
  const bcp  = lang?.bcp || "en-US";

  const u  = new SpeechSynthesisUtterance(text);
  u.lang   = bcp;
  u.rate   = 0.88;
  u.volume = 1;

  // Load voices if empty (some browsers delay this)
  let voices = _voices;
  if (!voices.length) {
    voices = window.speechSynthesis.getVoices();
    _voices = voices;
  }

  if (voices.length) {
    const prefix2 = bcp.slice(0, 2).toLowerCase();
    const voice   =
      voices.find(v => v.lang === bcp) ||
      voices.find(v => v.lang.toLowerCase().startsWith(bcp.toLowerCase())) ||
      voices.find(v => v.lang.toLowerCase().startsWith(prefix2)) ||
      voices.find(v => v.lang.toLowerCase().includes(langCode.toLowerCase())) ||
      null;
    if (voice) u.voice = voice;
  }

  // Small delay fixes Chrome cancel() race
  setTimeout(() => window.speechSynthesis.speak(u), 80);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TRANSLATION — Claude API primary, MyMemory fallback
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const MODEL = "claude-sonnet-4-20250514";

async function claudeRaw(content, maxTokens = 600) {
  const res  = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text?.trim() || "";
}

async function myMemory(text, tgt, src = "en") {
  try {
    const url  = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}`;
    const data = await (await fetch(url)).json();
    if (data.responseStatus === 200 && data.responseData?.translatedText)
      return data.responseData.translatedText;
  } catch {}
  return text;
}

async function trSimple(text, tgt, src = "en") {
  if (!text?.trim()) return "";
  const TN = LMAP[tgt]?.name || tgt;
  const SN = LMAP[src]?.name || "English";
  try {
    const r = await claudeRaw(
      `Translate from ${SN} to ${TN}. Output ONLY the translated text, nothing else:\n${text}`
    );
    if (r) return r;
  } catch {}
  return myMemory(text, tgt, src);
}

async function trDetailed(text, tgt, src = "en") {
  if (!text?.trim()) return null;
  const TN = LMAP[tgt]?.name || tgt;
  const SN = LMAP[src]?.name || "English";
  try {
    const raw = await claudeRaw(
      `Translate from ${SN} to ${TN}.\n` +
      `Return ONLY valid JSON (no markdown, no backticks, no extra text):\n` +
      `{"translation":"...","pronunciation":"romanized pronunciation guide","usage_tip":"one short cultural or usage tip"}\n` +
      `Text: "${text}"`,
      700
    );
    const clean = raw.replace(/```[\w]*/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    const t = await trSimple(text, tgt, src);
    return { translation: t, pronunciation: "", usage_tip: "" };
  }
}

async function trBatch(words, tgt) {
  if (!words.length) return {};
  const TN = LMAP[tgt]?.name || tgt;
  try {
    const raw = await claudeRaw(
      `Translate each of these English words/phrases to ${TN}.\n` +
      `Return ONLY a JSON object where keys are the EXACT original words and values are translations. No markdown:\n` +
      words.join("\n"),
      1000
    );
    const clean = raw.replace(/```[\w]*/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    const results = await Promise.all(words.map(w => trSimple(w, tgt)));
    return Object.fromEntries(words.map((w, i) => [w, results[i]]));
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONTENT DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const PHRASE_CATS = {
  "Essentials":  ["Hello","Thank you","Please","Sorry","Yes","No","Help","Excuse me","Goodbye","You're welcome"],
  "Food":        ["Water","Menu","Bill","Vegetarian","Spicy","Delicious","I am hungry","No sugar","Take away","Cheers"],
  "Navigation":  ["Where is the exit","Toilet","Hotel","Hospital","Airport","Bus stop","Train station","Police","Turn left","Straight ahead"],
  "Shopping":    ["How much","Too expensive","Discount","I will buy this","Card payment","Receipt","Open","Closed","Free","Sale"],
  "Emergency":   ["Call a doctor","Ambulance","Fire","I need help","Call police","I am lost","I am injured","I am allergic","Emergency exit","I am safe"],
};

const CHALLENGES = [
  { id:1, emoji:"🍳", name:"Kitchen",    words:["Refrigerator","Stove","Bowl","Knife","Spoon","Plate"], xp:50 },
  { id:2, emoji:"🛒", name:"Market",     words:["Price","Buy","Sell","Cheap","Expensive","Receipt"],    xp:60 },
  { id:3, emoji:"🏥", name:"Hospital",   words:["Doctor","Medicine","Pain","Emergency","Nurse","Blood"],xp:80 },
  { id:4, emoji:"🚆", name:"Transport",  words:["Train","Bus","Ticket","Platform","Departure","Arrival"],xp:55 },
  { id:5, emoji:"🍽️", name:"Restaurant", words:["Menu","Order","Bill","Waiter","Spicy","Vegetarian"],   xp:45 },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SHARED STYLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const PAGE  = { minHeight:"100vh", background:"#07070f", color:"#fff", fontFamily:"'Segoe UI',system-ui,sans-serif", display:"flex", flexDirection:"column" };
const CARD  = { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"14px 16px" };
const BACK_BTN = { background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:24, lineHeight:1, padding:0, display:"flex", alignItems:"center" };
const HEAD  = { padding:"14px 18px", borderBottom:"1px solid #111", display:"flex", alignItems:"center", gap:12 };

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   AR CAMERA SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ARScreen({ targetLang, onBack }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const workerRef   = useRef(null);
  const streamRef   = useRef(null);
  const scanTimer   = useRef(null);
  const mounted     = useRef(true);

  const [camStatus,   setCamStatus]   = useState("init");
  const [ocrReady,    setOcrReady]    = useState(false);
  const [labels,      setLabels]      = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [facingMode,  setFacingMode]  = useState("environment");
  const [scanCount,   setScanCount]   = useState(0);
  const [toast,       setToast]       = useState("");
  const [permission,  setPermission]  = useState("prompt");
  const [ocrMsg,      setOcrMsg]      = useState("Loading OCR engine...");

  const lang = LMAP[targetLang] || LMAP.hi;

  const showToast = m => { setToast(m); setTimeout(() => setToast(""), 2500); };

  /* Camera start */
  const startCam = useCallback(async () => {
    setCamStatus("init");
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setPermission("granted");
          setCamStatus("ready");
        };
      }
    } catch (e) {
      setPermission(e.name === "NotAllowedError" ? "denied" : "error");
      setCamStatus("error");
    }
  }, [facingMode]);

  useEffect(() => {
    mounted.current = true;
    startCam();
    return () => {
      mounted.current = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(scanTimer.current);
      workerRef.current?.terminate();
    };
  }, [startCam]);

  /* Load Tesseract */
  useEffect(() => {
    if (window.Tesseract) { initOCR(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload  = () => { if (mounted.current) initOCR(); };
    s.onerror = () => { if (mounted.current) setOcrMsg("OCR failed to load"); };
    document.head.appendChild(s);
  }, []);

  async function initOCR() {
    try {
      setOcrMsg("Initializing text recognition...");
      const w = await window.Tesseract.createWorker("eng", 1, {
        logger: () => {},
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
        corePath:   "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js",
      });
      await w.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-:/&%",
        preserve_interword_spaces: "1",
      });
      workerRef.current = w;
      if (mounted.current) { setOcrReady(true); setOcrMsg(""); }
    } catch (e) {
      if (mounted.current) setOcrMsg("OCR init failed — try reloading");
    }
  }

  /* Auto scan loop */
  useEffect(() => {
    if (camStatus !== "ready" || !ocrReady) return;
    scanTimer.current = setInterval(doScan, 3500);
    return () => clearInterval(scanTimer.current);
  }, [camStatus, ocrReady, targetLang]);

  const doScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current) return;
    const v = videoRef.current;
    if (v.readyState < 2 || v.paused) return;
    setCamStatus("scanning");

    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    c.width  = v.videoWidth  || 640;
    c.height = v.videoHeight || 480;
    ctx.filter = "grayscale(1) contrast(1.9) brightness(1.1)";
    ctx.drawImage(v, 0, 0, c.width, c.height);
    ctx.filter = "none";

    try {
      const { data } = await workerRef.current.recognize(c);
      if (!mounted.current) return;
      const words = (data.words || []).filter(w =>
        w.confidence > 55 && w.text.trim().length > 1 && /[A-Za-z]/.test(w.text)
      );
      const phrases = groupWords(words, c.width, c.height);

      if (phrases.length > 0) {
        const unique = [...new Set(phrases.map(p => p.text))];
        const translations = await Promise.all(unique.map(t => trSimple(t, targetLang)));
        const tmap = Object.fromEntries(unique.map((t, i) => [t, translations[i]]));
        if (mounted.current) {
          setLabels(phrases.map((p, i) => ({ id: i, ...p, translated: tmap[p.text] })));
          setScanCount(n => n + 1);
        }
      }
    } catch {}
    if (mounted.current) setCamStatus("ready");
  }, [targetLang]);

  function groupWords(words, W, H) {
    const used = new Set();
    const result = [];
    words.forEach((w, i) => {
      if (used.has(i)) return;
      let phrase = w.text.trim(), bbox = { ...w.bbox }, conf = w.confidence;
      used.add(i);
      words.forEach((w2, j) => {
        if (used.has(j)) return;
        if (Math.abs(w2.bbox.y0 - w.bbox.y0) < 20 && w2.bbox.x0 - bbox.x1 < 70 && w2.bbox.x0 > bbox.x0) {
          phrase += " " + w2.text.trim();
          bbox.x1 = Math.max(bbox.x1, w2.bbox.x1);
          bbox.y1 = Math.max(bbox.y1, w2.bbox.y1);
          conf = (conf + w2.confidence) / 2;
          used.add(j);
        }
      });
      phrase = phrase.trim().toUpperCase();
      if (phrase.length < 2) return;
      result.push({ text: phrase, x: (bbox.x0 / W) * 100, y: (bbox.y0 / H) * 100, w: ((bbox.x1 - bbox.x0) / W) * 100, h: ((bbox.y1 - bbox.y0) / H) * 100, conf: conf / 100 });
    });
    return result.slice(0, 10);
  }

  if (permission === "denied") return (
    <div style={{ height:"100vh", background:"#000", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, padding:32, textAlign:"center", color:"#fff" }}>
      <div style={{ fontSize:56 }}>📷</div>
      <div style={{ fontSize:20, fontWeight:700 }}>Camera Access Required</div>
      <div style={{ fontSize:14, color:"rgba(255,255,255,0.5)", lineHeight:1.7 }}>Allow camera permission in your browser settings and reload the page.</div>
      <button onClick={onBack} style={{ background:"#00e5ff", border:"none", borderRadius:12, padding:"12px 28px", color:"#000", fontWeight:700, cursor:"pointer", fontSize:14 }}>← Go Back</button>
    </div>
  );

  return (
    <div style={{ position:"relative", width:"100%", height:"100vh", background:"#000", overflow:"hidden" }}>
      <style>{`
        @keyframes arScan  { 0%{top:8%} 100%{top:92%} }
        @keyframes arFade  { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.35} }
      `}</style>

      <video ref={videoRef} playsInline muted autoPlay
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
      <canvas ref={canvasRef} style={{ display:"none" }} />

      {/* vignette */}
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.6) 100%)", pointerEvents:"none" }} />

      {/* scan line */}
      {camStatus === "scanning" && (
        <div style={{ position:"absolute", left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#00e5ff,transparent)", animation:"arScan 1.2s ease-in-out infinite", zIndex:10, pointerEvents:"none" }} />
      )}

      {/* corner brackets */}
      {["tl","tr","bl","br"].map(c => (
        <div key={c} style={{ position:"absolute", width:28, height:28,
          ...(c[0]==="t"?{top:66}:{bottom:92}), ...(c[1]==="l"?{left:14}:{right:14}),
          borderTop:c[0]==="t"?"2px solid rgba(0,229,255,0.7)":"none",
          borderBottom:c[0]==="b"?"2px solid rgba(0,229,255,0.7)":"none",
          borderLeft:c[1]==="l"?"2px solid rgba(0,229,255,0.7)":"none",
          borderRight:c[1]==="r"?"2px solid rgba(0,229,255,0.7)":"none",
          pointerEvents:"none" }} />
      ))}

      {/* AR labels */}
      {labels.map(lbl => (
        <div key={lbl.id} onClick={() => { setSelected(s => s?.id === lbl.id ? null : lbl); speak(lbl.translated, targetLang); }}
          style={{ position:"absolute", left:`${lbl.x}%`, top:`${lbl.y}%`, maxWidth:`${Math.max(lbl.w, 18)}%`, zIndex:20, cursor:"pointer", animation:"arFade 0.3s" }}>
          <div style={{ position:"absolute", inset:-3, border:`1.5px solid ${selected?.id===lbl.id?"#00e5ff":"rgba(0,229,255,0.35)"}`, borderRadius:6, pointerEvents:"none" }} />
          <div style={{ background:selected?.id===lbl.id?"#00e5ff":"rgba(0,0,0,0.85)", color:selected?.id===lbl.id?"#000":"#00e5ff", border:`1px solid ${selected?.id===lbl.id?"#00e5ff":"rgba(0,229,255,0.5)"}`, borderRadius:8, padding:"3px 9px", fontSize:13, fontWeight:700, backdropFilter:"blur(10px)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%", transition:"all 0.2s", boxShadow:selected?.id===lbl.id?"0 0 14px rgba(0,229,255,0.5)":"none" }}>
            {lbl.translated}
          </div>
        </div>
      ))}

      {/* top HUD */}
      <div style={{ position:"absolute", top:0, left:0, right:0, padding:"12px 16px", background:"linear-gradient(to bottom,rgba(0,0,0,0.82),transparent)", display:"flex", alignItems:"center", justifyContent:"space-between", zIndex:30 }}>
        <button onClick={onBack} style={{ background:"rgba(0,0,0,0.55)", border:"1px solid rgba(255,255,255,0.18)", color:"#fff", borderRadius:20, padding:"5px 14px", fontSize:13, cursor:"pointer" }}>← Back</button>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:camStatus==="scanning"?"#ff9800":ocrReady?"#00e676":"#444", animation:ocrReady&&camStatus!=="scanning"?"pulse 2s infinite":"none", boxShadow:ocrReady?"0 0 6px #00e676":"none" }} />
          <span style={{ fontSize:11, color:"rgba(255,255,255,0.8)", letterSpacing:1 }}>
            {camStatus==="scanning"?"READING":ocrReady?"LIVE AR":"LOADING"}
          </span>
        </div>
        <div style={{ background:"rgba(0,0,0,0.55)", border:"1px solid rgba(0,229,255,0.3)", borderRadius:16, padding:"4px 10px", fontSize:12, color:"#00e5ff" }}>
          {lang.flag} {lang.name}
        </div>
      </div>

      {/* side controls */}
      <div style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", display:"flex", flexDirection:"column", gap:10, zIndex:30 }}>
        {[
          { icon:"🔄", label:"Flip",  fn: () => setFacingMode(m => m==="environment"?"user":"environment") },
          { icon:"📸", label:"Scan",  fn: doScan },
        ].map(b => (
          <button key={b.label} onClick={b.fn} title={b.label}
            style={{ width:44, height:44, background:"rgba(0,0,0,0.65)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:12, color:"#fff", cursor:"pointer", fontSize:20, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {b.icon}
          </button>
        ))}
      </div>

      {/* OCR loading overlay */}
      {!ocrReady && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, zIndex:25, background:"rgba(0,0,0,0.65)" }}>
          <div style={{ width:50, height:50, border:"3px solid #00e5ff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
          <div style={{ color:"#00e5ff", fontSize:13, letterSpacing:2 }}>{ocrMsg || "INITIALIZING..."}</div>
          <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11 }}>First load takes ~10 seconds</div>
        </div>
      )}

      {/* bottom panel */}
      {selected ? (
        <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"rgba(4,4,18,0.97)", backdropFilter:"blur(24px)", borderTop:"1px solid rgba(0,229,255,0.5)", padding:"18px 20px", display:"flex", gap:14, alignItems:"center", zIndex:40, animation:"arFade 0.2s" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:2, marginBottom:4 }}>DETECTED TEXT</div>
            <div style={{ fontSize:14, color:"rgba(255,255,255,0.55)", marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selected.text}</div>
            <div style={{ fontSize:26, fontWeight:700, color:"#00e5ff", lineHeight:1.3 }}>{selected.translated}</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
            <button onClick={() => speak(selected.translated, targetLang)}
              style={{ width:44, height:44, background:"#00e5ff", border:"none", borderRadius:12, fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>🔊</button>
            <button onClick={() => { navigator.clipboard?.writeText(selected.translated); showToast("Copied!"); }}
              style={{ width:44, height:44, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:12, fontSize:18, cursor:"pointer", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center" }}>📋</button>
            <button onClick={() => setSelected(null)}
              style={{ width:44, height:44, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, fontSize:16, cursor:"pointer", color:"#666", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
        </div>
      ) : (
        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"12px 16px 20px", background:"linear-gradient(to top,rgba(0,0,0,0.75),transparent)", zIndex:30, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)" }}>
            {labels.length > 0 ? `${labels.length} text(s) found — tap to translate` : ocrReady ? "Point camera at signs, menus, labels..." : ""}
          </div>
          <div style={{ fontSize:11, color:"rgba(0,229,255,0.55)" }}>Scan #{scanCount}</div>
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:120, left:"50%", transform:"translateX(-50%)", background:"#fff", color:"#000", padding:"8px 20px", borderRadius:20, fontSize:13, fontWeight:700, zIndex:999, whiteSpace:"nowrap" }}>{toast}</div>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LANGUAGE SELECT COMPONENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function LangSelect({ value, onChange, label, exclude }) {
  return (
    <div style={{ flex:1 }}>
      <div style={{ fontSize:9, color:"#444", letterSpacing:1.5, marginBottom:5 }}>{label}</div>
      <div style={{ position:"relative" }}>
        <select value={value} onChange={e => onChange(e.target.value)}
          style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"10px 32px 10px 12px", color:"#fff", fontSize:14, outline:"none", cursor:"pointer", appearance:"none", WebkitAppearance:"none" }}>
          {LANGUAGES.filter(l => l.code !== exclude).map(l => (
            <option key={l.code} value={l.code} style={{ background:"#111" }}>{l.flag} {l.name}</option>
          ))}
        </select>
        <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#555", pointerEvents:"none", fontSize:12 }}>▼</div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TEXT TRANSLATE SCREEN
   - Independent source + target language selection
   - Speak source in source-language voice
   - Speak translation in target-language voice
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function TranslateScreen({ defaultTarget, onBack }) {
  const [srcLang,  setSrcLang]  = useState("en");
  const [tgtLang,  setTgtLang]  = useState(defaultTarget || "hi");
  const [input,    setInput]    = useState("");
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [history,  setHistory]  = useState([]);
  const [spkState, setSpkState] = useState(null); // "src"|"tgt"

  const srcObj = LMAP[srcLang];
  const tgtObj = LMAP[tgtLang];

  const swap = () => {
    setSrcLang(tgtLang);
    setTgtLang(srcLang);
    if (result?.translation) { setInput(result.translation); setResult(null); }
  };

  const doTranslate = async () => {
    if (!input.trim()) return;
    setLoading(true); setResult(null);
    const r = await trDetailed(input, tgtLang, srcLang);
    setResult(r);
    if (r?.translation) setHistory(h => [{ input, srcLang, tgtLang, ...r }, ...h.slice(0, 9)]);
    setLoading(false);
  };

  const doSpeak = (text, lang, which) => {
    setSpkState(which);
    speak(text, lang);
    setTimeout(() => setSpkState(null), 2200);
  };

  const SpeakBtn = ({ text, lang, which, size = 36 }) => (
    <button onClick={() => doSpeak(text, lang, which)}
      style={{ width:size, height:size, background:spkState===which?"#00e5ff":"rgba(0,229,255,0.1)", border:`1px solid ${spkState===which?"#00e5ff":"rgba(0,229,255,0.3)"}`, borderRadius:size/2.5, color:spkState===which?"#000":"#00e5ff", cursor:"pointer", fontSize:size*0.45, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.2s" }}>
      🔊
    </button>
  );

  return (
    <div style={{ ...PAGE }}>
      <div style={{ ...HEAD }}>
        <button onClick={onBack} style={BACK_BTN}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:15 }}>Translate</div>
          <div style={{ fontSize:11, color:"#444" }}>AI-powered · Claude</div>
        </div>
      </div>

      <div style={{ flex:1, overflow:"auto", padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>

        {/* Language row */}
        <div style={{ display:"flex", alignItems:"flex-end", gap:8 }}>
          <LangSelect value={srcLang} onChange={v => { setSrcLang(v); setResult(null); }} label="FROM" exclude={tgtLang} />
          <button onClick={swap}
            style={{ flexShrink:0, width:36, height:38, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#00e5ff", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:0 }}>
            ⇄
          </button>
          <LangSelect value={tgtLang} onChange={v => { setTgtLang(v); setResult(null); }} label="TO" exclude={srcLang} />
        </div>

        {/* Source input */}
        <div style={{ position:"relative" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && e.ctrlKey && doTranslate()}
            placeholder={`Type in ${srcObj?.name || "source language"}…  (Ctrl+Enter to translate)`}
            rows={4}
            style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"12px 14px", paddingRight:52, color:"#fff", fontSize:15, fontFamily:"inherit", resize:"vertical", outline:"none" }} />
          {input.trim() && (
            <div style={{ position:"absolute", top:10, right:10 }}>
              <SpeakBtn text={input} lang={srcLang} which="src" size={36} />
            </div>
          )}
        </div>

        <button onClick={doTranslate} disabled={loading || !input.trim()}
          style={{ background: loading || !input.trim() ? "rgba(0,229,255,0.12)" : "#00e5ff", border:"none", borderRadius:10, padding:"12px", color: loading || !input.trim() ? "rgba(255,255,255,0.25)" : "#000", fontWeight:700, fontSize:14, cursor: loading || !input.trim() ? "not-allowed" : "pointer", transition:"all 0.2s" }}>
          {loading ? "Translating…" : `Translate to ${tgtObj?.name} →`}
        </button>

        {/* Result */}
        {result && (
          <div style={{ background:"rgba(0,229,255,0.05)", border:"1px solid rgba(0,229,255,0.25)", borderRadius:14, padding:18, position:"relative" }}>
            <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", letterSpacing:2, marginBottom:8 }}>
              {tgtObj?.flag} {tgtObj?.name?.toUpperCase()} TRANSLATION
            </div>
            <div style={{ fontSize:26, fontWeight:700, color:"#00e5ff", lineHeight:1.4, paddingRight:56 }}>{result.translation}</div>
            {result.pronunciation && (
              <div style={{ fontSize:13, color:"#74b9ff", marginTop:8, fontStyle:"italic" }}>/ {result.pronunciation} /</div>
            )}
            {result.usage_tip && (
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:10, marginTop:12, lineHeight:1.7 }}>
                💡 {result.usage_tip}
              </div>
            )}
            {/* Speak translation in TARGET language */}
            <div style={{ position:"absolute", top:14, right:14, display:"flex", flexDirection:"column", gap:6 }}>
              <SpeakBtn text={result.translation} lang={tgtLang} which="tgt" size={40} />
              <button onClick={() => navigator.clipboard?.writeText(result.translation)}
                style={{ width:40, height:40, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#666", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>📋</button>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <div style={{ fontSize:9, color:"#333", letterSpacing:2, marginBottom:10 }}>RECENT</div>
            {history.slice(0, 5).map((h, i) => (
              <div key={i} onClick={() => { setInput(h.input); setSrcLang(h.srcLang); setTgtLang(h.tgtLang); setResult(h); }}
                style={{ ...CARD, marginBottom:8, cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:11, color:"#444" }}>{LMAP[h.srcLang]?.flag}</span>
                  <span style={{ fontSize:13, color:"rgba(255,255,255,0.4)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.input}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
                  <span style={{ fontSize:11, color:"#444" }}>{LMAP[h.tgtLang]?.flag}</span>
                  <span style={{ fontSize:14, color:"#00e5ff", fontWeight:600 }}>{h.translation}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PHRASEBOOK SCREEN
   - Batch-translates via Claude
   - Two speak buttons: English voice + target voice
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
    trBatch(missing, targetLang)
      .then(map => { setPhrases(p => ({ ...p, ...map })); setLoading(false); })
      .catch(()  => setLoading(false));
  }, [cat, targetLang]);

  return (
    <div style={{ ...PAGE }}>
      <div style={{ ...HEAD }}>
        <button onClick={onBack} style={BACK_BTN}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:15 }}>Phrasebook</div>
          <div style={{ fontSize:11, color:"#444" }}>{lang?.flag} {lang?.name} · Claude-translated</div>
        </div>
        {loading && <div style={{ fontSize:11, color:"#fd9644" }}>Translating…</div>}
      </div>

      {/* Category tabs */}
      <div style={{ padding:"10px 14px", display:"flex", gap:6, overflowX:"auto", borderBottom:"1px solid #111", scrollbarWidth:"none" }}>
        {Object.keys(PHRASE_CATS).map(c => (
          <button key={c} onClick={() => setCat(c)}
            style={{ flexShrink:0, background:cat===c?"#fd9644":"rgba(255,255,255,0.05)", border:"none", borderRadius:20, padding:"6px 14px", color:cat===c?"#000":"#777", fontSize:12, fontWeight:cat===c?700:400, cursor:"pointer", transition:"all 0.2s" }}>
            {c}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflow:"auto", padding:"14px 16px" }}>
        <div style={{ fontSize:10, color:"#333", letterSpacing:2, marginBottom:12 }}>
          🔊 Left = English · Right = {lang?.name}
        </div>
        {(PHRASE_CATS[cat] || []).map(word => {
          const tr = phrases[word];
          return (
            <div key={word} style={{ ...CARD, marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:3 }}>{word}</div>
                <div style={{ fontSize:20, fontWeight:700, color:"#fd9644", minHeight:26, overflow:"hidden", textOverflow:"ellipsis" }}>
                  {tr ?? <span style={{ color:"#2a2a2a" }}>…</span>}
                </div>
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                {/* Speak English */}
                <button onClick={() => speak(word, "en")}
                  style={{ width:36, height:36, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"50%", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}
                  title={`Hear in English`}>🔊</button>
                {/* Speak target language */}
                <button onClick={() => tr && speak(tr, targetLang)} disabled={!tr}
                  style={{ width:36, height:36, background:tr?"rgba(253,150,68,0.12)":"rgba(255,255,255,0.02)", border:`1px solid ${tr?"rgba(253,150,68,0.35)":"rgba(255,255,255,0.05)"}`, borderRadius:"50%", color:tr?"#fd9644":"#333", cursor:tr?"pointer":"not-allowed", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}
                  title={`Hear in ${lang?.name}`}>🔊</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CHALLENGE SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
    trSimple(active.words[wordIdx], targetLang)
      .then(t => { setWordTr(t); setTrLoading(false); });
  }, [active, wordIdx, targetLang]);

  const check = () => {
    if (!wordTr) return;
    const correct = answer.trim().toLowerCase() === wordTr.trim().toLowerCase();
    setFeedback({ correct, wordTr });
    if (correct) { setStreak(s => s + 1); speak(wordTr, targetLang); }
    else setStreak(0);
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

  const lang = LMAP[targetLang];

  return (
    <div style={{ ...PAGE }}>
      <div style={{ ...HEAD, justifyContent:"space-between" }}>
        <button onClick={() => { setActive(null); onBack(); }} style={BACK_BTN}>←</button>
        <div style={{ fontWeight:700, fontSize:15 }}>Daily Challenges</div>
        <div style={{ background:"rgba(0,200,83,0.1)", border:"1px solid rgba(0,200,83,0.3)", borderRadius:20, padding:"4px 12px", fontSize:12, color:"#00e676" }}>⚡ {userXP} XP</div>
      </div>

      {!active ? (
        <div style={{ flex:1, overflow:"auto", padding:18 }}>
          <div style={{ ...CARD, marginBottom:18, display:"flex", gap:14, alignItems:"center", borderColor:"rgba(0,230,118,0.2)", background:"rgba(0,230,118,0.04)" }}>
            <div style={{ fontSize:36 }}>🔥</div>
            <div>
              <div style={{ fontWeight:700, color:"#00e676", fontSize:16 }}>{streak} word streak</div>
              <div style={{ fontSize:12, color:"#555", marginTop:2 }}>Keep going to earn more XP</div>
            </div>
          </div>
          <div style={{ fontSize:9, color:"#333", letterSpacing:2, marginBottom:12 }}>TODAY'S CHALLENGES</div>
          {CHALLENGES.map(ch => (
            <div key={ch.id}
              onClick={() => { if (!completed.includes(ch.id)) { setActive(ch); setWordIdx(0); setAnswer(""); setFeedback(null); setWordTr(""); } }}
              style={{ ...CARD, marginBottom:10, cursor: completed.includes(ch.id) ? "default" : "pointer", display:"flex", alignItems:"center", gap:14,
                borderColor: completed.includes(ch.id) ? "rgba(0,200,83,0.3)" : undefined,
                background:  completed.includes(ch.id) ? "rgba(0,200,83,0.04)" : undefined }}>
              <div style={{ fontSize:32 }}>{ch.emoji}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{ch.name}</div>
                <div style={{ fontSize:12, color:"#555", marginTop:2 }}>{ch.words.length} words · {ch.xp} XP reward</div>
              </div>
              <div style={{ fontSize:22 }}>{completed.includes(ch.id) ? "✅" : "▶"}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex:1, padding:"22px 20px", display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:28 }}>{active.emoji}</span>
            <div>
              <div style={{ fontWeight:700, fontSize:16 }}>{active.name}</div>
              <div style={{ fontSize:12, color:"#555" }}>{wordIdx + 1} / {active.words.length}</div>
            </div>
          </div>

          <div style={{ height:4, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(wordIdx / active.words.length) * 100}%`, background:"#00e676", transition:"width 0.4s", borderRadius:2 }} />
          </div>

          <div style={{ flex:1 }}>
            <div style={{ fontSize:9, color:"#444", letterSpacing:2, marginBottom:10 }}>
              TRANSLATE TO {lang?.name?.toUpperCase()} {lang?.flag}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <div style={{ fontSize:38, fontWeight:700 }}>{active.words[wordIdx]}</div>
              <button onClick={() => speak(active.words[wordIdx], "en")}
                style={{ width:38, height:38, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"50%", color:"#fff", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}
                title="Hear in English">🔊</button>
            </div>

            <input value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !feedback && check()}
              placeholder={trLoading ? "Loading answer…" : `Type in ${lang?.name}…`}
              disabled={!!feedback || trLoading}
              style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.05)", border:`1.5px solid ${feedback ? (feedback.correct ? "#00e676" : "#ff4444") : "rgba(255,255,255,0.12)"}`, borderRadius:12, padding:"14px 16px", color:"#fff", fontSize:16, fontFamily:"inherit", outline:"none", transition:"border-color 0.3s" }} />

            {feedback && (
              <div style={{ marginTop:14, padding:14, background: feedback.correct ? "rgba(0,230,118,0.07)" : "rgba(255,68,68,0.07)", border:`1px solid ${feedback.correct?"rgba(0,230,118,0.3)":"rgba(255,68,68,0.3)"}`, borderRadius:12 }}>
                <div style={{ fontWeight:700, color: feedback.correct ? "#00e676" : "#ff4444" }}>
                  {feedback.correct ? "🎉 Correct!" : "❌ Not quite"}
                </div>
                {!feedback.correct && (
                  <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginTop:6, display:"flex", alignItems:"center", gap:8 }}>
                    Answer: <strong style={{ color:"#fff" }}>{feedback.wordTr}</strong>
                    <button onClick={() => speak(feedback.wordTr, targetLang)}
                      style={{ background:"none", border:"none", color:"#fd9644", cursor:"pointer", fontSize:18, padding:0 }}>🔊</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display:"flex", gap:10 }}>
            {!feedback ? (
              <button onClick={check} disabled={!answer.trim() || trLoading}
                style={{ flex:1, background: answer.trim() && !trLoading ? "#00c853" : "rgba(0,200,83,0.12)", border:"none", borderRadius:12, padding:14, color: answer.trim() && !trLoading ? "#000" : "rgba(255,255,255,0.25)", fontWeight:700, fontSize:15, cursor: answer.trim() && !trLoading ? "pointer" : "not-allowed" }}>
                {trLoading ? "Loading…" : "Check Answer"}
              </button>
            ) : (
              <>
                <button onClick={() => speak(feedback.wordTr, targetLang)}
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HOME SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function App() {
  const [screen,     setScreen]     = useState("home");
  const [tgtLang,    setTgtLang]    = useState("hi");
  const [showPicker, setShowPicker] = useState(false);
  const [userXP,     setUserXP]     = useState(120);
  const [streak]                    = useState(3);

  if (screen === "ar")         return <ARScreen        targetLang={tgtLang}                    onBack={() => setScreen("home")} />;
  if (screen === "translate")  return <TranslateScreen defaultTarget={tgtLang}                 onBack={() => setScreen("home")} />;
  if (screen === "phrasebook") return <PhrasebookScreen targetLang={tgtLang}                   onBack={() => setScreen("home")} />;
  if (screen === "challenge")  return <ChallengeScreen  targetLang={tgtLang} userXP={userXP} setUserXP={setUserXP} onBack={() => setScreen("home")} />;

  const lang  = LMAP[tgtLang];
  const level = Math.floor(userXP / 100) + 1;
  const xpPct = userXP % 100;

  return (
    <div style={{ minHeight:"100vh", background:"#07070f", color:"#fff", fontFamily:"'Segoe UI',system-ui,sans-serif", position:"relative", maxWidth:520, margin:"0 auto" }}>

      {/* Header */}
      <div style={{ padding:"24px 20px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:28, fontWeight:800, letterSpacing:-0.5 }}>
            <span style={{ color:"#00e5ff" }}>AR</span>Lens
          </div>
          <div style={{ fontSize:9, color:"#1e1e2e", letterSpacing:3, marginTop:2 }}>TRANSLATE THE WORLD</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
          <div style={{ background:"rgba(0,229,255,0.08)", border:"1px solid rgba(0,229,255,0.2)", borderRadius:20, padding:"4px 12px", fontSize:12, color:"#00e5ff" }}>Lv.{level} · ⚡{userXP} XP</div>
          <div style={{ fontSize:11, color:"#2a2a3a" }}>🔥 {streak}-day streak</div>
        </div>
      </div>

      {/* XP bar */}
      <div style={{ margin:"12px 20px 0" }}>
        <div style={{ height:3, background:"rgba(255,255,255,0.05)", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${xpPct}%`, background:"linear-gradient(90deg,#00e5ff,#0070f3)", borderRadius:2, transition:"width 0.6s" }} />
        </div>
        <div style={{ fontSize:10, color:"#252535", marginTop:4 }}>{100 - xpPct} XP to Lv.{level + 1}</div>
      </div>

      {/* Language selector */}
      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ fontSize:9, color:"#333", letterSpacing:2, marginBottom:8 }}>TRANSLATE TO</div>
        <button onClick={() => setShowPicker(true)}
          style={{ width:"100%", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:14, padding:"14px 16px", color:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", fontFamily:"inherit" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:28 }}>{lang?.flag}</span>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:16, fontWeight:600 }}>{lang?.name}</div>
              <div style={{ fontSize:11, color:"#444" }}>Tap to change language</div>
            </div>
          </div>
          <span style={{ color:"#00e5ff", fontSize:18 }}>⌄</span>
        </button>
      </div>

      {/* AR Camera button */}
      <div style={{ padding:"14px 20px 0" }}>
        <button onClick={() => setScreen("ar")}
          style={{ width:"100%", background:"rgba(0,229,255,0.06)", border:"1.5px solid rgba(0,229,255,0.35)", borderRadius:20, padding:"26px 20px", cursor:"pointer", fontFamily:"inherit", position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", inset:0, background:"radial-gradient(circle at 50% 0%,rgba(0,229,255,0.1),transparent 65%)", pointerEvents:"none" }} />
          <div style={{ fontSize:48, marginBottom:8 }}>📷</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff" }}>Launch AR Camera</div>
          <div style={{ fontSize:13, color:"rgba(0,229,255,0.7)", marginTop:5 }}>Point at text — see it translated live in {lang?.name}</div>
          <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:12, flexWrap:"wrap" }}>
            {["WebRTC Camera", "Tesseract OCR", "Claude AI"].map(t => (
              <span key={t} style={{ background:"rgba(0,229,255,0.08)", border:"1px solid rgba(0,229,255,0.2)", borderRadius:20, padding:"3px 10px", fontSize:10, color:"rgba(0,229,255,0.7)" }}>{t}</span>
            ))}
          </div>
        </button>
      </div>

      {/* Feature grid */}
      <div style={{ padding:"12px 20px 0", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {[
          { icon:"💬", label:"Text Translate",   sub:"Both-way AI translation",  color:"#6ee7ff", screen:"translate"  },
          { icon:"📚", label:"Phrasebook",        sub:"Common phrases with TTS",   color:"#fd9644", screen:"phrasebook" },
          { icon:"🎮", label:"Daily Challenge",   sub:"Earn XP · Build streaks",   color:"#00e676", screen:"challenge"  },
          { icon:"🔊", label:"Pronunciation",     sub:"Hear any word spoken",      color:"#b2a8ff", screen:"translate"  },
        ].map(f => (
          <button key={f.label} onClick={() => setScreen(f.screen)}
            style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"16px 14px", color:"#fff", cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
            <div style={{ fontSize:28, marginBottom:8 }}>{f.icon}</div>
            <div style={{ fontSize:13, fontWeight:600 }}>{f.label}</div>
            <div style={{ fontSize:11, color:f.color, marginTop:3 }}>{f.sub}</div>
          </button>
        ))}
      </div>

      {/* How it works */}
      <div style={{ margin:"14px 20px 20px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:14, padding:"14px 16px" }}>
        <div style={{ fontSize:9, color:"#2a2a3a", letterSpacing:2, marginBottom:12 }}>HOW AR TRANSLATION WORKS</div>
        {[
          ["📷", "Camera captures live video via WebRTC"],
          ["🔍", "Tesseract OCR detects & reads all text"],
          ["🤖", "Claude AI translates text accurately"],
          ["✨", "Translated labels appear on camera view"],
        ].map(([icon, text]) => (
          <div key={text} style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:10 }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.35)", lineHeight:1.6 }}>{text}</span>
          </div>
        ))}
      </div>

      {/* Language Picker Modal */}
      {showPicker && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:100, display:"flex", alignItems:"flex-end" }}
          onClick={() => setShowPicker(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ width:"100%", background:"#0d0d1a", borderRadius:"22px 22px 0 0", padding:"20px 20px 40px", maxHeight:"75vh", overflow:"auto" }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>Select Target Language</div>
            <div style={{ fontSize:11, color:"#444", marginBottom:16 }}>All screens will translate to this language</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {LANGUAGES.filter(l => l.code !== "en").map(l => (
                <button key={l.code} onClick={() => { setTgtLang(l.code); setShowPicker(false); }}
                  style={{ background: tgtLang===l.code ? "rgba(0,229,255,0.1)" : "rgba(255,255,255,0.03)", border:`1px solid ${tgtLang===l.code?"rgba(0,229,255,0.45)":"rgba(255,255,255,0.07)"}`, borderRadius:12, padding:"12px 14px", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:10, fontFamily:"inherit", textAlign:"left" }}>
                  <span style={{ fontSize:22 }}>{l.flag}</span>
                  <span style={{ fontSize:13 }}>{l.name}</span>
                  {tgtLang === l.code && <span style={{ marginLeft:"auto", color:"#00e5ff", fontSize:14 }}>✓</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setShowPicker(false)}
              style={{ width:"100%", marginTop:16, background:"rgba(255,255,255,0.04)", border:"none", borderRadius:12, padding:12, color:"#555", cursor:"pointer", fontFamily:"inherit", fontSize:14 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
