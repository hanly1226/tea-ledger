'use strict';
// 对外产品展示页（独立、只读）——仅读取 products_public 投影分片，与工作台其他数据完全隔离。
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const PP = {
  key: 'tcmgy_ws_v1_products_public',
  url: 'https://textdb.online/tcmgy_ws_v1_products_public',
  cats: ['奶茶咖啡', '药食同源食品', '袋泡茶饮', '膏方', '药枕香囊', '合香产品'],
  curCat: '全部',
  data: [],
  async load(){
    try {
      const r = await fetch(this.url + '?_=' + Date.now(), {cache: 'no-store'});
      if(!r.ok) throw new Error('http ' + r.status);
      const text = await r.text();
      const j = text && text.trim() ? JSON.parse(text) : null;
      if(j && Array.isArray(j.data)) this.data = j.data;
      else if(Array.isArray(j)) this.data = j; // 兼容裸数组
      else this.data = [];
      try { localStorage.setItem('tcmws_products_public', JSON.stringify({t: Date.now(), data: this.data})); } catch(e){}
      this.render();
      this.setStatus('已更新 ' + new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}));
    } catch(e){
      // 兜底：本地缓存（上次成功拉取）
      try {
        const c = localStorage.getItem('tcmws_products_public');
        if(c){ const j = JSON.parse(c); if(j && j.data){ this.data = j.data; this.render(); this.setStatus('离线缓存'); return; } }
      } catch(_){}
      this.setStatus('加载失败，请稍后刷新');
      if(!this.data.length){
        const el = document.getElementById('pp-list');
        if(el) el.innerHTML = '<div class="pp-empty">暂时无法连接，请稍后点右上角「↻ 刷新」。</div>';
      }
    }
  },
  setStatus(t){ const el = document.getElementById('pp-status'); if(el) el.textContent = t; },
  render(){
    const catsEl = document.getElementById('pp-cats');
    if(catsEl && !catsEl.dataset.built){
      const all = ['全部'].concat(this.cats);
      catsEl.innerHTML = all.map(c => '<span class="pp-cat' + (c === this.curCat ? ' on' : '') + '" data-c="' + esc(c) + '" onclick="PP.filter(\'' + c + '\')">' + esc(c) + '</span>').join('');
      catsEl.dataset.built = '1';
    }
    const list = this.curCat === '全部' ? this.data : this.data.filter(p => p.cat === this.curCat);
    const el = document.getElementById('pp-list');
    if(!el) return;
    if(!list.length){ el.innerHTML = '<div class="pp-empty">该分类暂无产品，到店咨询更多～</div>'; return; }
    el.innerHTML = list.map(p => this.card(p)).join('');
  },
  filter(c){
    this.curCat = c;
    const catsEl = document.getElementById('pp-cats');
    if(catsEl) catsEl.querySelectorAll('.pp-cat').forEach(s => s.classList.toggle('on', s.dataset.c === c));
    this.render();
  },
  card(p){
    const label = (p.cat === '合香产品') ? '香方' : '组成';
    const price = (p.price == null) ? '' : ('<span class="pp-price">原价 ¥' + p.price + (p.unit && p.unit !== '元' ? p.unit : '') + '</span>');
    const member = (p.member == null) ? '' : ('<span class="pp-member">会员 ¥' + p.member + '</span>');
    const imgs = (p.imgs && p.imgs.length) ? p.imgs : [];
    const gallery = imgs.length ? '<div class="pp-imgs">' + imgs.map(src => '<img src="' + src + '" alt="' + esc(p.name) + '" loading="lazy">').join('') + '</div>' : '';
    const suit = (p.suit || []).map(s => '<em class="pp-tag">' + esc(s) + '</em>').join('');
    const people = p.people ? '<div class="pp-people">👥 ' + esc(p.people) + '</div>' : '';
    const formula = p.formula ? '<div class="pp-formula">🧪 ' + esc(label) + '：' + esc(p.formula) + '</div>' : '';
    const spec = p.unit ? '<div class="pp-spec">规格：' + esc(p.unit) + '</div>' : '';
    const meta = (spec || price || member) ? '<div class="pp-meta">' + spec + price + member + '</div>' : '';
    return '<section class="pp-card">' + gallery +
      '<div class="pp-name">' + esc(p.name) + '</div>' + meta + formula +
      (suit ? '<div class="pp-suit">' + suit + '</div>' : '') + people + '</section>';
  },
  start(){
    this.load();
    const rb = document.getElementById('pp-refresh');
    if(rb) rb.addEventListener('click', () => this.load());
    setInterval(() => this.load(), 5000); // 每5秒轮询，资料库更新即自动同步
  }
};
window.addEventListener('DOMContentLoaded', () => PP.start());
