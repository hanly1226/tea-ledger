'use strict';
// ============ 4️⃣ 体质匹配 ============
const MatchMod = {
  sel: {},
  render(){
    const el = $('#content');
    this.sel = {};
    el.innerHTML =
      '<div class="mod-head"><h2>🧭 体质匹配</h2></div>' +
      '<div class="hint">🔒 不采集姓名与个人信息 · 仅根据当下体质对应症状 / 舌象 / 寒热 / 体型食欲 / 经期 / 睡眠 / 二便等情况精准匹配；已知自己体质的可直接在第 10 题勾选（可多选），从产品资料库按「配方→功效」精准匹配适合产品（不限数量），仅作日常养生调理参考。</div>' +
      '<div class="card">' +
      TCM_DATA.MATCH_FORM.map((q, qi) =>
        '<div class="q-block"><div class="q-title">' + (qi + 1) + '. ' + q.label + (q.multi ? ' <em class="tag">多选</em>' : '') + '</div>' +
        '<div class="chips">' + q.opts.map((o, oi) =>
          '<span class="chip" id="chip-' + qi + '-' + oi + '" onclick="MatchMod.pick(' + qi + ',' + oi + ')">' + esc(o.t) + '</span>').join('') +
        '</div>').join('') +
      '<div class="modal-btns" style="justify-content:flex-start">' +
      '<button class="btn" onclick="MatchMod.result()">🔍 匹配适合产品</button>' +
      '<button class="btn ghost" onclick="MatchMod.render()">清空重选</button></div>' +
      '<div id="match-result"></div></div>';
  },
  pick(qi, oi){
    const q = TCM_DATA.MATCH_FORM[qi];
    if(!this.sel[qi]) this.sel[qi] = {};
    if(q.multi){ this.sel[qi][oi] = !this.sel[qi][oi]; }
    else {
      const was = this.sel[qi][oi];
      this.sel[qi] = {};
      if(!was) this.sel[qi][oi] = true;
    }
    q.opts.forEach((_, i) => {
      const c = $('#chip-' + qi + '-' + i);
      if(c) c.classList.toggle('on', !!this.sel[qi][i]);
    });
  },
  result(){
    const scores = {};
    const matched = {};   // 体质 -> 命中信号计数（精准汇总）
    let picked = 0;
    TCM_DATA.MATCH_FORM.forEach((q, qi) => {
      Object.keys(this.sel[qi] || {}).forEach(oi => {
        if(!this.sel[qi][oi]) return;
        picked++;
        const o = q.opts[oi];
        // 题1：症状 ↔ 体质 精确一对一
        if(qi === 0 && o.c){
          matched[o.c] = (matched[o.c] || 0) + 2;
          scores[o.c] = (scores[o.c] || 0) + 2;
        }
        // 题2-7：按权重给体质加分
        if(o.s){
          Object.keys(o.s).forEach(k => {
            scores[k] = (scores[k] || 0) + o.s[k];
            matched[k] = (matched[k] || 0) + 1;
          });
        }
      });
    });
    if(!picked){ toast('请先选择症状或情况', false); return; }
    // 精准匹配体质集合：优先取非平和质；若只有平和质信号则保留
    let consts = Object.keys(matched).filter(k => k !== '平和质');
    if(!consts.length) consts = Object.keys(matched).length ? Object.keys(matched) : ['平和质'];
    const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    const prods = Store.get('products').items.filter(p => !p.del);
    // 精准匹配：产品 suit 命中任一匹配体质即入选，不限数量、不限大类
    const hits = prods.filter(p => consts.some(bt => (p.suit || []).indexOf(bt) >= 0));
    $('#match-result').innerHTML =
      '<div class="result-box"><h3>匹配体质：' + consts.map(t => '<em class="tag big">' + t + '</em>').join(' ') + '</h3>' +
      consts.map(t => '<div class="bt-desc">📖 <b>' + t + '</b>：' + TCM_DATA.BODY_DESC[t] + '</div>').join('') +
      '<h4>为您精准匹配的本店产品（按配方功效，不限数量，共 ' + hits.length + ' 款）</h4>' +
      (hits.length ? MatchMod.recBlocks(hits)
        : '<div class="empty">产品库中暂无「' + consts.join('、') + '」的专属产品，可在产品资料库中为该体质补充适宜标签</div>') +
      '<div class="hint">以上建议仅供日常养生调理参考，不构成医疗建议；孕妇、哺乳期及慢性病人群请遵医嘱。</div></div>';
    const rEl = $('#match-result');
    if(rEl && rEl.scrollIntoView) rEl.scrollIntoView({behavior: 'smooth'});
  },
  // 将产品列表按大类分组渲染（精准匹配：不限数量）
  recBlocks(list){
    return TCM_DATA.CATS.map(cat => {
      const hits = list.filter(p => p.cat === cat);
      if(!hits.length) return '';
      return '<div class="rec-cat"><b>' + cat + '（' + hits.length + '）</b>' + hits.map(p =>
        '<div class="rec-item">🍵 <b>' + esc(p.name) + '</b> — 功效：' + esc(p.effect) +
        (p.formula ? '<div class="rec-formula">📜 配方：' + esc(p.formula) + '</div>' : '') +
        (p.avoid ? '<div class="rec-avoid">⚠️ 注意：' + esc(p.avoid) + '</div>' : '') + '</div>').join('') + '</div>';
    }).filter(Boolean).join('') || '<div class="empty">产品库中暂无匹配产品</div>';
  }
};
