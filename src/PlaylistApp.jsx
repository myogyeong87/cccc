import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import {
  collection, doc, addDoc, deleteDoc, updateDoc, setDoc, onSnapshot, query, orderBy
} from "firebase/firestore";

const C = {
  bg:      "#F0F4E8",
  bg2:     "#E8EDDC",
  bg3:     "#DDE5CE",
  white:   "#FFFFFF",
  text:    "#252B1E",
  sub:     "#6B8050",
  border:  "#C4D9A8",
  accent:  "#5C7A3E",
  accentBg:"#E0EAD0",
};

const TAG_COLORS = [
  "#C4622A", "#5C7A3E", "#B5756A", "#4A8A7A",
  "#9B6B3E", "#7A5C8A", "#3E7A6B", "#8A7A3E",
];

function tagColor(tag, allMoods) {
  const idx = allMoods.indexOf(tag);
  return TAG_COLORS[idx >= 0 ? idx % TAG_COLORS.length : 0];
}
function tagStyle(tag, allMoods) {
  const c = tagColor(tag, allMoods);
  return { borderRadius:12, padding:"3px 11px", fontSize:12, fontWeight:700,
    whiteSpace:"nowrap", flexShrink:0, background:c+"18", color:c, border:`1.5px solid ${c}33` };
}

const DEFAULT_MOODS = ["청량","응원","감성","설렘","신나는","밤","여름","힐링"];

function extractYoutubeId(url) {
  const ps = [/youtube\.com\/watch\?v=([^&]+)/,/youtu\.be\/([^?]+)/,/youtube\.com\/embed\/([^?]+)/];
  for (const p of ps) { const m=url.match(p); if(m) return m[1]; }
  return null;
}
function getMonthLabel(ms) {
  const [y,m]=ms.split("-"); return `${y}년 ${parseInt(m)}월`;
}

