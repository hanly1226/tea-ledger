'use strict';
// ============ 通用工具 ============
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function safeParse(str){ try { return JSON.parse(str); } catch(e){ return null; } }
function pad2(n){ return (n < 10 ? '0' : '') + n; }
function fmtDate(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
function todayStr(){ return fmtDate(new Date()); }
function parseDate(s){ const p = s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
// 带超时的 fetch：云端假死（连上但不返回）时快速失败，避免 await 永久挂起阻塞后续逻辑
function fetchWithTimeout(url, opts, ms){
  ms = ms || 8000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  opts = Object.assign({signal: ctrl.signal}, opts || {});
  return fetch(url, opts).then(r => { clearTimeout(t); return r; }, e => { clearTimeout(t); throw e; });
}
const WEEK_CN = ['日','一','二','三','四','五','六'];
function weekdayCn(s){ return '星期' + WEEK_CN[parseDate(s).getDay()]; }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function startOfWeek(d){ const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0,0,0,0); return x; }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoWeekNo(d){ const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() + 3 - (x.getDay()+6)%7); const w1 = new Date(x.getFullYear(),0,4); return 1 + Math.round(((x - w1)/864e5 - 3 + (w1.getDay()+6)%7)/7); }
// 返回包含 base 的那个「周五」（base 当天是周五则返回当天，否则返回之后的第一个周五）
function fridayEnd(d){ const x = new Date(d); const diff = (5 - x.getDay() + 7) % 7; return addDays(x, diff); }
function moneyFmt(n){ return '¥' + (Math.round(n * 100) / 100).toLocaleString('zh-CN'); }

// 需要「按记录合并」的分片（多人同时编辑时按 id 合并，避免整本覆盖互相吞掉对方新增/修改）。
// 现仅 ledger（运营台账）命中此结构；其余分片维持原有整值比较。
const MERGE_SHARDS = new Set(['ledger']);

// 按记录合并两个台账分片：local/remote 形如 { 账本: [ {id, t, ...} ] }
// 规则：同一 id 保留 t 较新者；只有一方有的记录全部保留（并集）；删除记录（del:true）也按 t 较新者判定。
// 返回合并后的对象；若结构非「对象→数组」则视为非台账，返回 null 不处理。
function mergeRecordBooks(local, remote){
  if(!local || typeof local !== 'object' || Array.isArray(local)) return null;
  if(!remote || typeof remote !== 'object' || Array.isArray(remote)) return null;
  const out = JSON.parse(JSON.stringify(local));
  for(const book of Object.keys(remote)){
    const rArr = remote[book];
    if(!Array.isArray(rArr)){ out[book] = rArr; continue; }
    if(!Array.isArray(out[book])) out[book] = [];
    const map = new Map();
    out[book].forEach(r => { if(r && r.id != null) map.set(r.id, r); });
    for(const r of rArr){
      if(!r || r.id == null){ out[book].push(r); continue; }
      const ex = map.get(r.id);
      if(!ex){ out[book].push(r); }
      else if((r.t || 0) > (ex.t || 0)){
        const i = out[book].indexOf(ex);
        if(i >= 0) out[book][i] = r; else out[book].push(r);
      }
      // 否则保留本地较新版本
    }
  }
  // 收敛：每个 _src（来源book#id#cat）在单个账本内只保留 t 最新的一份，
  // 杜绝多设备 / 刷新时「删旧副本+建新副本」被云端拉取覆盖，导致同步副本重复累积。
  for(const book of Object.keys(out)){
    if(!Array.isArray(out[book])) continue;
    const seen = new Map();
    const kept = [];
    for(const r of out[book]){
      if(r && r._src && r._src.book && r._src.id){
        const k = r._src.book + '#' + r._src.id + '#' + (r._src.cat || '');
        const ex = seen.get(k);
        if(!ex){ seen.set(k, r); kept.push(r); }
        else if((r.t || 0) > (ex.t || 0)){ const i = kept.indexOf(ex); if(i >= 0) kept[i] = r; seen.set(k, r); }
      } else kept.push(r);
    }
    out[book] = kept;
  }
  return out;
}

