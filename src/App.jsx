import { useState, useEffect, useRef, useCallback } from "react";

/* ─── GOOGLE TRANSLATE via MyMemory (free, no key needed) ─────────────────
   Falls back to local dictionary if rate-limited.                          */
async function googleTranslate(text, targetLang, sourceLang = "en") {
  if (!text.trim()) return "";
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
  } catch {}
  return localFallback(text, targetLang);
}

/* ─── LOCAL OFFLINE DICTIONARY ────────────────────────────────────────────*/
const OFFLINE = {
  hi: { "MENU":"मेनू","OPEN":"खुला","CLOSED":"बंद","EXIT":"बाहर","STOP":"रुको","PRICE":"कीमत",
        "HOTEL":"होटल","TOILET":"शौचालय","HELP":"मदद","WATER":"पानी","FOOD":"खाना",
        "RESTAURANT":"रेस्तरां","DANGER":"खतरा","CAUTION":"सावधान","ENTER":"प्रवेश",
        "NO ENTRY":"प्रवेश निषेध","PARKING":"पार्किंग","HOSPITAL":"अस्पताल","POLICE":"पुलिस",
        "FIRE":"आग","SALE":"बिक्री","FREE":"मुफ़्त","NEW":"नया","OPEN 24 HOURS":"24 घंटे खुला" },
  ta: { "MENU":"பட்டியல்","OPEN":"திறந்த","CLOSED":"மூடிய","EXIT":"வெளியேறு","WATER":"தண்ணீர்","HELP":"உதவி" },
  te: { "MENU":"మెను","OPEN":"తెరవబడింది","CLOSED":"మూసివేయబడింది","EXIT":"నిష్క్రమణ","HELP":"సహాయం" },
  kn: { "MENU":"ಮೆನು","OPEN":"ತೆರೆದಿದೆ","CLOSED":"ಮುಚ್ಚಲಾಗಿದೆ","EXIT":"ನಿರ್ಗಮನ","HELP":"ಸಹಾಯ" },
  es: { "MENU":"Menú","OPEN":"Abierto","CLOSED":"Cerrado","EXIT":"Salida","STOP":"Para",
        "WATER":"Agua","FOOD":"Comida","HELP":"Ayuda","DANGER":"Peligro" },
  fr: { "MENU":"Menu","OPEN":"Ouvert","CLOSED":"Fermé","EXIT":"Sortie","WATER":"Eau","HELP":"Aide" },
  de: { "MENU":"Menü","OPEN":"Offen","CLOSED":"Geschlossen","EXIT":"Ausgang","WATER":"Wasser" },
  ja: { "MENU":"メニュー","OPEN":"開いている","CLOSED":"閉まっている","EXIT":"出口","WATER":"水","HELP":"助けて" },
  zh: { "MENU":"菜单","OPEN":"开放","CLOSED":"关闭","EXIT":"出口","WATER":"水","HELP":"帮助" },
  ar: { "MENU":"قائمة","OPEN":"مفتوح","CLOSED":"مغلق","EXIT":"خروج","WATER":"ماء","HELP":"مساعدة" },
};
function localFallback(text, lang) {
  const dict = OFFLINE[lang] || {};
  return dict[text.toUpperCase()] || dict[text] || text;
}