export default function PlaylistApp() {
  const [songs, setSongs] = useState([]);
  const [monthThemes, setMonthThemes] = useState({});
  const [moods, setMoods] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [playlistMode, setPlaylistMode] = useState(false);
  const [playlistIdx, setPlaylistIdx] = useState(0);
  const [playlistType, setPlaylistType] = useState("month"); // "month"|"all"|"tag"
  const [tagPlayMood, setTagPlayMood] = useState(null);
  const [showTagPlay, setShowTagPlay] = useState(false);

  const [showAddSong, setShowAddSong] = useState(false);
  const [editSong, setEditSong] = useState(null);
  const [showThemeMgr, setShowThemeMgr] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [notif, setNotif] = useState(null);
  const [csvText, setCsvText] = useState("");

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;

  const [showArchiveDrop, setShowArchiveDrop] = useState(false);
  const [editingTheme, setEditingTheme] = useState(null);
  const [editingThemeVal, setEditingThemeVal] = useState("");
  const [form, setForm] = useState({title:"",artist:"",youtubeUrl:"",mood:[],recommender:"",comment:"",date:new Date().toISOString().slice(0,10)});
  const [previewId, setPreviewId] = useState(null);
  const [inlineTag, setInlineTag] = useState("");
  const [themeForm, setThemeForm] = useState({month:"",theme:""});
  const [newTagInput, setNewTagInput] = useState("");

  // 닉네임
  const [nickname, setNickname] = useState(() => localStorage.getItem("cccc_nickname") || "");
  const [showNicknameSetup, setShowNicknameSetup] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [settingsNicknameInput, setSettingsNicknameInput] = useState("");

  // 설정 편집 모드
  const [themeEditMode, setThemeEditMode] = useState(false);
  const [tagEditMode, setTagEditMode] = useState(false);

  const currentMonth = new Date().toISOString().slice(0,7);
  const activeMonth = selectedMonth || currentMonth;
  const months = [...new Set(songs.map(s=>s.month))].sort().reverse();
  const thisMonthSongs = songs.filter(s=>s.month===activeMonth);

  const playlistSongs = thisMonthSongs.filter(s=>s.youtubeId&&s.youtubeId.length>5);
  const allPlaylistSongs = songs.filter(s=>s.youtubeId&&s.youtubeId.length>5);
  const tagPlaylistSongs = tagPlayMood
    ? songs.filter(s=>s.youtubeId&&s.youtubeId.length>5&&s.mood.includes(tagPlayMood))
    : [];
  const activeSongs = playlistType==="all" ? allPlaylistSongs
    : playlistType==="tag" ? tagPlaylistSongs
    : playlistSongs;

  // 태그별 전체 곡 수
  const tagCounts = {};
  moods.forEach(m => { tagCounts[m] = songs.filter(s=>s.mood.includes(m)).length; });

  useEffect(() => {
    if (!localStorage.getItem("cccc_nickname")) setShowNicknameSetup(true);
  }, []);

  useEffect(() => {
    if (window.__pwaPrompt) {
      setDeferredPrompt(window.__pwaPrompt);
      setShowInstallBtn(true);
      window.__pwaPrompt = null;
    }
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowInstallBtn(true); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setShowInstallBtn(false));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") setShowInstallBtn(false);
  }

  useEffect(() => {
    const unsubSongs = onSnapshot(collection(db, "songs"), snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => b.date.localeCompare(a.date));
      setSongs(data);
    });
    const unsubThemes = onSnapshot(doc(db, "config", "monthThemes"), snapshot => {
      setMonthThemes(snapshot.exists() ? snapshot.data() : {});
    });
    const unsubMoods = onSnapshot(doc(db, "config", "moods"), snapshot => {
      if (snapshot.exists()) {
        setMoods(snapshot.data().list || DEFAULT_MOODS);
      } else {
        setDoc(doc(db, "config", "moods"), { list: DEFAULT_MOODS });
      }
    });
    return () => { unsubSongs(); unsubThemes(); unsubMoods(); };
  }, []);

  useEffect(()=>{ setPreviewId(form.youtubeUrl?extractYoutubeId(form.youtubeUrl):null); },[form.youtubeUrl]);

  function toast(msg){ setNotif(msg); setTimeout(()=>setNotif(null),2500); }

  function saveNickname(val) {
    const trimmed = val.trim();
    if (!trimmed) return;
    localStorage.setItem("cccc_nickname", trimmed);
    setNickname(trimmed);
  }

  function handleNicknameSetup() {
    if (!nicknameInput.trim()) { toast("닉네임을 입력해주세요!"); return; }
    saveNickname(nicknameInput);
    setShowNicknameSetup(false);
    toast(`👋 환영해요, ${nicknameInput.trim()}님!`);
  }

  function openAddSong() {
    const stored = localStorage.getItem("cccc_nickname") || "";
    setForm({title:"",artist:"",youtubeUrl:"",mood:[],recommender:stored,comment:"",date:new Date().toISOString().slice(0,10)});
    setInlineTag("");
    setShowAddSong(true);
  }

  async function handleAddSong() {
    if(!form.title||!form.artist||!form.recommender){ toast("제목, 가수, 추천인은 필수예요!"); return; }
    const youtubeId=extractYoutubeId(form.youtubeUrl)||"";
    const date=form.date||new Date().toISOString().slice(0,10);
    await addDoc(collection(db,"songs"),{title:form.title,artist:form.artist,youtubeId,mood:form.mood,recommender:form.recommender,comment:form.comment,date,month:date.slice(0,7)});
    setForm({title:"",artist:"",youtubeUrl:"",mood:[],recommender:"",comment:"",date:new Date().toISOString().slice(0,10)});
    setInlineTag(""); setShowAddSong(false); toast("🎵 곡이 추가됐어요!");
  }

  function toggleFormMood(m){ setForm(f=>({...f,mood:f.mood.includes(m)?f.mood.filter(x=>x!==m):[...f.mood,m]})); }

  async function addInlineTag(){
    const tag=inlineTag.trim(); if(!tag) return;
    if(!moods.includes(tag)){
      const next=[...moods,tag];
      await setDoc(doc(db,"config","moods"),{list:next});
    }
    if(!form.mood.includes(tag)) setForm(f=>({...f,mood:[...f.mood,tag]}));
    setInlineTag("");
  }

  function startPlaylist(){
    if(playlistSongs.length===0){ toast("재생할 곡이 없어요!"); return; }
    setPlaylistType("month"); setPlaylistMode(true); setPlaylistIdx(0); setShowTagPlay(false);
  }
  function startPlaylistAll(){
    if(allPlaylistSongs.length===0){ toast("재생할 곡이 없어요!"); return; }
    setPlaylistType("all"); setPlaylistMode(true); setPlaylistIdx(0); setShowTagPlay(false);
  }
  function startTagPlaylist(tag){
    const tagged = songs.filter(s=>s.youtubeId&&s.youtubeId.length>5&&s.mood.includes(tag));
    if(tagged.length===0){ toast("재생할 곡이 없어요!"); return; }
    setTagPlayMood(tag);
    setPlaylistType("tag"); setPlaylistMode(true); setPlaylistIdx(0); setShowTagPlay(false);
  }

  function nextTrack(){ if(playlistIdx<activeSongs.length-1) setPlaylistIdx(i=>i+1); else { setPlaylistMode(false); toast("🎵 플레이리스트 재생 완료!"); } }
  function prevTrack(){ if(playlistIdx>0) setPlaylistIdx(i=>i-1); }
  function stopPlaylist(){ setPlaylistMode(false); setPlaylistType("month"); }

  function exportCSV(){
    const header="제목,가수,유튜브ID,무드,추천인,코멘트,날짜,연월";
    const rows=thisMonthSongs.map(s=>[
      `"${s.title}"`,`"${s.artist}"`,s.youtubeId,
      `"${s.mood.join("|")}"`,`"${s.recommender}"`,`"${s.comment}"`,s.date,s.month
    ].join(","));
    return [header,...rows].join("\n");
  }
  function exportText(){
    return `${getMonthLabel(activeMonth)} ${monthThemes[activeMonth]||"플레이리스트"}\n`
      +"─".repeat(30)+"\n"
      +thisMonthSongs.map((s,i)=>`${String(i+1).padStart(2,"0")}. ${s.title} - ${s.artist}\n    추천: ${s.recommender} | ${s.mood.join(" ")}\n    ${s.youtubeId?"https://youtu.be/"+s.youtubeId:""}`).join("\n\n");
  }
  function exportLinks(){
    return thisMonthSongs.filter(s=>s.youtubeId).map((s,i)=>`${i+1}. ${s.title} - ${s.artist}\nhttps://youtu.be/${s.youtubeId}`).join("\n\n");
  }
  function copyToClipboard(text){ navigator.clipboard.writeText(text).then(()=>toast("📋 클립보드에 복사됐어요!")); }
  function downloadCSV(){
    const csv=exportCSV();
    const blob=new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url;
    a.download=`춘천춘천_${activeMonth}.csv`; a.click();
    URL.revokeObjectURL(url); toast("⬇️ CSV 다운로드 완료!");
  }

  function parseNotionCSVLine(line) {
    const cols = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim().replace(/^"|"$/g,"")); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur.trim().replace(/^"|"$/g,""));
    return cols;
  }
  function parseNotionDate(raw) {
    const m = raw.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (m) {
      const y=m[1], mo=String(m[2]).padStart(2,"0"), d=String(m[3]).padStart(2,"0");
      return `${y}-${mo}-${d}`;
    }
    const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (iso) return iso[0];
    return new Date().toISOString().slice(0,10);
  }
  async function handleImportCSV() {
    console.log("버튼 클릭됨");
    console.log("1. csvText:", csvText.slice(0,100));
    if (!csvText.trim()) { toast("CSV 내용을 붙여넣어 주세요!"); return; }
    const cleaned = csvText.replace(/^﻿/,"").trim();
    const lines = cleaned.split(/\r?\n/);
    console.log("2. lines:", lines.length, "/ header:", lines[0]?.slice(0,80));
    const header = parseNotionCSVLine(lines[0]);
    console.log("3. header 파싱 결과:", header);
    const fi = (keywords) => header.findIndex(h => keywords.some(k => h.includes(k)));
    const titleIdx   = fi(["제목","title","노래"]);
    const artistIdx  = fi(["가수","artist"]);
    const dateIdx    = fi(["날짜","date"]);
    const moodIdx    = fi(["무드","mood","태그","상황"]);
    const recIdx     = fi(["추천한","추천","recommender"]);
    const commentIdx = fi(["한 줄","코멘트","comment"]);
    const ytIdx      = fi(["youtube","유튜브","링크","url"]);
    console.log("4. 열 인덱스:", { titleIdx, artistIdx, dateIdx, moodIdx, recIdx, commentIdx, ytIdx });
    if (titleIdx === -1) { toast("'제목' 열을 찾지 못했어요!"); return; }
    const DUMMY_KEYWORDS = ["여기부터 입력","입력해주세요","테스트","test"];
    const newMoods = new Set();
    const imported = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = parseNotionCSVLine(lines[i]);
      const title = cols[titleIdx] || "";
      if (!title) continue;
      if (DUMMY_KEYWORDS.some(k => title.includes(k))) continue;
      const rawDate = dateIdx >= 0 ? cols[dateIdx] || "" : "";
      const date    = parseNotionDate(rawDate);
      const month   = date.slice(0, 7);
      const moodRaw = moodIdx >= 0 ? cols[moodIdx] || "" : "";
      const mood    = moodRaw ? moodRaw.split(/[,|]/).map(m=>m.trim()).filter(Boolean) : [];
      mood.forEach(m => newMoods.add(m));
      const rawUrl   = ytIdx >= 0 ? cols[ytIdx] || "" : "";
      const youtubeId = extractYoutubeId(rawUrl) || "";
      imported.push({
        id: "imp_" + Date.now() + "_" + i,
        title,
        artist:      artistIdx  >= 0 ? cols[artistIdx]  || "" : "",
        youtubeId,
        mood,
        recommender: recIdx     >= 0 ? cols[recIdx]     || "" : "",
        comment:     commentIdx >= 0 ? cols[commentIdx] || "" : "",
        date, month,
      });
    }
    console.log("5. imported:", imported.length, "곡 / 첫 번째:", imported[0]);
    if (imported.length === 0) { toast("가져올 수 있는 데이터가 없어요 😢"); return; }
    try {
      if (newMoods.size > 0) {
        const next = [...moods];
        newMoods.forEach(m => { if (!next.includes(m)) next.push(m); });
        console.log("6. 새 태그 저장 시도:", [...newMoods]);
        await setDoc(doc(db,"config","moods"),{list:next});
        console.log("6. 새 태그 저장 완료");
      }
      const themeMap = {};
      imported.forEach(s => {
        s.mood.forEach(tag => {
          const tm = tag.match(/^(\d{1,2})월의 테마$/);
          if (tm) {
            const mo = String(tm[1]).padStart(2,"0");
            const key = s.month.slice(0,4) + "-" + mo;
            themeMap[key] = tag;
          }
        });
      });
      if (Object.keys(themeMap).length > 0) {
        console.log("7. 월별 테마 저장 시도:", themeMap);
        await setDoc(doc(db,"config","monthThemes"),{...monthThemes,...themeMap});
        console.log("7. 월별 테마 저장 완료");
      }
      console.log("8. Firestore addDoc 시작...");
      await Promise.all(imported.map(({id, ...songData}) => addDoc(collection(db,"songs"), songData)));
      console.log("9. Firestore 저장 완료!");
      setCsvText(""); setShowImport(false);
      toast(`✅ ${imported.length}곡 가져오기 완료!`);
    } catch(e) {
      console.error("❌ Firestore 오류:", e.code, e.message);
      toast(`❌ 저장 실패 (${e.code}): ${e.message}`);
    }
  }

  async function saveEditTheme(m) {
    if (!editingThemeVal.trim()) return;
    await setDoc(doc(db,"config","monthThemes"),{...monthThemes,[m]:editingThemeVal.trim()});
    setEditingTheme(null); toast("✅ 테마 수정됨!");
  }
  async function saveTheme() {
    if (!themeForm.month || !themeForm.theme) { toast("연월과 테마명을 입력해주세요!"); return; }
    const next={...monthThemes,[themeForm.month]:themeForm.theme};
    await setDoc(doc(db,"config","monthThemes"),next);
    toast(`✅ ${getMonthLabel(themeForm.month)} 테마 저장됨!`);
    setThemeForm({month:"",theme:""});
  }
  async function addGlobalTag(){
    const tag=newTagInput.trim(); if(!tag) return;
    if(moods.includes(tag)){ toast("이미 있는 태그예요!"); return; }
    const next=[...moods,tag];
    await setDoc(doc(db,"config","moods"),{list:next});
    setNewTagInput(""); toast(`✅ "${tag}" 태그 추가됨!`);
  }
  async function handleDelete(id){
    if(!window.confirm("이 곡을 삭제할까요?")) return;
    await deleteDoc(doc(db,"songs",id));
    setExpandedId(null);
    toast("🗑️ 삭제됐어요!");
  }
  function openEdit(song){
    setEditSong({...song, youtubeUrl: song.youtubeId ? `https://youtu.be/${song.youtubeId}` : ""});
  }
  async function handleEditSave(){
    if(!editSong.title||!editSong.artist||!editSong.recommender){ toast("제목, 가수, 추천인은 필수예요!"); return; }
    const youtubeId = extractYoutubeId(editSong.youtubeUrl)||editSong.youtubeId||"";
    const {id, youtubeUrl, ...rest} = editSong;
    const month = (rest.date||"").slice(0,7)||rest.month;
    await updateDoc(doc(db,"songs",id),{...rest,youtubeId,month});
    setEditSong(null);
    toast("✅ 수정됐어요!");
  }
  function toggleEditMood(m){
    setEditSong(f=>({...f, mood: f.mood.includes(m)?f.mood.filter(x=>x!==m):[...f.mood,m]}));
  }

  return (
    <div style={s.root}>

      {/* 닉네임 초기 설정 */}
      {showNicknameSetup && (
        <Modal onClose={()=>setShowNicknameSetup(false)}>
          <h2 style={s.modalTitle}>👋 환영해요!</h2>
          <p style={{fontSize:14,color:C.sub,marginBottom:4}}>춘천춘천 플레이리스트에 오신 걸 환영해요.</p>
          <p style={{fontSize:13,color:C.sub,marginBottom:16}}>곡 추가할 때 쓸 닉네임을 입력해주세요.<br/>지금 건너뛰고 나중에 설정에서 바꿔도 돼요.</p>
          <FL>닉네임</FL>
          <input style={s.input} placeholder="예: 춘천이"
            value={nicknameInput} onChange={e=>setNicknameInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleNicknameSetup()} autoFocus/>
          <div style={s.modalBtns}>
            <button style={s.cancelBtn} onClick={()=>setShowNicknameSetup(false)}>나중에</button>
            <button style={s.submitBtn} onClick={handleNicknameSetup}>시작하기 🎵</button>
          </div>
        </Modal>
      )}

      {/* 헤더 */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <button style={s.logoBtn} onClick={()=>setSelectedMonth(null)}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 8v8M12 6v12M15 9v6M6 10v4M18 10v4" stroke="#5C7A3E" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <div style={s.logoTitle}>춘천춘천</div>
              <div style={s.logoSub}>플레이리스트</div>
            </div>
          </button>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {!isStandalone && showInstallBtn && (
              <button style={s.installBtn} onClick={handleInstall}>📲 설치</button>
            )}
            {!isStandalone && isIOS && (
              <button style={s.installBtn} onClick={()=>setShowIosGuide(true)}>📲 설치</button>
            )}
            <button style={s.mgmtBtn} onClick={()=>setShowThemeMgr(true)}>⚙️ 설정</button>
            <button style={s.addBtn} onClick={openAddSong}>+ 곡 추가</button>
          </div>
        </div>
      </header>

      <main style={s.main}>

        {/* 히어로 배너 (곡 수 배지 제거) */}
        <div style={s.hero}>
          <div style={s.heroLeft}>
            <span style={s.heroMonth}>{getMonthLabel(activeMonth)}</span>
            <h1 style={s.heroTitle}>{monthThemes[activeMonth]||"이달의 플레이리스트"}</h1>
            {selectedMonth&&(
              <button style={s.backBtn} onClick={()=>setSelectedMonth(null)}>← 이번 달로</button>
            )}
          </div>
        </div>

        {/* 재생 바 */}
        <div style={s.playbar}>
          <div style={{fontSize:11,color:C.sub,fontWeight:600,marginBottom:8,letterSpacing:0.3}}>🎶 연속재생</div>
          <div style={{display:"flex",gap:6,width:"100%"}}>
            <button
              style={{...s.playbarBtn,...(playlistMode&&playlistType==="month"?s.playbarBtnActive:{})}}
              onClick={startPlaylist}>
              <span>▶ 이번 달</span>
              <span style={s.playbarCount}>{playlistSongs.length}곡</span>
            </button>
            <button
              style={{...s.playbarBtn,...(playlistMode&&playlistType==="all"?s.playbarBtnActive:{})}}
              onClick={startPlaylistAll}>
              <span>▶ 전체</span>
              <span style={s.playbarCount}>{allPlaylistSongs.length}곡</span>
            </button>
            <button
              style={{...s.playbarBtn,...(showTagPlay||playlistType==="tag"?s.playbarBtnActive:{})}}
              onClick={()=>setShowTagPlay(v=>!v)}>
              <span>🏷️ 태그</span>
              <span style={s.playbarCount}>선택</span>
            </button>
          </div>
          {showTagPlay && (
            <div style={{width:"100%",marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {moods.filter(m=>tagCounts[m]>0).map(m=>(
                  <button key={m}
                    style={{...tagStyle(m,moods), cursor:"pointer", padding:"6px 13px", fontSize:13,
                      outline: playlistMode&&playlistType==="tag"&&tagPlayMood===m?`2px solid ${tagColor(m,moods)}`:"none",
                      outlineOffset:2}}
                    onClick={()=>startTagPlaylist(m)}>
                    {m} <span style={{fontWeight:500,opacity:0.75}}>{tagCounts[m]}</span>
                  </button>
                ))}
              </div>
              <button style={{...s.cancelBtn,marginTop:10,padding:"6px 14px",fontSize:12,width:"auto",display:"inline-block"}}
                onClick={()=>setShowTagPlay(false)}>접기</button>
            </div>
          )}
        </div>

        {/* 연속재생 플레이어 */}
        {playlistMode && activeSongs.length>0 && (
          <div style={s.playerCard}>
            <div style={s.playerHeader}>
              <div>
                <div style={s.playerTitle}>{activeSongs[playlistIdx].title}</div>
                <div style={s.playerArtist}>{activeSongs[playlistIdx].artist} · {activeSongs[playlistIdx].recommender}
                  {playlistType==="all"&&<span style={{marginLeft:6,fontSize:11,color:C.accent,fontWeight:700}}>전체재생</span>}
                  {playlistType==="tag"&&<span style={{marginLeft:6,fontSize:11,color:C.accent,fontWeight:700}}>#{tagPlayMood}</span>}
                </div>
              </div>
              <button style={s.playerClose} onClick={stopPlaylist}>✕</button>
            </div>
            <div style={s.playerWrap}>
              <iframe
                key={activeSongs[playlistIdx].youtubeId}
                src={`https://www.youtube.com/embed/${activeSongs[playlistIdx].youtubeId}?autoplay=1`}
                style={s.iframe} allow="autoplay; encrypted-media" allowFullScreen
                title={activeSongs[playlistIdx].title}/>
            </div>
            <div style={s.playerControls}>
              <button style={s.playerNavBtn} onClick={prevTrack} disabled={playlistIdx===0}>⏮ 이전</button>
              <span style={s.playerCounter}>{playlistIdx+1} / {activeSongs.length}</span>
              <button style={s.playerNavBtn} onClick={nextTrack}>
                {playlistIdx===activeSongs.length-1?"⏹ 종료":"다음 ⏭"}
              </button>
            </div>
          </div>
        )}

        {/* 곡 목록 (무드 필터 제거 — 전월 포함 thisMonthSongs 표시) */}
        <div style={s.list}>
          {thisMonthSongs.length===0&&(
            <div style={s.empty}><div style={{fontSize:40}}>🎶</div><div style={{marginTop:10}}>아직 곡이 없어요</div></div>
          )}
          {thisMonthSongs.map((song,i)=>(
            <SongRow key={song.id} song={song} index={i+1} moods={moods}
              expanded={expandedId===song.id} playing={playingId===song.id}
              onToggle={()=>{setExpandedId(expandedId===song.id?null:song.id); if(playingId===song.id)setPlayingId(null);}}
              onPlay={()=>setPlayingId(playingId===song.id?null:song.id)}
              onEdit={openEdit} onDelete={handleDelete}/>
          ))}
        </div>

        {/* 아카이브 드롭다운 */}
        {months.filter(m=>m!==currentMonth).length>0&&(
          <section style={s.archive}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <h2 style={{...s.sectionTitle,marginBottom:0}}>📦 지난 플레이리스트</h2>
              <button style={s.archiveDropBtn} onClick={()=>setShowArchiveDrop(v=>!v)}>
                {selectedMonth?getMonthLabel(selectedMonth):"월 선택"} {showArchiveDrop?"▲":"▼"}
              </button>
            </div>
            {showArchiveDrop&&(
              <div style={s.archiveDropList}>
                {months.filter(m=>m!==currentMonth).map(m=>{
                  const cnt=songs.filter(s=>s.month===m).length;
                  const active=selectedMonth===m;
                  return (
                    <button key={m} style={{...s.archiveDropItem,...(active?s.archiveDropItemActive:{})}}
                      onClick={()=>{setSelectedMonth(active?null:m);setShowArchiveDrop(false);window.scrollTo({top:0,behavior:"smooth"});}}>
                      <span style={{fontWeight:700,fontSize:14,color:active?"#fff":C.text}}>{getMonthLabel(m)}</span>
                      {monthThemes[m]&&<span style={{fontSize:12,color:active?C.accentBg:C.accent}}>{monthThemes[m]}</span>}
                      <span style={{fontSize:12,color:active?"rgba(255,255,255,0.7)":C.sub,marginLeft:"auto"}}>{cnt}곡</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* 곡 추가 모달 */}
      {showAddSong&&(
        <Modal onClose={()=>setShowAddSong(false)}>
          <h2 style={s.modalTitle}>🎵 새 곡 추가</h2>
          <FL>유튜브 링크</FL>
          <input style={s.input} placeholder="https://youtube.com/watch?v=..."
            value={form.youtubeUrl} onChange={e=>setForm(f=>({...f,youtubeUrl:e.target.value}))}/>
          {previewId&&(
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8}}>
              <img src={`https://img.youtube.com/vi/${previewId}/mqdefault.jpg`}
                style={{width:80,height:45,objectFit:"cover",borderRadius:6}} alt="preview"/>
              <span style={{fontSize:13,color:"#4CAF50",fontWeight:700}}>✅ 썸네일 확인됨</span>
            </div>
          )}
          <FL>곡 제목 *</FL>
          <input style={s.input} placeholder="곡 제목" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/>
          <FL>가수 *</FL>
          <input style={s.input} placeholder="아티스트명" value={form.artist} onChange={e=>setForm(f=>({...f,artist:e.target.value}))}/>
          <FL>추천인 *</FL>
          <input style={s.input} placeholder="내 닉네임" value={form.recommender} onChange={e=>setForm(f=>({...f,recommender:e.target.value}))}/>
          <FL>날짜</FL>
          <input style={s.input} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
          <FL>무드 태그</FL>
          <div style={s.chipRow}>
            {moods.map(m=>(
              <button key={m} style={{...s.chip,...(form.mood.includes(m)?s.chipActive:{})}}
                onClick={()=>toggleFormMood(m)}>
                <span style={{...s.chipDot,background:tagColor(m,moods)}}/>{m}
              </button>
            ))}
          </div>
          <div style={s.inlineTagRow}>
            <input style={{...s.input,flex:1,fontSize:13}} placeholder="새 태그 직접 입력 후 Enter"
              value={inlineTag} onChange={e=>setInlineTag(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addInlineTag()}/>
            <button style={s.inlineTagBtn} onClick={addInlineTag}>+ 추가</button>
          </div>
          {form.mood.length>0&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8,alignItems:"center"}}>
              <span style={{fontSize:12,color:C.sub}}>선택됨:</span>
              {form.mood.map(m=><span key={m} style={tagStyle(m,moods)}>{m}</span>)}
            </div>
          )}
          <FL>한 줄 코멘트</FL>
          <textarea style={s.textarea} placeholder="이 곡을 추천하는 이유!"
            value={form.comment} onChange={e=>setForm(f=>({...f,comment:e.target.value}))}/>
          <div style={s.modalBtns}>
            <button style={s.cancelBtn} onClick={()=>setShowAddSong(false)}>취소</button>
            <button style={s.submitBtn} onClick={handleAddSong}>추가하기 🎵</button>
          </div>
        </Modal>
      )}

      {/* 내보내기 모달 */}
      {showExport&&(
        <Modal onClose={()=>setShowExport(false)}>
          <h2 style={{...s.modalTitle,color:C.accent}}>⬆ 내보내기</h2>
          <p style={{fontSize:13,color:C.sub,marginBottom:16}}>{getMonthLabel(activeMonth)} · {thisMonthSongs.length}곡</p>
          <div style={s.exportGrid}>
            <ExportCard icon="📊" title="CSV 다운로드" desc="엑셀·노션에 바로 붙여넣기" color={C.accent} onClick={downloadCSV}/>
            <ExportCard icon="📋" title="텍스트 복사" desc="단톡방·메모 공유용" color={C.sub} onClick={()=>copyToClipboard(exportText())}/>
            <ExportCard icon="🔗" title="링크 목록 복사" desc="유튜브 링크만 모아서" color={C.text} onClick={()=>copyToClipboard(exportLinks())}/>
          </div>
          <div style={{marginTop:16,background:C.accentBg,borderRadius:12,padding:14}}>
            <div style={{fontSize:12,color:C.accent,fontWeight:700,marginBottom:8}}>미리보기</div>
            <pre style={{fontSize:11,color:C.sub,overflow:"auto",maxHeight:120,margin:0,whiteSpace:"pre-wrap"}}>
              {exportText().slice(0,300)}{exportText().length>300?"...":""}
            </pre>
          </div>
          <button style={{...s.cancelBtn,marginTop:14,width:"100%"}} onClick={()=>setShowExport(false)}>닫기</button>
        </Modal>
      )}

      {/* 가져오기 모달 */}
      {showImport&&(
        <Modal onClose={()=>setShowImport(false)}>
          <h2 style={{...s.modalTitle,color:C.accent}}>⬇ 노션 CSV 가져오기</h2>
          <div style={s.importGuide}>
            <p style={{fontWeight:700,fontSize:14,marginBottom:8}}>📌 노션에서 내보내는 방법</p>
            <ol style={{fontSize:13,color:C.sub,lineHeight:2,paddingLeft:18,margin:0}}>
              <li>노션 플레이리스트 DB 열기</li>
              <li>우측 상단 <b>···</b> → <b>내보내기</b></li>
              <li>형식: <b>CSV</b> 선택 후 다운로드</li>
              <li>파일 열어서 전체 복사 (Ctrl+A → Ctrl+C)</li>
              <li>아래에 붙여넣기</li>
            </ol>
          </div>
          <FL>CSV 내용 붙여넣기</FL>
          <textarea style={{...s.textarea,minHeight:140,fontFamily:"monospace",fontSize:12}}
            placeholder={"제목,가수,유튜브 링크,무드,추천한 사람,한 줄 코멘트,날짜\nSELFISH,..."}
            value={csvText} onChange={e=>setCsvText(e.target.value)}/>
          <div style={{fontSize:12,color:C.sub,marginTop:8,lineHeight:1.6}}>
            💡 열 이름에 <b>제목/title, 가수/artist, 링크/url</b> 등이 포함되면 자동 인식해요.
          </div>
          <div style={s.modalBtns}>
            <button style={s.cancelBtn} onClick={()=>setShowImport(false)}>취소</button>
            <button style={{...s.submitBtn,background:C.sub}} onClick={handleImportCSV}>가져오기 ✅</button>
          </div>
        </Modal>
      )}

      {/* 설정 모달 */}
      {showThemeMgr&&(
        <Modal onClose={()=>setShowThemeMgr(false)}>
          <h2 style={s.modalTitle}>⚙️ 설정</h2>

          {/* 닉네임 변경 */}
          <div style={s.mgmtBox}>
            <h3 style={s.mgmtSub}>👤 내 닉네임</h3>
            <div style={{fontSize:14,color:C.text,marginBottom:10}}>
              현재: <strong style={{color:C.accent}}>{nickname||"미설정"}</strong>
            </div>
            <div style={{display:"flex",gap:8}}>
              <input style={{...s.input,flex:1}} placeholder="새 닉네임"
                value={settingsNicknameInput} onChange={e=>setSettingsNicknameInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&settingsNicknameInput.trim()){saveNickname(settingsNicknameInput);setSettingsNicknameInput("");toast("✅ 닉네임이 변경됐어요!");}}}/>
              <button style={s.submitBtn} onClick={()=>{
                if(!settingsNicknameInput.trim()){toast("닉네임을 입력해주세요!");return;}
                saveNickname(settingsNicknameInput);
                setSettingsNicknameInput("");
                toast("✅ 닉네임이 변경됐어요!");
              }}>변경</button>
            </div>
          </div>

          {/* 월별 테마 */}
          <div style={s.mgmtBox}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <h3 style={{...s.mgmtSub,marginBottom:0}}>📅 월별 테마 설정</h3>
              <button style={themeEditMode?s.editActiveBtn:s.editToggleBtn}
                onClick={()=>setThemeEditMode(v=>!v)}>
                {themeEditMode?"완료":"편집"}
              </button>
            </div>
            {Object.entries(monthThemes).sort().reverse().map(([m,theme])=>(
              <div key={m} style={s.themeRow}>
                <span style={{fontWeight:700,fontSize:14,minWidth:80,color:C.text}}>{getMonthLabel(m)}</span>
                {editingTheme===m ? (
                  <>
                    <input style={{...s.input,flex:1,padding:"4px 8px",fontSize:13}}
                      value={editingThemeVal} autoFocus
                      onChange={e=>setEditingThemeVal(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&saveEditTheme(m)}/>
                    <button style={s.delBtn} onClick={()=>saveEditTheme(m)}>✅</button>
                    <button style={s.delBtn} onClick={()=>setEditingTheme(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{flex:1,fontSize:13,color:C.accent,fontWeight:600}}>{theme}</span>
                    {themeEditMode&&<>
                      <button style={s.delBtn} onClick={()=>{setEditingTheme(m);setEditingThemeVal(theme);}}>✏️</button>
                      <button style={s.delBtn} onClick={async()=>{const n={...monthThemes};delete n[m];await setDoc(doc(db,"config","monthThemes"),n);}}>✕</button>
                    </>}
                  </>
                )}
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
              <input style={{...s.input,flex:1,minWidth:120}} type="month" value={themeForm.month}
                onChange={e=>setThemeForm(f=>({...f,month:e.target.value}))}/>
              <input style={{...s.input,flex:2,minWidth:130}} placeholder="테마명 (예: 여름의 시작)"
                value={themeForm.theme} onChange={e=>setThemeForm(f=>({...f,theme:e.target.value}))}/>
              <button style={s.submitBtn} onClick={saveTheme}>저장</button>
            </div>
          </div>

          {/* 무드 태그 */}
          <div style={s.mgmtBox}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <h3 style={{...s.mgmtSub,marginBottom:0}}>🏷️ 무드 태그 관리</h3>
              <button style={tagEditMode?s.editActiveBtn:s.editToggleBtn}
                onClick={()=>setTagEditMode(v=>!v)}>
                {tagEditMode?"완료":"편집"}
              </button>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
              {moods.map(m=>(
                <div key={m} style={{display:"flex",alignItems:"center",gap:2}}>
                  <span style={tagStyle(m,moods)}>{m}</span>
                  {tagEditMode&&(
                    <button style={s.delBtn} onClick={async()=>{const next=moods.filter(x=>x!==m);await setDoc(doc(db,"config","moods"),{list:next});}}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input style={{...s.input,flex:1}} placeholder="새 태그 이름"
                value={newTagInput} onChange={e=>setNewTagInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addGlobalTag()}/>
              <button style={s.submitBtn} onClick={addGlobalTag}>추가</button>
            </div>
          </div>

          {/* 내보내기/가져오기 */}
          <div style={s.mgmtBox}>
            <h3 style={s.mgmtSub}>📤 내보내기 / 가져오기</h3>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <button style={{...s.blueBtn,flex:1,borderRadius:12,padding:"12px 0",fontSize:14}}
                onClick={()=>{setShowThemeMgr(false);setShowExport(true);}}>⬆ 내보내기</button>
              <button style={{...s.blueBtn,flex:1,borderRadius:12,padding:"12px 0",fontSize:14,background:C.sub}}
                onClick={()=>{setShowThemeMgr(false);setShowImport(true);}}>⬇ 노션 가져오기</button>
            </div>
          </div>
          <button style={{...s.cancelBtn,marginTop:4,width:"100%"}} onClick={()=>setShowThemeMgr(false)}>닫기</button>
        </Modal>
      )}

      {/* 수정 모달 */}
      {editSong&&(
        <Modal onClose={()=>setEditSong(null)}>
          <h2 style={s.modalTitle}>✏️ 곡 수정</h2>
          <FL>유튜브 링크</FL>
          <input style={s.input} placeholder="https://youtube.com/watch?v=..."
            value={editSong.youtubeUrl||""} onChange={e=>setEditSong(f=>({...f,youtubeUrl:e.target.value}))}/>
          {editSong.youtubeUrl&&extractYoutubeId(editSong.youtubeUrl)&&(
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8}}>
              <img src={`https://img.youtube.com/vi/${extractYoutubeId(editSong.youtubeUrl)}/mqdefault.jpg`}
                style={{width:80,height:45,objectFit:"cover",borderRadius:6}} alt="preview"/>
              <span style={{fontSize:13,color:"#4CAF50",fontWeight:700}}>✅ 썸네일 확인됨</span>
            </div>
          )}
          <FL>곡 제목 *</FL>
          <input style={s.input} value={editSong.title}
            onChange={e=>setEditSong(f=>({...f,title:e.target.value}))}/>
          <FL>가수 *</FL>
          <input style={s.input} value={editSong.artist}
            onChange={e=>setEditSong(f=>({...f,artist:e.target.value}))}/>
          <FL>추천인 *</FL>
          <input style={s.input} value={editSong.recommender}
            onChange={e=>setEditSong(f=>({...f,recommender:e.target.value}))}/>
          <FL>날짜</FL>
          <input style={s.input} type="date" value={editSong.date||""}
            onChange={e=>setEditSong(f=>({...f,date:e.target.value}))}/>
          <FL>무드 태그</FL>
          <div style={s.chipRow}>
            {[...new Set([...moods, ...editSong.mood])].map(m=>{
              const isDeleted=!moods.includes(m);
              return (
                <button key={m} style={{...s.chip,...(editSong.mood.includes(m)?s.chipActive:{}), ...(isDeleted?{opacity:0.5,textDecoration:"line-through"}:{})}}
                  onClick={()=>toggleEditMood(m)}>
                  <span style={{...s.chipDot,background:tagColor(m,moods)}}/>{m}
                </button>
              );
            })}
          </div>
          <FL>한 줄 코멘트</FL>
          <textarea style={s.textarea} value={editSong.comment||""}
            onChange={e=>setEditSong(f=>({...f,comment:e.target.value}))}/>
          <div style={s.modalBtns}>
            <button style={s.cancelBtn} onClick={()=>setEditSong(null)}>취소</button>
            <button style={s.submitBtn} onClick={handleEditSave}>저장하기 ✅</button>
          </div>
        </Modal>
      )}

      {/* iOS 설치 가이드 */}
      {showIosGuide&&(
        <Modal onClose={()=>setShowIosGuide(false)}>
          <h2 style={s.modalTitle}>📲 홈 화면에 추가하기</h2>
          <p style={{fontSize:13,color:C.sub,marginBottom:20}}>Safari에서 아래 순서대로 따라하면 앱처럼 사용할 수 있어요!</p>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={s.iosStep}>
              <div style={s.iosNum}>1</div>
              <div>
                <div style={s.iosStepTitle}>하단 공유 버튼 탭</div>
                <div style={s.iosStepDesc}>Safari 하단 가운데 <span style={s.iosIcon}>□↑</span> 버튼을 눌러요</div>
              </div>
            </div>
            <div style={s.iosStep}>
              <div style={s.iosNum}>2</div>
              <div>
                <div style={s.iosStepTitle}>"홈 화면에 추가" 선택</div>
                <div style={s.iosStepDesc}>스크롤해서 <span style={s.iosIcon}>⊕ 홈 화면에 추가</span> 를 찾아 탭해요</div>
              </div>
            </div>
            <div style={s.iosStep}>
              <div style={s.iosNum}>3</div>
              <div>
                <div style={s.iosStepTitle}>"추가" 탭</div>
                <div style={s.iosStepDesc}>오른쪽 위 <span style={s.iosIcon}>추가</span> 를 누르면 완료!</div>
              </div>
            </div>
          </div>
          <div style={{marginTop:20,background:C.accentBg,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.accent,fontWeight:600}}>
            💡 Chrome이 아닌 <b>Safari</b>에서만 홈 화면 추가가 가능해요
          </div>
          <button style={{...s.cancelBtn,marginTop:16,width:"100%"}} onClick={()=>setShowIosGuide(false)}>닫기</button>
        </Modal>
      )}

      {notif&&<div style={s.toast}>{notif}</div>}
    </div>
  );
}

function ExportCard({icon,title,desc,color,onClick}){
  return (
    <button style={{...s.exportCard,borderColor:color+"44"}} onClick={onClick}>
      <span style={{fontSize:24}}>{icon}</span>
      <div>
        <div style={{fontWeight:700,fontSize:14,color}}>{title}</div>
        <div style={{fontSize:12,color:C.sub}}>{desc}</div>
      </div>
    </button>
  );
}

function Modal({children,onClose}){
  const touchStartY = useRef(null);
  function handleTouchStart(e){ touchStartY.current = e.touches[0].clientY; }
  function handleTouchEnd(e){
    if(touchStartY.current===null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if(delta>50) onClose();
    touchStartY.current = null;
  }
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e=>e.stopPropagation()}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div style={s.modalHandle}/>{children}
      </div>
    </div>
  );
}

function FL({children}){
  return <label style={{display:"block",fontSize:13,color:C.sub,marginBottom:5,marginTop:14,fontWeight:700}}>{children}</label>;
}

function SongRow({song,index,moods,expanded,playing,onToggle,onPlay,onEdit,onDelete}){
  const hasThumb=song.youtubeId&&song.youtubeId.length>5;
  const thumbUrl=hasThumb?`https://img.youtube.com/vi/${song.youtubeId}/mqdefault.jpg`:null;
  const ytLink=`https://www.youtube.com/watch?v=${song.youtubeId}`;
  return (
    <div style={s.row}>
      <div style={s.rowMain} onClick={onToggle}>
        <span style={s.rowNum}>{String(index).padStart(2,"0")}</span>
        <div style={s.rowThumb}>
          {thumbUrl?<img src={thumbUrl} alt={song.title} style={s.rowThumbImg}/>
            :<div style={s.rowThumbEmpty}>♪</div>}
        </div>
        <div style={s.rowInfo}>
          <div style={s.rowTitle}>{song.title}</div>
          <div style={s.rowArtist}>{song.artist} · <span style={{color:C.accent,fontWeight:600}}>{song.recommender}</span></div>
        </div>
        {song.mood[0]&&<span style={tagStyle(song.mood[0],moods)}>{song.mood[0]}</span>}
        <span style={s.chevron}>{expanded?"▲":"▼"}</span>
      </div>
      {expanded&&(
        <div style={s.rowDetail}>
          {hasThumb&&(
            <div style={{marginTop:10,marginBottom:10}}>
              {playing?(
                <>
                  <div style={s.playerWrap}>
                    <iframe key={song.youtubeId}
                      src={`https://www.youtube.com/embed/${song.youtubeId}?autoplay=1`}
                      style={s.iframe} allow="autoplay; encrypted-media" allowFullScreen title={song.title}/>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:8}}>
                    <button style={s.stopBtn} onClick={e=>{e.stopPropagation();onPlay();}}>⏹ 닫기</button>
                    <a href={ytLink} target="_blank" rel="noopener noreferrer" style={s.ytBtn}>↗ 유튜브 앱으로</a>
                  </div>
                </>
              ):(
                <>
                  <div style={{position:"relative",borderRadius:10,overflow:"hidden",cursor:"pointer"}}
                    onClick={e=>{e.stopPropagation();onPlay();}}>
                    <img src={thumbUrl} alt={song.title} style={{width:"100%",display:"block",aspectRatio:"16/9",objectFit:"cover"}}/>
                    <div style={s.playOverlay}>
                      <div style={s.playBtn}>▶</div>
                      <span style={s.playLabel}>앱에서 재생</span>
                    </div>
                  </div>
                  <a href={ytLink} target="_blank" rel="noopener noreferrer"
                    style={{...s.ytBtn,display:"block",textAlign:"center",marginTop:8}}>↗ 유튜브 앱으로 열기</a>
                </>
              )}
            </div>
          )}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:12,marginBottom:12}}>
            {song.mood.map(m=><span key={m} style={tagStyle(m,moods)}>{m}</span>)}
          </div>
          {song.comment&&<p style={s.detailComment}>💬 {song.comment}</p>}
          <div style={s.detailFooter}>
            <span>👤 {song.recommender}</span>
            <span>{song.date}</span>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button style={s.editBtn} onClick={e=>{e.stopPropagation();onEdit(song);}}>✏️ 수정</button>
            <button style={s.deleteBtn} onClick={e=>{e.stopPropagation();onDelete(song.id);}}>🗑️ 삭제</button>
          </div>
          <ReactionSection songId={song.id}/>
        </div>
      )}
    </div>
  );
}

const EMOJI_LIST = ['👍','😍','🎵','🔥','ㅠㅠ'];

function ReactionSection({ songId }) {
  const [emojiCounts, setEmojiCounts] = useState({});
  const [myEmojis, setMyEmojis] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`cccc_e_${songId}`) || '[]'); } catch { return []; }
  });
  const [comments, setComments] = useState([]);
  const [nickname, setNickname] = useState(() => localStorage.getItem('cccc_nickname') || '');
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    const unsubReact = onSnapshot(doc(db,'reactions',songId), snap => {
      setEmojiCounts(snap.exists() ? (snap.data().emojis || {}) : {});
    });
    const unsubCmt = onSnapshot(
      query(collection(db,'reactions',songId,'comments'), orderBy('createdAt','desc')),
      snap => setComments(snap.docs.map(d => ({id:d.id,...d.data()})))
    );
    return () => { unsubReact(); unsubCmt(); };
  }, [songId]);

  async function handleEmoji(emoji) {
    const pressed = myEmojis.includes(emoji);
    const next = pressed ? myEmojis.filter(e=>e!==emoji) : [...myEmojis,emoji];
    setMyEmojis(next);
    localStorage.setItem(`cccc_e_${songId}`, JSON.stringify(next));
    await setDoc(doc(db,'reactions',songId),
      { emojis: {...emojiCounts, [emoji]: Math.max(0,(emojiCounts[emoji]||0)+(pressed?-1:1))} },
      { merge: true }
    );
  }

  async function handleComment(e) {
    e.stopPropagation();
    if (!nickname.trim() || !commentText.trim()) return;
    localStorage.setItem('cccc_nickname', nickname.trim());
    await addDoc(collection(db,'reactions',songId,'comments'), {
      nickname: nickname.trim(),
      text: commentText.trim(),
      date: new Date().toISOString().slice(0,10),
      createdAt: Date.now(),
    });
    setCommentText('');
  }

  return (
    <div style={{borderTop:`1px solid ${C.border}`,marginTop:14,paddingTop:14}}>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
        {EMOJI_LIST.map(emoji => {
          const active = myEmojis.includes(emoji);
          const count = emojiCounts[emoji] || 0;
          return (
            <button key={emoji}
              onClick={e=>{e.stopPropagation();handleEmoji(emoji);}}
              style={{background:active?C.accentBg:C.white,border:`1.5px solid ${active?C.accent:C.border}`,
                borderRadius:20,padding:'5px 10px',cursor:'pointer',fontSize:14,
                display:'flex',alignItems:'center',gap:4,
                fontWeight:active?700:500,color:active?C.accent:C.sub}}>
              {emoji}{count>0&&<span style={{fontSize:12}}>{count}</span>}
            </button>
          );
        })}
      </div>
      {comments.length>0&&(
        <div style={{marginBottom:10,display:'flex',flexDirection:'column',gap:6}}>
          {comments.map(c=>(
            <div key={c.id} style={{background:C.bg2,borderRadius:10,padding:'8px 12px',fontSize:13,display:'flex',alignItems:'flex-start',gap:6}}>
              <div style={{flex:1}}>
                <span style={{fontWeight:700,color:C.accent,marginRight:6}}>{c.nickname}</span>
                <span style={{color:C.text}}>{c.text}</span>
                <span style={{marginLeft:8,fontSize:11,color:C.sub}}>{c.date}</span>
              </div>
              <button onClick={async e=>{e.stopPropagation();if(!window.confirm("댓글을 삭제할까요?"))return;await deleteDoc(doc(db,'reactions',songId,'comments',c.id));}}
                style={{background:'none',border:'none',color:C.sub,fontSize:12,cursor:'pointer',padding:'0 2px',flexShrink:0,lineHeight:1}}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{display:'flex',gap:6,alignItems:'center'}} onClick={e=>e.stopPropagation()}>
        <input style={{...s.input,width:70,flexShrink:0,padding:'7px 10px',fontSize:13}}
          placeholder="닉네임" value={nickname} onChange={e=>setNickname(e.target.value)}/>
        <input style={{...s.input,flex:1,padding:'7px 10px',fontSize:13}}
          placeholder="댓글 남기기" value={commentText}
          onChange={e=>setCommentText(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&handleComment(e)}/>
        <button style={{...s.submitBtn,flex:'none',padding:'7px 14px',fontSize:13,whiteSpace:'nowrap'}}
          onClick={handleComment}>등록</button>
      </div>
    </div>
  );
}

const s = {
  root:{ minHeight:"100vh", background:C.bg, colorScheme:"light", fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif", color:C.text },
  header:{ position:"sticky",top:0,zIndex:100,background:"rgba(240,244,232,0.96)",backdropFilter:"blur(14px)",borderBottom:`1px solid ${C.border}` },
  headerInner:{ maxWidth:700,margin:"0 auto",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8 },
  logoBtn:{ background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,padding:0 },
  logoTitle:{ fontSize:18,fontWeight:900,color:C.text,lineHeight:1.1 },
  logoSub:{ fontSize:11,color:C.sub,letterSpacing:1 },
  addBtn:{ background:C.accent,border:"none",borderRadius:22,padding:"8px 16px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer" },
  installBtn:{ background:C.accent,border:"none",borderRadius:22,padding:"8px 16px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer" },
  blueBtn:{ background:C.accent,border:"none",borderRadius:22,padding:"8px 14px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer" },
  mgmtBtn:{ background:C.white,border:`1px solid ${C.border}`,borderRadius:22,padding:"8px 12px",color:C.sub,fontWeight:600,fontSize:13,cursor:"pointer" },
  main:{ maxWidth:700,margin:"0 auto",padding:"0 16px 60px" },
  hero:{ background:C.bg2,border:`1px solid ${C.border}`,borderRadius:16,padding:"24px 20px 20px",margin:"18px 0 0" },
  heroLeft:{ display:"flex",flexDirection:"column",alignItems:"flex-start" },
  heroMonth:{ fontSize:12,color:C.sub,fontWeight:600,letterSpacing:1 },
  heroTitle:{ fontSize:22,fontWeight:900,margin:"4px 0 4px",color:C.text },
  backBtn:{ background:C.bg3,border:`1px solid ${C.border}`,borderRadius:12,padding:"4px 12px",color:C.sub,fontSize:12,cursor:"pointer",fontWeight:700 },
  playbar:{ background:C.bg2,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",margin:"12px 0",display:"flex",flexDirection:"column",gap:0 },
  playbarBtn:{ flex:1,background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 4px",color:C.accent,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2 },
  playbarBtnActive:{ background:C.accent,border:`1px solid ${C.accent}`,color:"#fff" },
  playbarCount:{ fontWeight:500,opacity:0.75,fontSize:11 },
  playerCard:{ background:C.white,border:`1px solid ${C.border}`,borderRadius:16,padding:16,marginBottom:16 },
  playerHeader:{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 },
  playerTitle:{ fontWeight:800,fontSize:15,color:C.text },
  playerArtist:{ fontSize:12,color:C.sub,marginTop:3 },
  playerClose:{ background:"none",border:"none",fontSize:16,color:C.sub,cursor:"pointer",padding:"0 4px" },
  playerWrap:{ width:"100%",aspectRatio:"16/9",borderRadius:10,overflow:"hidden",background:"#000" },
  iframe:{ width:"100%",height:"100%",border:"none" },
  playerControls:{ display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10 },
  playerNavBtn:{ background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 16px",color:C.accent,fontWeight:700,fontSize:13,cursor:"pointer" },
  playerCounter:{ fontSize:13,color:C.sub,fontWeight:600 },
  chipRow:{ display:"flex",flexWrap:"wrap",gap:7,margin:"14px 0 4px" },
  chip:{ background:C.white,border:`1px solid ${C.border}`,borderRadius:20,padding:"5px 12px",color:C.sub,fontSize:13,cursor:"pointer",fontWeight:500,display:"flex",alignItems:"center",gap:5 },
  chipActive:{ background:C.accent,border:`1px solid ${C.accent}`,color:"#fff",fontWeight:700 },
  chipDot:{ width:7,height:7,borderRadius:"50%",flexShrink:0 },
  list:{ display:"flex",flexDirection:"column",gap:8 },
  empty:{ textAlign:"center",padding:"48px 0",color:C.sub,display:"flex",flexDirection:"column",alignItems:"center" },
  row:{ background:C.white,borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:`1px solid ${C.border}` },
  rowMain:{ display:"flex",alignItems:"center",gap:12,padding:"12px 14px",cursor:"pointer" },
  rowNum:{ fontSize:12,color:C.border,fontWeight:700,minWidth:22 },
  rowThumb:{ flexShrink:0,width:52,height:52,borderRadius:8,overflow:"hidden" },
  rowThumbImg:{ width:"100%",height:"100%",objectFit:"cover" },
  rowThumbEmpty:{ width:"100%",height:"100%",background:C.bg2,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub,fontSize:20 },
  rowInfo:{ flex:1,minWidth:0 },
  rowTitle:{ fontWeight:700,fontSize:15,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" },
  rowArtist:{ fontSize:12,color:C.sub,marginTop:2 },
  chevron:{ fontSize:10,color:C.border,flexShrink:0 },
  rowDetail:{ padding:"0 14px 16px",borderTop:`1px solid ${C.border}` },
  playOverlay:{ position:"absolute",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6 },
  playBtn:{ width:50,height:50,borderRadius:"50%",background:C.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:C.accent,boxShadow:"0 2px 12px rgba(0,0,0,0.2)" },
  playLabel:{ color:"#fff",fontSize:13,fontWeight:700 },
  stopBtn:{ flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 0",fontSize:13,cursor:"pointer",fontWeight:600,color:C.text },
  ytBtn:{ flex:1,background:"#FF0000",color:"#fff",border:"none",borderRadius:8,padding:"8px 0",fontSize:13,cursor:"pointer",fontWeight:700,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center" },
  detailComment:{ fontSize:14,color:C.sub,lineHeight:1.6,margin:"8px 0 12px",background:C.bg2,borderRadius:10,padding:"10px 14px",whiteSpace:"pre-wrap" },
  detailFooter:{ display:"flex",justifyContent:"space-between",fontSize:12,color:C.sub,paddingTop:10,borderTop:`1px solid ${C.border}` },
  archive:{ marginTop:40 },
  sectionTitle:{ fontSize:16,fontWeight:800,marginBottom:14,color:C.text },
  archiveDropBtn:{ background:C.bg2,border:`1px solid ${C.border}`,borderRadius:20,padding:"6px 14px",cursor:"pointer",fontSize:13,fontWeight:700,color:C.accent,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap" },
  archiveDropList:{ marginTop:10,border:`1px solid ${C.border}`,borderRadius:14,background:C.white,maxHeight:260,overflowY:"auto" },
  archiveDropItem:{ width:"100%",padding:"12px 16px",textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:10,background:"none",border:"none",borderBottom:`1px solid ${C.border}` },
  archiveDropItemActive:{ background:C.accent },
  overlay:{ position:"fixed",inset:0,zIndex:200,background:"rgba(37,43,30,0.45)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-end",justifyContent:"center" },
  modal:{ background:C.bg,borderRadius:"22px 22px 0 0",padding:"20px 20px 40px",width:"100%",maxWidth:640,maxHeight:"92vh",overflowY:"auto" },
  modalHandle:{ width:36,height:4,background:C.border,borderRadius:2,margin:"0 auto 16px" },
  modalTitle:{ fontSize:18,fontWeight:900,marginBottom:4,color:C.text },
  input:{ width:"100%",background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:14,boxSizing:"border-box",outline:"none" },
  textarea:{ width:"100%",background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",color:C.text,fontSize:14,boxSizing:"border-box",minHeight:72,resize:"vertical",outline:"none" },
  inlineTagRow:{ display:"flex",gap:8,marginTop:10 },
  inlineTagBtn:{ background:C.accent,border:"none",borderRadius:10,padding:"10px 14px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap" },
  modalBtns:{ display:"flex",gap:10,marginTop:20 },
  cancelBtn:{ flex:1,background:C.bg2,border:`1px solid ${C.border}`,borderRadius:12,padding:14,color:C.sub,fontSize:15,cursor:"pointer" },
  submitBtn:{ flex:1,background:C.accent,border:"none",borderRadius:12,padding:"12px 16px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer" },
  exportGrid:{ display:"flex",flexDirection:"column",gap:10,marginBottom:4 },
  exportCard:{ background:C.white,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,textAlign:"left" },
  importGuide:{ background:C.bg2,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:4 },
  mgmtBox:{ background:C.bg2,borderRadius:12,padding:16,marginBottom:14 },
  mgmtSub:{ fontSize:15,fontWeight:800,marginBottom:10,color:C.text },
  themeRow:{ display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${C.border}` },
  delBtn:{ background:"none",border:"none",color:C.sub,fontSize:13,cursor:"pointer",padding:"2px 6px",fontWeight:700 },
  editToggleBtn:{ background:"none",border:`1px solid ${C.border}`,borderRadius:14,padding:"4px 12px",color:C.sub,fontSize:12,fontWeight:700,cursor:"pointer" },
  editActiveBtn:{ background:C.accent,border:`1px solid ${C.accent}`,borderRadius:14,padding:"4px 12px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer" },
  toast:{ position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:C.text,borderRadius:20,padding:"12px 24px",color:"#fff",fontSize:14,fontWeight:700,zIndex:300,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.2)" },
  iosStep:{ display:"flex",alignItems:"flex-start",gap:14,padding:"12px 14px",background:C.bg2,borderRadius:12 },
  iosNum:{ width:28,height:28,borderRadius:"50%",background:C.accent,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:14,flexShrink:0 },
  iosStepTitle:{ fontWeight:700,fontSize:14,color:C.text,marginBottom:3 },
  iosStepDesc:{ fontSize:13,color:C.sub,lineHeight:1.5 },
  iosIcon:{ background:C.border,borderRadius:6,padding:"1px 6px",fontSize:12,fontWeight:700,color:C.text },
  editBtn:{ flex:1,background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 0",fontSize:13,cursor:"pointer",fontWeight:600,color:C.accent },
  deleteBtn:{ flex:1,background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"8px 0",fontSize:13,cursor:"pointer",fontWeight:600,color:"#DC2626" },
};