let toastTimer = null;
function toast(msg, ok){
  let el = $('#toast');
  if(!el){ el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.className = 'show' + (ok === false ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = ''; }, 2600);
}
function openModal(html, cls){
  closeModal();
  const wrap = document.createElement('div');
  wrap.id = 'modal-mask';
  wrap.innerHTML = '<div class="modal ' + (cls||'') + '">' + html + '</div>';
  wrap.addEventListener('click', e => { if(e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
}
function closeModal(){ const m = $('#modal-mask'); if(m) m.remove(); }
async function copyText(text){
  try { await navigator.clipboard.writeText(text); toast('已复制到剪贴板，可直接粘贴到微信群'); }
  catch(e){
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); toast('已复制到剪贴板'); } catch(e2){ toast('复制失败，请手动长按复制', false); }
    ta.remove();
  }
}

// 语音播报：弹窗提醒时同步朗读（可用 localStorage tcmws_voice='0' 关闭）
function speak(text){
  try{
    if(!('speechSynthesis' in window)) return;
    if(localStorage.getItem('tcmws_voice') === '0') return;
    const ss = window.speechSynthesis;
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = 1.05; u.pitch = 1.0;
    const vs = ss.getVoices();
    const zh = vs.find(v => /zh|cmn|Chinese|中文|普通话/i.test(v.lang + ' ' + v.name));
    if(zh) u.voice = zh;
    ss.speak(u);
  }catch(e){}
}

// ============ 云端同步存储引擎（textdb.online 分片存储 + localStorage 缓存）============
const SHARDS = ['todo','work','wellness','products','ledger','schedule','settings','memo','finance'];
const Store = {
  data: {}, rev: {}, shardT: {}, device: '', pushTimers: {}, pushing: {}, pendingPush: {}, dirty: {},
  lastSync: 0, cloudOk: null, onRemote: null,
  init(defaults){
    this.device = localStorage.getItem('tcmws_device') || uid();
    localStorage.setItem('tcmws_device', this.device);
    SHARDS.forEach(s => {
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem('tcmws_' + s) || 'null'); } catch(e){}
      if(cached && cached.data !== undefined){ this.data[s] = cached.data; this.rev[s] = cached.rev || 1; }
      else { this.data[s] = defaults[s]; this.rev[s] = 1; this.saveLocal(s); }
    });
  },
  get(s){ return this.data[s]; },
  saveLocal(s){
    try { localStorage.setItem('tcmws_' + s, JSON.stringify({rev: this.rev[s], data: this.data[s]})); } catch(e){}
  },
  markDirty(s){
    this.rev[s] = (this.rev[s] || 1) + 1;
    this.shardT[s] = Date.now();
    this.dirty[s] = true;
    this.saveLocal(s);
    setSyncUI('pending');
    clearTimeout(this.pushTimers[s]);
    this.pushTimers[s] = setTimeout(() => this.push(s), TCM_CONFIG.pushDebounce);
  },
  async push(s){
    if(this.pushing[s]){ this.pendingPush[s] = true; return; }
    this.pushing[s] = true;
    try {
      // 冲突合并：推送前先取云端最新，对 ledger 等分片按记录 id 合并，
      // 保证两人同时保存时互不吞掉对方的新增/修改（整本覆盖 → 按记录并集+较新胜出）
      if(MERGE_SHARDS.has(s)){
        const remote = await this.fetchRemote(s);
        if(remote && remote.data !== undefined){
          const merged = mergeRecordBooks(this.data[s], remote.data);
          if(merged !== null){ this.data[s] = merged; this.saveLocal(s); }
        }
      }
      const payload = JSON.stringify({rev: this.rev[s], device: this.device, t: Date.now(), data: this.data[s]});
      const body = new URLSearchParams();
      body.set('key', TCM_CONFIG.cloudBase + s);
      body.set('value', payload);
      const r = await fetchWithTimeout(TCM_CONFIG.updateUrl, {method: 'POST', body}, 10000);
      const j = await r.json();
      if(j && j.status === 1){ this.cloudOk = true; this.dirty[s] = false; this.lastSync = Date.now(); setSyncUI('ok'); }
      else { this.cloudOk = false; setSyncUI('err', j && j.error); }
    } catch(e){ this.cloudOk = false; setSyncUI('err'); }
    this.yesapiPush(s); // 双重保障：异步镜像到果创云 YesApi（best-effort，失败不影响主流程）
    this.pushing[s] = false;
    if(this.pendingPush[s]){ this.pendingPush[s] = false; this.push(s); }
  },
  // 仅取回云端当前值，不修改本地状态（用于推送前合并冲突）
  async fetchRemote(s){
    try {
      const r = await fetchWithTimeout(TCM_CONFIG.readUrl(TCM_CONFIG.cloudBase + s) + '?_=' + Date.now(), {cache: 'no-store'}, 8000);
      if(!r.ok) return null;
      const text = await r.text();
      if(!text || !text.trim()) return null;
      const remote = safeParse(text);
      if(!remote || remote.data === undefined) return null;
      return remote;
    } catch(e){ return null; }
  },
  async pullShard(s, force){
    try {
      const r = await fetchWithTimeout(TCM_CONFIG.readUrl(TCM_CONFIG.cloudBase + s) + '?_=' + Date.now(), {cache: 'no-store'}, 8000);
      if(!r.ok) return;
      const text = await r.text();
      this.cloudOk = true; this.lastSync = Date.now();
      if(!text || !text.trim()){ // 云端 textdb 为空（首次或数据被清理）
        if(await this.restoreFromYes(s)) return; // 优先从果创云 YesApi 备份恢复
        if(this.dirty[s]) return;                // 本地有未保存改动，优先保留本地
        this.push(s); return;                     // 仍无备份 → 用本地缓存恢复 textdb
      }
      let remote = null;
      try { remote = JSON.parse(text); } catch(e){ return; }
      if(!remote || remote.data === undefined) return;
      const remoteT = remote.t || 0;
      const localT = this.shardT[s] || 0;
      const localDirty = !!this.dirty[s];
      // 新鲜度判据：以时间戳 t 为主（各设备本地 rev 在整值覆盖时会回退，不可靠）
      const cloudNewer = force || remoteT > localT || (remote.rev || 0) > (this.rev[s] || 0);
      if(cloudNewer && !(localDirty && !force)){
        this.data[s] = remote.data;
        this.rev[s] = Math.max(this.rev[s] || 0, remote.rev || 0); // 取较大值，避免 rev 回退
        this.shardT[s] = remoteT || Date.now();
        this.saveLocal(s);
        if(this.onRemote) this.onRemote(s);
        setSyncUI('ok');
      } else if(localDirty && !force){
        // 本地有未保存改动且云端并非更新版 → 把本地改动推上云
        clearTimeout(this.pushTimers[s]);
        this.pushTimers[s] = setTimeout(() => this.push(s), 300);
      }
    } catch(e){ this.cloudOk = false; setSyncUI('err'); }
  },
  async pullAll(force){
    await Promise.all(SHARDS.map(s => this.pullShard(s, force).catch(() => {})));
  },
  // 立即把本地所有未保存改动推上云（刷新前调用，保证刷新后以云端为准且不失本地编辑）
  async flushDirty(){
    const ks = Object.keys(this.dirty).filter(s => this.dirty[s]);
    if(!ks.length) return;
    await Promise.all(ks.map(s => this.push(s)));
  },
  // ===== 果创云 YesApi 双写备份（best-effort，失败不影响主流程）=====
  // 用「自由数据表(Free)」接口：无需登录，仅需 app_key；表名由用户在控制台创建（默认 tcm_shard）
  // 接口支持 yesapi_allow_origin=1 跨域；签名默认关闭即可。分片仅 6 行，列表全取后在 JS 内按 key 匹配，避免依赖服务端 where 过滤。
  _yesBase(y){ return (y.domain || '').replace(/\/+$/, ''); },
  _yesCommon(y){ return 'app_key=' + encodeURIComponent(y.appKey) + '&yesapi_allow_origin=1&return_data=1'; },
  _yesRows(j){
    if(!j) return [];
    const cand = (j.data && (j.data.list || j.data.items)) || j.list || j.items;
    return Array.isArray(cand) ? cand : [];
  },
  async yesapiPush(s){
    try {
      const y = (this.get('settings') || {}).yes;
      if(!y || !y.domain || !y.appKey) return;
      const base = this._yesBase(y);
      const model = y.model || 'tcm_shard';
      const fullKey = TCM_CONFIG.cloudBase + s;
      const payload = JSON.stringify({rev: this.rev[s] || 1, device: this.device, t: Date.now(), data: this.data[s]});
      // 映射到 YesApi 自由表的实际字段：content=分片key, ext_data=JSON数据, device/t/rev 原样
      const rowData = JSON.stringify({content: fullKey, ext_data: payload, device: this.device, t: new Date().toISOString(), rev: String(this.rev[s] || 1)});
      const common = this._yesCommon(y);
      // 列出全部分片行（量极小），JS 中按 content 找匹配
      let hitId = null;
      try {
        const lr = await fetch(base + '/?s=App.Table.FreeGetList&model_name=' + encodeURIComponent(model) + '&' + common, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}});
        if(lr.ok){
          const rows = this._yesRows(await lr.json());
          for(const r of rows){
            if(r.content === fullKey){ hitId = r.id; break; }
          }
        }
      } catch(e){}
      const body = 's=' + (hitId ? 'App.Table.FreeUpdate' : 'App.Table.FreeAdd') +
        '&model_name=' + encodeURIComponent(model) + (hitId ? '&id=' + encodeURIComponent(hitId) : '') +
        '&data=' + encodeURIComponent(rowData) + '&' + common;
      await fetch(base + '/?', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body});
    } catch(e){ /* 备份失败不影响主流程 */ }
  },
  async yesapiPull(s){
    try {
      const y = (this.get('settings') || {}).yes;
      if(!y || !y.domain || !y.appKey) return null;
      const base = this._yesBase(y);
      const model = y.model || 'tcm_shard';
      const fullKey = TCM_CONFIG.cloudBase + s;
      const common = this._yesCommon(y);
      const lr = await fetch(base + '/?s=App.Table.FreeGetList&model_name=' + encodeURIComponent(model) + '&' + common, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}});
      if(!lr.ok) return null;
      const rows = this._yesRows(await lr.json());
      for(const r of rows){
        // 用 content 字段匹配分片 key，ext_data 字段读取 JSON 数据
        if(r.content === fullKey && r.ext_data){
          const remote = safeParse(r.ext_data);
          if(remote && remote.data !== undefined) return {rev: remote.rev || Number(r.rev) || 0, data: remote.data, t: remote.t || Date.now()};
        }
      }
      return null;
    } catch(e){ return null; }
  },
  async restoreFromYes(s){
    const y = await this.yesapiPull(s);
    if(!y) return false;
    if(MERGE_SHARDS.has(s)){
      const merged = mergeRecordBooks(this.data[s], y.data);
      this.data[s] = (merged !== null) ? merged : y.data;
    } else {
      this.data[s] = y.data;
    }
    this.rev[s] = Math.max(this.rev[s] || 0, y.rev || 1);
    this.shardT[s] = y.t || Date.now();
    this.saveLocal(s);
    this.push(s); // 写回 textdb
    if(this.onRemote) this.onRemote(s);
    return true;
  }
};
function setSyncUI(state, extra){
  const dot = $('#sync-dot'), txt = $('#sync-text');
  if(!dot) return;
  if(state === 'ok'){ dot.className = 'dot ok'; txt.textContent = '云端已同步 ' + new Date(Store.lastSync).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}); }
  else if(state === 'pending'){ dot.className = 'dot pending'; txt.textContent = '正在同步…'; }
  else { dot.className = 'dot err'; txt.textContent = '云端连接中断，已存本地' + (extra ? '：' + extra : ''); }
}
