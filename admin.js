const STORAGE_KEY = "martreeAcademy.videos.v2";
const AUTH_KEY = "martreeAcademy.adminAuthed.v2";

// 🔐 Troque a senha aqui
const ADMIN_PASSWORD = "martree@123";

const $ = (id) => document.getElementById(id);

function bind(id, evt, fn){
  const el = $(id);
  if(!el){
    console.warn(`[admin.js] Elemento #${id} não encontrado no admin.html`);
    return;
  }
  el.addEventListener(evt, fn);
}

function toast(msg){
  const el = $("toast");
  if(!el) return; // não quebra se não existir
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(window.__t);
  window.__t = setTimeout(()=> el.style.display="none", 2200);
}

function safeParse(s, fallback){ try{ return JSON.parse(s);}catch{ return fallback; } }
function getVideos(){ return safeParse(localStorage.getItem(STORAGE_KEY), []); }
function setVideos(v){ localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); }

function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

function normalize(s){
  return String(s||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function parseTags(s){
  return String(s||"").split(",").map(t=>t.trim()).filter(Boolean).slice(0,14);
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ====== Auth ====== */
let pendingAction = null;

function isAuthed(){ return sessionStorage.getItem(AUTH_KEY) === "1"; }
function setAuth(ok){ ok ? sessionStorage.setItem(AUTH_KEY,"1") : sessionStorage.removeItem(AUTH_KEY); }

function showAuth(show){
  const m = $("authModal");
  if(!m) return; // se não existir, não quebra

  if(show){
    m.classList.add("show");
    m.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
    setTimeout(()=> $("adminPass")?.focus(), 50);
  }else{
    m.classList.remove("show");
    m.setAttribute("aria-hidden","true");
    document.body.style.overflow="";
  }
}

function requireAuth(fn){
  if(isAuthed()) return fn();
  pendingAction = fn;
  showAuth(true);
}

function wireAuth(){
  // se não existir modal de auth, não trava o admin
  if($("authModal")){
    if(!isAuthed()) showAuth(true);
    else showAuth(false);
  }

  bind("btnAuth","click", ()=>{
    const passEl = $("adminPass");
    const msgEl = $("authMsg");
    const pass = passEl ? passEl.value : "";

    if(pass === ADMIN_PASSWORD){
      setAuth(true);
      if(passEl) passEl.value = "";
      if(msgEl) msgEl.textContent = "";
      showAuth(false);

      const fn = pendingAction;
      pendingAction = null;
      if(typeof fn === "function") fn();

      toast("Acesso liberado");
    }else{
      if(msgEl) msgEl.textContent = "Senha incorreta.";
      passEl?.focus();
      passEl?.select();
    }
  });

  bind("adminPass","keydown", (e)=>{
    if(e.key==="Enter") $("btnAuth")?.click();
  });

  bind("btnLogout","click", ()=>{
    const ok = confirm("Sair do Admin? Vai pedir senha novamente.");
    if(!ok) return;
    setAuth(false);
    pendingAction = null;
    showAuth(true);
  });
}

/* ====== URL helpers ====== */
function parseSource(url){
  const u = String(url||"").trim();
  if(/\.(mp4)(\?.*)?$/i.test(u)) return {platform:"mp4", id:null};

  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/);
  if(yt?.[1]) return {platform:"youtube", id: yt[1]};

  const vm = u.match(/vimeo\.com\/(\d+)/);
  if(vm?.[1]) return {platform:"vimeo", id: vm[1]};

  if(u.includes("youtube.com/embed/")){
    const m = u.match(/embed\/([A-Za-z0-9_-]{6,})/);
    return {platform:"youtube", id: m?.[1] || null};
  }
  if(u.includes("player.vimeo.com/video/")){
    const m = u.match(/video\/(\d+)/);
    return {platform:"vimeo", id: m?.[1] || null};
  }

  return {platform:"unknown", id:null};
}

function defaultThumb(url){
  const s = parseSource(url);
  if(s.platform==="youtube" && s.id){
    return `https://img.youtube.com/vi/${s.id}/hqdefault.jpg`;
  }
  return "";
}

async function importFromLink(url){
  const src = parseSource(url);

  if(src.platform==="youtube"){
    const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if(!o.ok) throw new Error("Falha ao importar do YouTube");
    const data = await o.json();
    return { title: data.title || "", thumb: data.thumbnail_url || defaultThumb(url) };
  }

  if(src.platform==="vimeo"){
    const o = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
    if(!o.ok) throw new Error("Falha ao importar do Vimeo");
    const data = await o.json();
    return { title: data.title || "", thumb: data.thumbnail_url || "" };
  }

  return { title:"", thumb: defaultThumb(url) || "" };
}

/* ====== CRUD ====== */
function clearForm(){
  $("id") && ($("id").value = "");
  $("url") && ($("url").value = "");
  $("title") && ($("title").value = "");
  $("category") && ($("category").value = "");
  $("thumb") && ($("thumb").value = "");
  $("description") && ($("description").value = "");
  $("tags") && ($("tags").value = "");
  $("btnSave") && ($("btnSave").textContent = "Salvar");
}

function fillForm(v){
  $("id").value = v.id;
  $("url").value = v.url || "";
  $("title").value = v.title || "";
  $("category").value = v.category || "";
  if($("thumb")) $("thumb").value = v.thumb || "";
  $("description").value = v.description || "";
  $("tags").value = (v.tags || []).join(", ");
  $("btnSave").textContent = "Atualizar";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function removeVideo(id){
  setVideos(getVideos().filter(v=>v.id!==id));
  render();
  toast("Vídeo removido");
}

function render(){
  const qEl = $("q");
  const q = qEl ? normalize(qEl.value) : "";

  let list = getVideos().slice();

  if(q){
    list = list.filter(v=>{
      const blob = normalize([v.title, v.category, v.description, (v.tags||[]).join(",")].join(" "));
      return blob.includes(q);
    });
  }

  list.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  const grid = $("grid");
  const empty = $("empty");
  if(!grid) return;

  grid.innerHTML = "";

  if(list.length===0){
    if(empty) empty.hidden = false;
    return;
  }
  if(empty) empty.hidden = true;

  list.forEach(v=>{
    const th = (v.thumb || defaultThumb(v.url) || "").trim();
    const card = document.createElement("article");
    card.className = "videoCard";
    card.style.cursor = "default";
    card.innerHTML = `
      <div class="thumb">
        ${th ? `<img src="${escapeHtml(th)}" alt="">` : ""}
        <div class="play"><div class="playBadge">🛠</div></div>
      </div>
      <div class="vBody">
        <div class="vTop">
          <h4 class="vTitle">${escapeHtml(v.title||"Sem título")}</h4>
          <span class="badge">${escapeHtml(v.category||"Sem categoria")}</span>
        </div>
        <p class="vDesc">${escapeHtml((v.description||"Sem descrição.").slice(0,120))}${(v.description||"").length>120?"…":""}</p>
        <div class="tagRow">${(v.tags||[]).slice(0,4).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
        <div class="vFoot">
          <button class="btn ghost" type="button" data-edit="${escapeHtml(v.id)}">Editar</button>
          <button class="btn danger" type="button" data-del="${escapeHtml(v.id)}">Excluir</button>
        </div>
      </div>
    `;

    card.querySelector("[data-edit]")?.addEventListener("click", ()=> fillForm(v));
    card.querySelector("[data-del]")?.addEventListener("click", ()=>{
      requireAuth(()=>{
        const ok = confirm(`Excluir "${v.title}"?`);
        if(ok) removeVideo(v.id);
      });
    });

    grid.appendChild(card);
  });
}

function seed(){
  const existing = getVideos();
  if(existing.length){
    const ok = confirm("Já existem vídeos cadastrados. SOBRESCREVER com exemplos?");
    if(!ok) return;
  }

  const now = Date.now();
  setVideos([
    {
      id: uid(),
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Padrão de atendimento (base)",
      category: "Atendimento",
      thumb: "",
      description: "Boas práticas de abordagem, postura e finalização com o cliente.",
      tags: ["atendimento","padrão","cliente"],
      createdAt: now-100000
    }
  ]);

  render();
  toast("Exemplos carregados");
}

/* ====== Wiring ====== */
function wire(){
  bind("q","input", render);

  bind("btnReset","click", clearForm);

  bind("btnSeed","click", ()=> requireAuth(()=> seed()));

  bind("btnClearAll","click", ()=>{
    requireAuth(()=>{
      const ok = confirm("Apagar TODOS os vídeos?");
      if(!ok) return;
      localStorage.removeItem(STORAGE_KEY);
      clearForm();
      render();
      toast("Tudo apagado");
    });
  });

  bind("btnImport","click", ()=>{
    requireAuth(async ()=>{
      const urlEl = $("url");
      if(!urlEl) return;

      const url = urlEl.value.trim();
      if(!url){ alert("Cole o link do vídeo primeiro."); return; }

      const btn = $("btnImport");
      if(btn){
        btn.disabled = true;
        btn.textContent = "Importando...";
      }

      try{
        const data = await importFromLink(url);
        if(data.title && $("title") && !$("title").value.trim()) $("title").value = data.title;
        const th = data.thumb || defaultThumb(url);
        if(th && $("thumb") && !$("thumb").value.trim()) $("thumb").value = th;
        toast("Importado do link");
      }catch(err){
        alert("Não consegui importar automaticamente. Preencha manualmente.\n\nDetalhe: " + err.message);
      }finally{
        if(btn){
          btn.disabled = false;
          btn.textContent = "Importar do link";
        }
      }
    });
  });

  bind("form","submit", (e)=>{
    e.preventDefault();
    requireAuth(()=>{
      const id = ($("id")?.value || "").trim();
      const url = ($("url")?.value || "").trim();
      const title = ($("title")?.value || "").trim();
      const category = ($("category")?.value || "").trim();
      const thumb = ($("thumb")?.value || "").trim() || defaultThumb(url);
      const description = ($("description")?.value || "").trim();
      const tags = parseTags(($("tags")?.value || ""));

      if(!url || !title || !category){
        alert("Preencha: Link, Título e Categoria.");
        return;
      }

      const videos = getVideos();
      const now = Date.now();

      if(id){
        const idx = videos.findIndex(v=>v.id===id);
        if(idx===-1){ alert("Não achei esse item para atualizar."); return; }
        videos[idx] = { ...videos[idx], url, title, category, thumb, description, tags };
        setVideos(videos);
        clearForm();
        render();
        toast("Atualizado");
        return;
      }

      videos.push({ id: uid(), url, title, category, thumb, description, tags, createdAt: now });
      setVideos(videos);
      clearForm();
      render();
      toast("Salvo");
    });
  });
}

document.addEventListener("DOMContentLoaded", ()=>{
  wireAuth();
  wire();
  render();
});