/* ─── LANGUAGES ────────────────────────────────────────────────────────────*/
const LANGUAGES = [
  { code:"hi", name:"Hindi",      flag:"🇮🇳", bcp:"hi-IN" },
  { code:"ta", name:"Tamil",      flag:"🇮🇳", bcp:"ta-IN" },
  { code:"te", name:"Telugu",     flag:"🇮🇳", bcp:"te-IN" },
  { code:"kn", name:"Kannada",    flag:"🇮🇳", bcp:"kn-IN" },
  { code:"mr", name:"Marathi",    flag:"🇮🇳", bcp:"mr-IN" },
  { code:"bn", name:"Bengali",    flag:"🇮🇳", bcp:"bn-IN" },
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

/* ─── SPEAK ────────────────────────────────────────────────────────────────*/
function speak(text, langCode) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const lang = LANGUAGES.find(l => l.code === langCode);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang?.bcp || "en-US";
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

/* ─── DAILY CHALLENGES ─────────────────────────────────────────────────────*/
const CHALLENGES = [
  { id:1, emoji:"🍳", name:"Kitchen",    words:["Refrigerator","Stove","Bowl","Knife","Fork","Plate"], xp:50 },
  { id:2, emoji:"🛒", name:"Market",     words:["Price","Buy","Sell","Cheap","Expensive","Receipt"], xp:60 },
  { id:3, emoji:"🏥", name:"Hospital",   words:["Doctor","Medicine","Pain","Emergency","Nurse","Ambulance"], xp:80 },
  { id:4, emoji:"🚆", name:"Transport",  words:["Train","Bus","Ticket","Platform","Departure","Arrival"], xp:55 },
  { id:5, emoji:"🍽️", name:"Restaurant", words:["Menu","Order","Bill","Waiter","Spicy","Vegetarian"], xp:45 },
];

/* ═══════════════════════════════════════════════════════════════════════════
   AR CAMERA SCREEN — real WebRTC + Tesseract OCR
═══════════════════════════════════════════════════════════════════════════ */
function ARCameraScreen({ targetLang, onBack }) {
  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const overlayRef    = useRef(null);
  const workerRef     = useRef(null);
  const streamRef     = useRef(null);
  const scanInterval  = useRef(null);
  const isMounted     = useRef(true);

  const [status,      setStatus]      = useState("init");   // init|loading|ready|scanning|error
  const [labels,      setLabels]      = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [ocrReady,    setOcrReady]    = useState(false);
  const [toast,       setToast]       = useState("");
  const [facingMode,  setFacingMode]  = useState("environment");
  const [flashOn,     setFlashOn]     = useState(false);
  const [scanCount,   setScanCount]   = useState(0);
  const [permission,  setPermission]  = useState("prompt"); // prompt|granted|denied
  const [tesseractLoaded, setTesseractLoaded] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiInput,setShowApiInput]= useState(false);

  const langObj = LANGUAGES.find(l => l.code === targetLang) || LANGUAGES[0];

  /* Load Tesseract from CDN */
  useEffect(() => {
    if (window.Tesseract) { setTesseractLoaded(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = () => { if (isMounted.current) setTesseractLoaded(true); };
    s.onerror = () => { if (isMounted.current) setStatus("error"); };
    document.head.appendChild(s);
    return () => { isMounted.current = false; };
  }, []);

  /* Start camera */
  const startCamera = useCallback(async () => {
    setStatus("loading");
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, focusMode: "continuous" },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setPermission("granted");
          setStatus("ready");
        };
      }
    } catch (e) {
      setPermission(e.name === "NotAllowedError" ? "denied" : "error");
      setStatus("error");
    }
  }, [facingMode]);

  useEffect(() => { startCamera(); return () => { streamRef.current?.getTracks().forEach(t => t.stop()); clearInterval(scanInterval.current); }; }, [startCamera]);

  /* Init Tesseract worker */
  useEffect(() => {
    if (!tesseractLoaded) return;
    let w;
    (async () => {
      try {
        w = await window.Tesseract.createWorker("eng", 1, {
          logger: () => {},
          workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
          corePath:   "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js",
        });
        await w.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-:/", preserve_interword_spaces: "1" });
        workerRef.current = w;
        if (isMounted.current) setOcrReady(true);
      } catch {}
    })();
    return () => { w?.terminate(); };
  }, [tesseractLoaded]);

  /* Auto-scan every 3 seconds when ready */
  useEffect(() => {
    if (status !== "ready" || !ocrReady) return;
    scanInterval.current = setInterval(doScan, 3000);
    return () => clearInterval(scanInterval.current);
  }, [status, ocrReady, targetLang]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const doScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2) return;

    setStatus("scanning");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;

    /* Pre-process: grayscale + contrast boost for better OCR */
    ctx.filter = "grayscale(1) contrast(1.6) brightness(1.1)";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";

    try {
      const { data } = await workerRef.current.recognize(canvas);
      if (!isMounted.current) return;

      /* Filter words by confidence & length */
      const words = (data.words || []).filter(w =>
        w.confidence > 55 &&
        w.text.trim().length > 1 &&
        /[A-Za-z]/.test(w.text)
      );

      /* Group adjacent words into phrases */
      const phrases = groupWords(words, canvas.width, canvas.height);

      /* Translate all unique texts in parallel */
      const unique = [...new Set(phrases.map(p => p.text))];
      const translations = await Promise.all(unique.map(t => googleTranslate(t, targetLang)));
      const trMap = Object.fromEntries(unique.map((t, i) => [t, translations[i]]));

      const newLabels = phrases.map((p, i) => ({ id: i, ...p, translated: trMap[p.text] }));
      setLabels(newLabels);
      setScanCount(c => c + 1);
    } catch {}
    setStatus("ready");
  }, [targetLang]);

  /* Group words into phrases based on proximity */
  function groupWords(words, W, H) {
    if (!words.length) return [];
    const result = [];
    const used = new Set();

    words.forEach((w, i) => {
      if (used.has(i)) return;
      let phrase = w.text.trim();
      let bbox = { ...w.bbox };
      let conf = w.confidence;
      used.add(i);

      /* Look for adjacent words on the same line */
      words.forEach((w2, j) => {
        if (used.has(j)) return;
        const sameRow = Math.abs(w2.bbox.y0 - w.bbox.y0) < 20;
        const nearby  = w2.bbox.x0 - bbox.x1 < 60 && w2.bbox.x0 > bbox.x0;
        if (sameRow && nearby) {
          phrase += " " + w2.text.trim();
          bbox.x1 = Math.max(bbox.x1, w2.bbox.x1);
          bbox.y1 = Math.max(bbox.y1, w2.bbox.y1);
          conf = (conf + w2.confidence) / 2;
          used.add(j);
        }
      });

      phrase = phrase.trim().toUpperCase();
      if (phrase.length < 2) return;

      result.push({
        text: phrase,
        x: (bbox.x0 / W) * 100,
        y: (bbox.y0 / H) * 100,
        w: ((bbox.x1 - bbox.x0) / W) * 100,
        h: ((bbox.y1 - bbox.y0) / H) * 100,
        confidence: conf / 100,
      });
    });
    return result.slice(0, 12); // max 12 labels at once
  }

  /* Flashlight toggle via track constraints */
  const toggleFlash = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !flashOn }] });
      setFlashOn(f => !f);
    } catch { showToast("Flash not supported on this device"); }
  };

  const flipCamera = () => setFacingMode(m => m === "environment" ? "user" : "environment");

  /* ── RENDER ── */
  if (permission === "denied") return (
    <PermissionDenied onBack={onBack} />
  );

  return (
    <div style={{ position:"relative", width:"100%", height:"100vh", background:"#000", overflow:"hidden", fontFamily:"'DM Mono', monospace" }}>

      {/* Live video */}
      <video ref={videoRef} playsInline muted autoPlay
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", opacity: status==="loading" ? 0 : 1, transition:"opacity 0.5s" }} />

      {/* Hidden canvas for OCR */}
      <canvas ref={canvasRef} style={{ display:"none" }} />

      {/* Dark vignette */}
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)", pointerEvents:"none" }} />

      {/* Scan line animation */}
      {status === "scanning" && (
        <div style={{ position:"absolute", left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#00e5ff,transparent)", animation:"scanline 1.2s ease-in-out infinite", pointerEvents:"none", zIndex:10 }} />
      )}
      <style>{`
        @keyframes scanline { 0%{top:10%} 100%{top:90%} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse2 { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>

      {/* Corner brackets */}
      {["tl","tr","bl","br"].map(c => (
        <div key={c} style={{ position:"absolute", width:32, height:32,
          ...(c[0]==="t"?{top:60}:{bottom:80}), ...(c[1]==="l"?{left:16}:{right:16}),
          borderTop: c[0]==="t" ? "2px solid #00e5ff" : "none",
          borderBottom: c[0]==="b" ? "2px solid #00e5ff" : "none",
          borderLeft: c[1]==="l" ? "2px solid #00e5ff" : "none",
          borderRight: c[1]==="r" ? "2px solid #00e5ff" : "none",
          opacity: 0.8, pointerEvents:"none" }} />
      ))}

      {/* AR Labels overlaid on video */}
      {labels.map(lbl => (
        <ARLabel key={lbl.id} lbl={lbl} selected={selected} targetLang={targetLang}
          onSelect={l => { setSelected(s => s?.id===l.id ? null : l); speak(l.translated, targetLang); }} />
      ))}

      {/* Top HUD */}
      <div style={{ position:"absolute", top:0, left:0, right:0, padding:"12px 16px",
        background:"linear-gradient(to bottom,rgba(0,0,0,0.75) 0%,transparent 100%)",
        display:"flex", alignItems:"center", justifyContent:"space-between", zIndex:30 }}>
        <button onClick={onBack} style={{ background:"rgba(0,0,0,0.5)", border:"1px solid rgba(255,255,255,0.25)", color:"#fff", borderRadius:20, padding:"5px 14px", fontSize:13, cursor:"pointer" }}>← Back</button>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:"50%",
            background: status==="scanning"?"#ff9800": ocrReady?"#00e676":"#555",
            animation: ocrReady && status!=="scanning" ? "pulse2 2s infinite" : "none" }} />
          <span style={{ fontSize:12, color:"rgba(255,255,255,0.8)", letterSpacing:1 }}>
            {status==="loading"?"LOADING" : status==="scanning"?"READING TEXT" : ocrReady?"LIVE AR":"INITIALIZING"}
          </span>
        </div>
        <div style={{ background:"rgba(0,0,0,0.5)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:16, padding:"4px 10px", fontSize:12, color:"#00e5ff" }}>
          {langObj.flag} {langObj.name}
        </div>
      </div>

      {/* Camera controls */}
      <div style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", display:"flex", flexDirection:"column", gap:10, zIndex:30 }}>
        {[
          { icon:"🔄", label:"Flip",  action: flipCamera },
          { icon: flashOn?"⚡":"🔦", label:"Flash", action: toggleFlash },
          { icon:"📸", label:"Scan",  action: doScan },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action} title={btn.label}
            style={{ width:44, height:44, background:"rgba(0,0,0,0.6)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:12, color:"#fff", cursor:"pointer", fontSize:20, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {btn.icon}
          </button>
        ))}
      </div>

      {/* OCR status overlay if not ready */}
      {!ocrReady && status !== "error" && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, zIndex:20, background:"rgba(0,0,0,0.5)" }}>
          <div style={{ width:56, height:56, border:"3px solid #00e5ff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
          <div style={{ color:"#00e5ff", fontSize:13, letterSpacing:3 }}>
            {!tesseractLoaded ? "LOADING OCR ENGINE..." : "INITIALIZING TEXT RECOGNITION..."}
          </div>
          <div style={{ color:"rgba(255,255,255,0.4)", fontSize:11 }}>This takes ~10s on first load</div>
        </div>
      )}

      {/* Bottom detail panel */}
      {selected ? (
        <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"rgba(0,0,0,0.92)",
          backdropFilter:"blur(20px)", borderTop:"1.5px solid #00e5ff", padding:"16px 20px",
          display:"flex", alignItems:"center", gap:14, zIndex:40, animation:"fadeIn 0.2s" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:2, marginBottom:4 }}>DETECTED TEXT</div>
            <div style={{ fontSize:16, color:"rgba(255,255,255,0.7)", marginBottom:4 }}>{selected.text}</div>
            <div style={{ fontSize:24, fontWeight:700, color:"#00e5ff" }}>{selected.translated}</div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:4 }}>Confidence: {Math.round(selected.confidence*100)}%</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button onClick={() => speak(selected.translated, targetLang)}
              style={{ width:44, height:44, background:"#00e5ff", border:"none", borderRadius:12, fontSize:20, cursor:"pointer" }}>🔊</button>
            <button onClick={() => { navigator.clipboard?.writeText(selected.translated); showToast("Copied!"); }}
              style={{ width:44, height:44, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:12, fontSize:18, cursor:"pointer", color:"#fff" }}>📋</button>
            <button onClick={() => setSelected(null)}
              style={{ width:44, height:44, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:12, fontSize:16, cursor:"pointer", color:"#888" }}>✕</button>
          </div>
        </div>
      ) : (
        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"10px 16px 16px",
          background:"linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 100%)", zIndex:30,
          display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)" }}>
            {labels.length > 0 ? `${labels.length} text(s) detected — tap to translate` : ocrReady ? "Point at signs, menus, labels..." : ""}
          </div>
          <div style={{ fontSize:11, color:"rgba(0,229,255,0.6)" }}>Scan #{scanCount}</div>
        </div>
      )}

      {/* Toast */}
      {toast && <div style={{ position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)", background:"#fff", color:"#000", padding:"8px 20px", borderRadius:20, fontSize:13, fontWeight:700, zIndex:999, whiteSpace:"nowrap" }}>{toast}</div>}
    </div>
  );
}

function ARLabel({ lbl, selected, onSelect }) {
  const isSelected = selected?.id === lbl.id;
  return (
    <div onClick={() => onSelect(lbl)}
      style={{ position:"absolute", left:`${lbl.x}%`, top:`${lbl.y}%`,
        maxWidth:`${Math.max(lbl.w, 20)}%`, zIndex:20, cursor:"pointer",
        animation:"fadeIn 0.3s ease" }}>
      {/* Bounding box outline */}
      <div style={{ position:"absolute", inset:-4, border:`1.5px solid ${isSelected?"#00e5ff":"rgba(0,229,255,0.4)"}`,
        borderRadius:6, pointerEvents:"none", transition:"border-color 0.2s" }} />
      {/* Translation chip */}
      <div style={{ background: isSelected ? "#00e5ff" : "rgba(0,0,0,0.82)",
        color: isSelected ? "#000" : "#00e5ff",
        border: `1px solid ${isSelected?"#00e5ff":"rgba(0,229,255,0.6)"}`,
        borderRadius:8, padding:"4px 10px", fontSize:13, fontWeight:700,
        backdropFilter:"blur(12px)", whiteSpace:"nowrap", overflow:"hidden",
        textOverflow:"ellipsis", maxWidth:"100%",
        transform: isSelected ? "scale(1.05)" : "scale(1)", transition:"all 0.2s",
        boxShadow: isSelected ? "0 0 12px rgba(0,229,255,0.5)" : "none",
        fontFamily:"'DM Mono', monospace" }}>
        {lbl.translated}
      </div>
      {/* Confidence dot */}
      <div style={{ width: Math.round(lbl.confidence*100)+"px", maxWidth:"100%", height:2,
        background:"#00e5ff", borderRadius:2, marginTop:2, opacity:0.5 }} />
    </div>
  );
}

function PermissionDenied({ onBack }) {
  return (
    <div style={{ height:"100vh", background:"#000", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:32, textAlign:"center", fontFamily:"'DM Mono', monospace", color:"#fff" }}>
      <div style={{ fontSize:64 }}>📷</div>
      <div style={{ fontSize:20, fontWeight:700 }}>Camera Access Required</div>
      <div style={{ fontSize:14, color:"rgba(255,255,255,0.5)", lineHeight:1.6 }}>Please allow camera permission in your browser settings and reload the page to use AR translation.</div>
      <button onClick={onBack} style={{ background:"#00e5ff", border:"none", borderRadius:12, padding:"12px 28px", color:"#000", fontWeight:700, cursor:"pointer", fontSize:14 }}>← Go Back</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TEXT TRANSLATE SCREEN — Claude AI powered
═══════════════════════════════════════════════════════════════════════════ */
function TranslateScreen({ targetLang, onBack }) {
  const [input,    setInput]    = useState("");
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [history,  setHistory]  = useState([]);
  const [srcLang,  setSrcLang]  = useState("en");
  const lang = LANGUAGES.find(l => l.code === targetLang);

  const translate = async () => {
    if (!input.trim()) return;
    setLoading(true); setResult(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          messages:[{ role:"user", content:
            `Translate the text below to ${lang?.name}. Reply ONLY with valid JSON, no markdown fences.
JSON format: {"translation":"...","pronunciation":"romanized pronunciation guide","usage_tip":"1 sentence cultural tip","confidence":0.0-1.0}
Text: "${input}"` }]
        })
      });
      const data = await res.json();
      const raw = data.content?.find(b => b.type==="text")?.text || "{}";
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setResult(parsed);
      setHistory(h => [{ input, ...parsed }, ...h.slice(0,9)]);
    } catch {
      const tr = await googleTranslate(input, targetLang, srcLang);
      setResult({ translation:tr, pronunciation:"—", usage_tip:"Offline fallback via MyMemory API.", confidence:0.8 });
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a14", color:"#fff", fontFamily:"'DM Mono', monospace", display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,0.08)", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#666", cursor:"pointer", fontSize:22 }}>←</button>
        <div>
          <div style={{ fontWeight:700, fontSize:15 }}>Text Translate</div>
          <div style={{ fontSize:11, color:"#555" }}>AI-powered • {lang?.flag} {lang?.name}</div>
        </div>
      </div>
      <div style={{ padding:"18px", flex:1, overflow:"auto", display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ display:"flex", gap:8 }}>
          <select value={srcLang} onChange={e => setSrcLang(e.target.value)}
            style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"10px 12px", color:"#fff", fontSize:13, outline:"none" }}>
            <option value="en">🇬🇧 English</option>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
          </select>
          <div style={{ display:"flex", alignItems:"center", color:"#444", fontSize:18 }}>→</div>
          <div style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"10px 12px", fontSize:13, color:"#6ee7ff" }}>{lang?.flag} {lang?.name}</div>
        </div>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter" && e.ctrlKey && translate()}
          placeholder="Type text to translate... (Ctrl+Enter to translate)"
          rows={5} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:12, padding:14, color:"#fff", fontSize:15, fontFamily:"inherit", resize:"vertical", outline:"none" }} />
        <button onClick={translate} disabled={loading || !input.trim()}
          style={{ background: loading||!input.trim() ? "rgba(110,231,255,0.2)" : "#00e5ff", border:"none", borderRadius:10, padding:"13px", color: loading||!input.trim() ? "rgba(255,255,255,0.3)" : "#000", fontWeight:700, fontSize:14, cursor: loading||!input.trim() ? "not-allowed" : "pointer", transition:"all 0.2s" }}>
          {loading ? "Translating..." : `Translate → ${lang?.name}`}
        </button>
        {result && (
          <div style={{ background:"rgba(0,229,255,0.06)", border:"1px solid rgba(0,229,255,0.3)", borderRadius:14, padding:18, animation:"fadeIn 0.3s" }}>
            <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
            <div style={{ fontSize:26, fontWeight:700, color:"#00e5ff", lineHeight:1.4, marginBottom:10 }}>{result.translation}</div>
            {result.pronunciation && result.pronunciation !== "—" && (
              <div style={{ fontSize:13, color:"#74b9ff", marginBottom:8 }}>🔊 {result.pronunciation}</div>
            )}
            {result.usage_tip && (
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", borderTop:"1px solid rgba(255,255,255,0.08)", paddingTop:10, marginTop:10, lineHeight:1.6 }}>💡 {result.usage_tip}</div>
            )}
            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              <button onClick={() => speak(result.translation, targetLang)} style={{ flex:1, background:"rgba(0,229,255,0.12)", border:"1px solid rgba(0,229,255,0.3)", borderRadius:8, padding:10, color:"#00e5ff", cursor:"pointer", fontSize:13 }}>🔊 Speak</button>
              <button onClick={() => navigator.clipboard?.writeText(result.translation)} style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:10, color:"#aaa", cursor:"pointer", fontSize:13 }}>📋 Copy</button>
            </div>
          </div>
        )}
        {history.length > 0 && (
          <div>
            <div style={{ fontSize:10, color:"#444", letterSpacing:2, marginBottom:10 }}>RECENT</div>
            {history.slice(0,5).map((h, i) => (
              <div key={i} onClick={() => { setInput(h.input); setResult(h); }}
                style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, padding:"10px 14px", marginBottom:6, cursor:"pointer" }}>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)" }}>{h.input}</div>
                <div style={{ fontSize:14, color:"#00e5ff", marginTop:3 }}>{h.translation}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PHRASEBOOK SCREEN
═══════════════════════════════════════════════════════════════════════════ */
function PhrasebookScreen({ targetLang, onBack }) {
  const [cat, setCat] = useState("Essentials");
  const [translating, setTranslating] = useState(false);
  const [phrases, setPhrases] = useState({});
  const lang = LANGUAGES.find(l => l.code === targetLang);

  const CATS = {
    "Essentials": ["Hello","Thank you","Please","Sorry","Yes","No","Help","Stop","Good","Bad"],
    "Food & Drink": ["Water","Food","Menu","Restaurant","Price","Vegetarian","Spicy","Bill","Order","Delicious"],
    "Navigation": ["Exit","Entrance","Toilet","Hotel","Hospital","Airport","Police","Bus","Train","Taxi"],
    "Shopping": ["How much","Expensive","Cheap","Discount","Sale","Open","Closed","Free","Buy","Receipt"],
    "Emergency": ["Doctor","Ambulance","Fire","Danger","Caution","Help me","Call police","Lost","Injury","Medicine"],
  };

  useEffect(() => {
    const words = CATS[cat] || [];
    setTranslating(true);
    Promise.all(words.map(w => googleTranslate(w, targetLang))).then(results => {
      const map = Object.fromEntries(words.map((w, i) => [w, results[i]]));
      setPhrases(p => ({ ...p, ...map }));
      setTranslating(false);
    });
  }, [cat, targetLang]);

  return (
    <div style={{ minHeight:"100vh", background:"#0d0a06", color:"#fff", fontFamily:"'DM Mono', monospace", display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,0.08)", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#666", cursor:"pointer", fontSize:22 }}>←</button>
        <div>
          <div style={{ fontWeight:700, fontSize:15 }}>Phrasebook</div>
          <div style={{ fontSize:11, color:"#555" }}>{lang?.flag} {lang?.name} • Auto-translated</div>
        </div>
      </div>
      <div style={{ padding:"12px 16px", display:"flex", gap:6, overflowX:"auto", borderBottom:"1px solid rgba(255,255,255,0.06)", scrollbarWidth:"none" }}>
        {Object.keys(CATS).map(c => (
          <button key={c} onClick={() => setCat(c)}
            style={{ flexShrink:0, background: cat===c ? "#fd9644" : "rgba(255,255,255,0.05)", border:"none", borderRadius:20, padding:"6px 14px", color: cat===c ? "#000" : "#aaa", fontSize:12, fontWeight: cat===c ? 700:400, cursor:"pointer" }}>{c}</button>
        ))}
      </div>
      <div style={{ padding:"14px 16px", flex:1, overflow:"auto" }}>
        {(CATS[cat] || []).map(word => {
          const tr = phrases[word];
          return (
            <div key={word} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"14px 16px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, color:"rgba(255,255,255,0.5)" }}>{word}</div>
                <div style={{ fontSize:20, fontWeight:700, color:"#fd9644", marginTop:3, minHeight:28 }}>
                  {translating && !tr ? <span style={{ color:"#333" }}>...</span> : (tr || word)}
                </div>
              </div>
              <button onClick={() => speak(tr || word, targetLang)}
                style={{ width:40, height:40, background:"rgba(253,150,68,0.12)", border:"1px solid rgba(253,150,68,0.35)", borderRadius:"50%", color:"#fd9644", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>🔊</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHALLENGE SCREEN
═══════════════════════════════════════════════════════════════════════════ */
function ChallengeScreen({ targetLang, userXP, setUserXP, onBack }) {
  const [active,     setActive]     = useState(null);
  const [wordIdx,    setWordIdx]     = useState(0);
  const [answer,     setAnswer]      = useState("");
  const [feedback,   setFeedback]    = useState(null);
  const [completed,  setCompleted]   = useState([]);
  const [streak,     setStreak]      = useState(0);
  const [wordTr,     setWordTr]      = useState("");

  useEffect(() => {
    if (!active) return;
    googleTranslate(active.words[wordIdx], targetLang).then(setWordTr);
  }, [active, wordIdx, targetLang]);

  const check = () => {
    if (!wordTr) return;
    const correct = answer.trim().toLowerCase() === wordTr.trim().toLowerCase();
    setFeedback({ correct, wordTr });
    if (correct) { setStreak(s => s+1); speak(wordTr, targetLang); }
    else setStreak(0);
  };

  const next = () => {
    if (!active) return;
    if (wordIdx < active.words.length - 1) { setWordIdx(i => i+1); setAnswer(""); setFeedback(null); setWordTr(""); }
    else { setCompleted(c => [...c, active.id]); setUserXP(x => x + active.xp); setActive(null); setWordIdx(0); setAnswer(""); setFeedback(null); setWordTr(""); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#060d06", color:"#fff", fontFamily:"'DM Mono', monospace", display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <button onClick={() => { setActive(null); onBack(); }} style={{ background:"none", border:"none", color:"#666", cursor:"pointer", fontSize:22 }}>←</button>
        <div style={{ fontWeight:700, fontSize:15 }}>Daily Challenges</div>
        <div style={{ background:"rgba(0,200,83,0.12)", border:"1px solid rgba(0,200,83,0.35)", borderRadius:20, padding:"4px 12px", fontSize:12, color:"#00e676" }}>⚡ {userXP} XP</div>
      </div>

      {!active ? (
        <div style={{ padding:"18px", flex:1, overflow:"auto" }}>
          <div style={{ background:"rgba(0,230,118,0.06)", border:"1px solid rgba(0,230,118,0.2)", borderRadius:14, padding:"14px 16px", marginBottom:20, display:"flex", gap:14, alignItems:"center" }}>
            <div style={{ fontSize:36 }}>🔥</div>
            <div><div style={{ fontWeight:700, color:"#00e676", fontSize:16 }}>{streak} word streak!</div><div style={{ fontSize:12, color:"#555", marginTop:3 }}>Keep going to level up faster</div></div>
          </div>
          <div style={{ fontSize:10, color:"#444", letterSpacing:2, marginBottom:12 }}>TODAY'S CHALLENGES</div>
          {CHALLENGES.map(ch => (
            <div key={ch.id} onClick={() => { if (!completed.includes(ch.id)) { setActive(ch); setWordIdx(0); setAnswer(""); setFeedback(null); setWordTr(""); }}}
              style={{ background: completed.includes(ch.id) ? "rgba(0,200,83,0.06)" : "rgba(255,255,255,0.03)", border:`1px solid ${completed.includes(ch.id)?"rgba(0,200,83,0.3)":"rgba(255,255,255,0.08)"}`, borderRadius:14, padding:"14px 16px", marginBottom:10, cursor: completed.includes(ch.id) ? "default":"pointer", display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ fontSize:32 }}>{ch.emoji}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{ch.name}</div>
                <div style={{ fontSize:12, color:"#555", marginTop:2 }}>{ch.words.length} words • {ch.xp} XP reward</div>
              </div>
              <div style={{ fontSize:22 }}>{completed.includes(ch.id) ? "✅" : "▶"}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding:"22px 20px", flex:1, display:"flex", flexDirection:"column", gap:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:28 }}>{active.emoji}</span>
            <div><div style={{ fontWeight:700, fontSize:16 }}>{active.name}</div><div style={{ fontSize:12, color:"#555" }}>{wordIdx+1} / {active.words.length}</div></div>
          </div>
          <div style={{ height:4, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(wordIdx/active.words.length)*100}%`, background:"#00e676", transition:"width 0.4s", borderRadius:2 }} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:"#444", letterSpacing:2, marginBottom:8 }}>TRANSLATE THIS WORD</div>
            <div style={{ fontSize:40, fontWeight:700, marginBottom:6 }}>{active.words[wordIdx]}</div>
            <div style={{ fontSize:12, color:"#555", marginBottom:20 }}>→ {LANGUAGES.find(l=>l.code===targetLang)?.flag} {LANGUAGES.find(l=>l.code===targetLang)?.name}</div>
            <input value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => e.key==="Enter" && !feedback && check()}
              placeholder="Type translation..." disabled={!!feedback}
              style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.06)", border:`1px solid ${feedback ? (feedback.correct?"#00e676":"#ff4444") : "rgba(255,255,255,0.15)"}`, borderRadius:12, padding:"14px 16px", color:"#fff", fontSize:16, fontFamily:"inherit", outline:"none", transition:"border-color 0.3s" }} />
            {feedback && (
              <div style={{ marginTop:14, padding:14, background: feedback.correct?"rgba(0,230,118,0.08)":"rgba(255,68,68,0.08)", border:`1px solid ${feedback.correct?"rgba(0,230,118,0.35)":"rgba(255,68,68,0.35)"}`, borderRadius:12, animation:"fadeIn 0.3s" }}>
                <div style={{ fontWeight:700, color: feedback.correct?"#00e676":"#ff4444" }}>{feedback.correct ? "🎉 Correct!" : "❌ Not quite"}</div>
                {!feedback.correct && <div style={{ fontSize:13, color:"#aaa", marginTop:4 }}>Correct answer: <strong style={{ color:"#fff" }}>{feedback.wordTr}</strong></div>}
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            {!feedback ? (
              <button onClick={check} disabled={!answer.trim() || !wordTr}
                style={{ flex:1, background: answer.trim()&&wordTr?"#00c853":"rgba(0,200,83,0.2)", border:"none", borderRadius:12, padding:14, color: answer.trim()&&wordTr?"#000":"rgba(255,255,255,0.3)", fontWeight:700, fontSize:15, cursor: answer.trim()&&wordTr?"pointer":"not-allowed" }}>
                {!wordTr ? "Loading..." : "Check Answer"}
              </button>
            ) : (
              <>
                <button onClick={() => speak(feedback.wordTr, targetLang)} style={{ width:50, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:14, color:"#fff", cursor:"pointer", fontSize:20 }}>🔊</button>
                <button onClick={next} style={{ flex:1, background:"#00c853", border:"none", borderRadius:12, padding:14, color:"#000", fontWeight:700, fontSize:15, cursor:"pointer" }}>
                  {wordIdx < active.words.length-1 ? "Next Word →" : "Complete! 🎉"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOME SCREEN
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [screen,      setScreen]      = useState("home");
  const [targetLang,  setTargetLang]  = useState("hi");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [userXP,      setUserXP]      = useState(120);
  const [streak,      setStreak]      = useState(3);

  if (screen==="ar")         return <ARCameraScreen targetLang={targetLang} onBack={() => setScreen("home")} />;
  if (screen==="translate")  return <TranslateScreen targetLang={targetLang} onBack={() => setScreen("home")} />;
  if (screen==="challenge")  return <ChallengeScreen targetLang={targetLang} userXP={userXP} setUserXP={setUserXP} onBack={() => setScreen("home")} />;
  if (screen==="phrasebook") return <PhrasebookScreen targetLang={targetLang} onBack={() => setScreen("home")} />;

  const lang = LANGUAGES.find(l => l.code === targetLang);
  const level = Math.floor(userXP / 100) + 1;
  const xpPct = userXP % 100;

  return (
    <div style={{ minHeight:"100vh", background:"#07070f", color:"#fff", fontFamily:"'DM Mono', monospace", position:"relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ padding:"22px 20px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:26, fontWeight:500, letterSpacing:-0.5 }}>
            <span style={{ color:"#00e5ff" }}>AR</span>Lens
          </div>
          <div style={{ fontSize:10, color:"#33333a", letterSpacing:3, marginTop:2 }}>TRANSLATE THE WORLD AROUND YOU</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
          <div style={{ background:"rgba(0,229,255,0.08)", border:"1px solid rgba(0,229,255,0.25)", borderRadius:20, padding:"4px 12px", fontSize:12, color:"#00e5ff" }}>Lv.{level} • ⚡{userXP} XP</div>
          <div style={{ fontSize:11, color:"#444" }}>🔥 {streak} day streak</div>
        </div>
      </div>

      {/* XP Bar */}
      <div style={{ margin:"14px 20px 0" }}>
        <div style={{ height:3, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${xpPct}%`, background:"linear-gradient(90deg,#00e5ff,#0080ff)", borderRadius:2, transition:"width 0.6s" }} />
        </div>
        <div style={{ fontSize:10, color:"#333", marginTop:4 }}>{100-xpPct} XP to Level {level+1}</div>
      </div>

      {/* Language Selector */}
      <div style={{ padding:"18px 20px 0" }}>
        <div style={{ fontSize:10, color:"#333", letterSpacing:2, marginBottom:8 }}>TRANSLATE TO</div>
        <button onClick={() => setShowLangPicker(true)}
          style={{ width:"100%", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:"14px 16px", color:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", fontFamily:"inherit" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:28 }}>{lang?.flag}</span>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:16, fontWeight:500 }}>{lang?.name}</div>
              <div style={{ fontSize:11, color:"#555" }}>tap to change language</div>
            </div>
          </div>
          <span style={{ color:"#00e5ff", fontSize:18 }}>⌄</span>
        </button>
      </div>

      {/* Big AR Button */}
      <div style={{ padding:"18px 20px 0" }}>
        <button onClick={() => setScreen("ar")}
          style={{ width:"100%", background:"rgba(0,229,255,0.07)", border:"1.5px solid rgba(0,229,255,0.4)", borderRadius:20, padding:"28px 20px", cursor:"pointer", fontFamily:"inherit", position:"relative", overflow:"hidden", transition:"all 0.2s" }}>
          <div style={{ position:"absolute", inset:0, background:"radial-gradient(circle at 50% 0%, rgba(0,229,255,0.12) 0%, transparent 60%)", pointerEvents:"none" }} />
          <div style={{ fontSize:52, marginBottom:10 }}>📷</div>
          <div style={{ fontSize:20, fontWeight:500, color:"#fff" }}>Launch AR Camera</div>
          <div style={{ fontSize:13, color:"rgba(0,229,255,0.7)", marginTop:6 }}>Real-time text detection + translation</div>
          <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:14, flexWrap:"wrap" }}>
            {["WebRTC Camera","Tesseract OCR","Live Translate"].map(tag => (
              <span key={tag} style={{ background:"rgba(0,229,255,0.1)", border:"1px solid rgba(0,229,255,0.2)", borderRadius:20, padding:"3px 10px", fontSize:10, color:"rgba(0,229,255,0.8)", letterSpacing:0.5 }}>{tag}</span>
            ))}
          </div>
        </button>
      </div>

      {/* Feature grid */}
      <div style={{ padding:"14px 20px 0", display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {[
          { icon:"💬", label:"Text Translate", sub:"AI-powered by Claude", color:"#6ee7ff", screen:"translate" },
          { icon:"📚", label:"Phrasebook",     sub:"Auto-translated phrases", color:"#fd9644", screen:"phrasebook" },
          { icon:"🎮", label:"Daily Challenge", sub:"Earn XP, build streaks", color:"#00e676", screen:"challenge" },
          { icon:"🔊", label:"Pronunciation",  sub:"Text-to-speech",          color:"#b2a8ff", screen:"translate" },
        ].map(f => (
          <button key={f.label} onClick={() => setScreen(f.screen)}
            style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"16px 14px", color:"#fff", cursor:"pointer", textAlign:"left", fontFamily:"inherit", transition:"all 0.2s" }}>
            <div style={{ fontSize:28, marginBottom:10 }}>{f.icon}</div>
            <div style={{ fontSize:13, fontWeight:500 }}>{f.label}</div>
            <div style={{ fontSize:11, color:f.color, marginTop:3 }}>{f.sub}</div>
          </button>
        ))}
      </div>

      {/* How it works */}
      <div style={{ margin:"18px 20px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:14, padding:"14px 16px" }}>
        <div style={{ fontSize:10, color:"#333", letterSpacing:2, marginBottom:12 }}>HOW AR TRANSLATION WORKS</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            ["📷","Camera captures video frame via WebRTC"],
            ["🔍","Tesseract OCR reads text from image in real-time"],
            ["🌐","MyMemory API translates detected text instantly"],
            ["✨","Translated labels overlay on the live camera view"],
          ].map(([icon, text]) => (
            <div key={text} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{icon}</span>
              <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)", lineHeight:1.6 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Language Picker Modal */}
      {showLangPicker && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:100, display:"flex", alignItems:"flex-end" }} onClick={() => setShowLangPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width:"100%", background:"#111118", borderRadius:"22px 22px 0 0", padding:"20px 20px 36px", maxHeight:"72vh", overflow:"auto" }}>
            <div style={{ fontWeight:500, fontSize:16, marginBottom:4 }}>Select Language</div>
            <div style={{ fontSize:11, color:"#444", marginBottom:16 }}>All languages support offline fallback</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {LANGUAGES.map(l => (
                <button key={l.code} onClick={() => { setTargetLang(l.code); setShowLangPicker(false); }}
                  style={{ background: targetLang===l.code ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.04)", border:`1px solid ${targetLang===l.code?"rgba(0,229,255,0.5)":"rgba(255,255,255,0.08)"}`, borderRadius:12, padding:"12px 14px", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:10, fontFamily:"inherit", textAlign:"left" }}>
                  <span style={{ fontSize:22 }}>{l.flag}</span>
                  <span style={{ fontSize:13 }}>{l.name}</span>
                  {targetLang===l.code && <span style={{ marginLeft:"auto", color:"#00e5ff", fontSize:16 }}>✓</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setShowLangPicker(false)} style={{ width:"100%", marginTop:16, background:"rgba(255,255,255,0.05)", border:"none", borderRadius:12, padding:12, color:"#666", cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}