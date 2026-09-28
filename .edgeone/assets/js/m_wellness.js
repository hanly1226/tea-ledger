'use strict';
// ============ 3️⃣ 节气养生科普 ============
const WellMod = {
  weather: null, generating: false, hot: null, hotFetching: false,
  // ---- 今日抖音养生热点：优先读云端推送（每日6:00定时任务抓取），失败/未推送时按日轮换本地精选池 ----
  async fetchHotspots(){
    if(this.hotFetching || this.hotFetchedAt === todayStr()) return;
    this.hotFetching = true;
    this.hotFetchedAt = todayStr();
    try {
      const r = await fetch(TCM_CONFIG.readUrl(TCM_CONFIG.cloudBase + 'hotspots') + '?t=' + Date.now());
      const txt = (await r.text() || '').trim();
      if(txt){
        const j = JSON.parse(txt);
        if(j && j.date && j.items && j.items.length){
          this.hot = j;
          try { localStorage.setItem('tcmws_hotcache', txt); } catch(e){}
        }
      }
    } catch(e){}
    this.hotFetching = false;
    if(Nav.cur === 'wellness' && !document.querySelector('#modal-mask')) this.render();
  },
  hotToday(){
    if(!this.hot){
      try { this.hot = JSON.parse(localStorage.getItem('tcmws_hotcache') || 'null'); } catch(e){}
    }
    const t = todayStr();
    if(this.hot && this.hot.date === t && (this.hot.items || []).length){
      return {src: 'cloud', items: this.hot.items.slice(0, 5).map(i => ({t: i.title || i.t || '', b: i.brief || i.b || ''}))};
    }
    // 兜底：按日期轮换本地精选池取 5 条
    const pool = TCM_DATA.HOTSPOT_POOL || [];
    if(!pool.length) return {src: 'local', items: []};
    const dayIdx = Math.floor(parseDate(t).getTime() / 864e5);
    const items = [];
    for(let i = 0; i < 5; i++) items.push(pool[(dayIdx * 5 + i) % pool.length]);
    return {src: 'local', items};
  },
  hotCard(){
    const h = this.hotToday();
    const rows = h.items.map((x, i) =>
      '<div class="hot-item"><span class="hot-no">' + (i + 1) + '</span><div class="hot-body"><b>' + esc(x.t) + '</b>' +
      (x.b ? '<div class="hot-brief">' + esc(x.b) + '</div>' : '') + '</div>' +
      '<a class="hot-link" href="https://www.douyin.com/search/' + encodeURIComponent(x.t) + '" target="_blank" rel="noopener">抖音搜索 ›</a></div>').join('');
    return '<div class="card"><h3>🔥 今日抖音养生热点 <em class="tag">每日推送 5 条</em>' +
      (h.src === 'cloud' ? ' <em class="tag ok">今日已推送</em>' : ' <em class="tag">精选轮换 · 每日6:00自动更新</em>') + '</h3>' +
      (rows || '<div class="empty">暂无热点数据</div>') +
      '<div class="modal-btns" style="justify-content:flex-start"><button class="btn ghost" onclick="WellMod.copyHot()">📋 复制今日 5 条热点</button></div></div>';
  },
  copyHot(){
    const h = this.hotToday();
    copyText('【今日抖音养生热点 ' + todayStr() + '】\n' + h.items.map((x, i) => (i + 1) + '. ' + x.t + (x.b ? '：' + x.b : '')).join('\n'));
  },
  // 当前节气：{name, day(第几天), next, nextDate}
  getTerm(dateStr){
    const d = parseDate(dateStr);
    const list = [];
    [d.getFullYear() - 1, d.getFullYear(), d.getFullYear() + 1].forEach(y => {
      const arr = TCM_DATA.TERM_DATES[y];
      if(arr) arr.forEach((md, i) => list.push({date: new Date(y, md[0] - 1, md[1]), name: TCM_DATA.TERM_NAMES[i]}));
    });
    list.sort((a, b) => a.date - b.date);
    let cur = null, next = null;
    for(const t of list){
      if(t.date <= d) cur = t;
      else { next = t; break; }
    }
    if(!cur) return null;
    return {name: cur.name, day: Math.floor((d - cur.date) / 864e5) + 1, next: next ? next.name : '', nextDate: next ? fmtDate(next.date) : ''};
  },
  async fetchWeather(){
    const c = TCM_CONFIG;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia%2FShanghai';
    try {
      const r = await fetch(url);
      const j = await r.json();
      const cu = j.current;
      this.weather = {
        t: Math.round(cu.temperature_2m), feel: Math.round(cu.apparent_temperature),
        h: Math.round(cu.relative_humidity_2m), code: cu.weather_code,
        desc: TCM_DATA.WEATHER_CODES[cu.weather_code] || '多云',
        wind: Math.round(cu.wind_speed_10m)
      };
    } catch(e){ this.weather = null; }
    return this.weather;
  },
  windLevel(kmh){
    if(kmh < 6) return '微风'; if(kmh < 20) return '和风'; if(kmh < 39) return '风力较大'; return '大风';
  },
  // 简洁精简的合规推荐理由：取功效首个短句，清洗治疗性/人群表述，限制长度
  cleanEff(p){
    let s = (p.effect || p.note || '').trim()
      .replace(/^(适宜|作用|功效)[:：]?/, '')
      .replace(/之功效$/, '')
      .replace(/[；;，,]\s*适合[^（]*/, '')
      .replace(/(治疗|主治|疗效|根治|防治)/g, '')
      .replace(/人群/g, '')
      .replace(/价格面议/g, '')
      .trim();
    const seg = s.split(/[，,；;。、]/).filter(Boolean);
    s = seg[0] || '';
    if(s.length <= 5 && seg[1] && (s.length + seg[1].length) <= 12) s += '、' + seg[1];
    if(s.length > 12) s = s.slice(0, 12);
    return s || '日常养生';
  },
  productLines(){
    const prods = Store.get('products').items.filter(p => !p.del);
    const eff = p => this.cleanEff(p);
    // 从体质描述中提取「宜XX」调理原则短语
    const yi = bt => {
      const m = (TCM_DATA.BODY_DESC[bt] || '').match(/宜([^，。；]+)/);
      return m ? '宜' + m[1] : '';
    };
    // 9 种体质全部给到建议
    const lines = [];
    Object.keys(TCM_DATA.BODY_DESC).forEach(bt => {
      const hits = [];
      const usedCats = {};
      prods.forEach(p => {
        if((p.suit || []).indexOf(bt) < 0) return;
        if(usedCats[p.cat]) return;        // 每个大类仅推荐 1 款，保持简洁
        hits.push(p); usedCats[p.cat] = 1;
      });
      const head = '【' + bt + '】' + (yi(bt) ? yi(bt) + '。' : '');
      if(hits.length) lines.push(head + '推荐：' + hits.map(p => p.name + '（' + eff(p) + '）').join('、'));
      else lines.push(head + '适合产品可到店咨询。');
    });
    return lines.join('\n');
  },
  // 今日推荐：仅依据当天实时气象 + 节气 + 养生要点综合打分（不按九种体质），按 6 大类各推荐 1-2 款合适产品；无合适的不推荐
  todayRec(dateStr, w){
    const prods = Store.get('products').items.filter(p => !p.del);
    const term = this.getTerm(dateStr) || {name: ''};
    const info = TCM_DATA.TERM_INFO[term.name] || {};
    // 节气 + 养生要点文本（用于提炼调理方向，不依赖九种体质）
    const termTxt = (info.feat || '') + (info.tips || '') + (info.diet || '') + (info.avoid || '');
    // 调理方向：节气文本命中触发词 → 产品特征词命中则加分
    const dirs = [
      {k:/清热|解暑|消暑|降火|防暑|暑热|暑湿/, p:/清热|解暑|消暑|降火|凉血|绿豆|荷叶|酸梅|乌梅|薄荷|菊花|莲子|冬瓜|苦瓜|金银花|雪梨/},
      {k:/祛湿|化湿|利湿|除湿|湿/,           p:/祛湿|化湿|利湿|健脾|茯苓|薏|赤小豆|陈皮|冬瓜|荷叶|山药|麦芽|泽泻/},
      {k:/润燥|滋阴|润肺|防燥|燥/,           p:/润燥|滋阴|润肺|生津|银耳|雪梨|百合|麦冬|桑|蜂蜜|玉竹|枸杞|杏仁|芝麻/},
      {k:/温阳|温补|温养|温肾|养阳|助阳|散寒|保暖|进补|温茶|热饮|以热制热|饮温/, p:/温阳|暖|散寒|生姜|干姜|桂圆|肉桂|红糖|艾|滋补|参|黄芪|核桃|羊肉|红枣|黑芝麻|龙眼/},
      {k:/疏肝|理气|解郁|养肝|柔肝|戒怒|郁/, p:/疏肝|理气|玫瑰|陈皮|佛手|解郁|柴胡|薄荷|菊花/},
      {k:/健脾|养胃|调脾|补脾胃|平补|调畅气机/, p:/健脾|养胃|党参|黄芪|山药|茯苓|大枣|麦芽|白术/},
      {k:/养心|安神|宁神|戒躁|静养/,         p:/养心|安神|百合|莲子|龙眼|红枣|酸枣仁|茯神/},
      {k:/活血|化瘀|养血|收敛/,               p:/活血|化瘀|玫瑰|红花|当归|丹参|山楂|桃仁/}
    ];
    const dayIdx = Math.floor(parseDate(dateStr).getTime() / 864e5);
    const lines = [];
    (TCM_DATA.CATS || []).forEach((cat, ci) => {
      const pool = prods.filter(p => p.cat === cat);
      if(!pool.length) return;
      const scored = pool.map(p => {
        const txt = (p.name || '') + ' ' + (p.effect || '') + ' ' + (p.formula || '') + ' ' + (p.desc || '');
        let s = 0;
        // —— 实时气象 ——
        if(w){
          if(w.t >= 30) s += /清热|消暑|解暑|生津|清凉|乌梅|酸梅|荷叶|绿豆|薄荷|菊花/.test(txt) ? 3 : 0;
          if(w.feel >= 32) s += /清热|生津|补水/.test(txt) ? 1 : 0;
          if(w.t <= 12) s += /温阳|暖|散寒|生姜|干姜|桂圆|肉桂|红糖|艾|滋补/.test(txt) ? 3 : 0;
          if(w.h >= 75) s += /祛湿|化湿|利湿|健脾|薏|茯苓|赤小豆|陈皮|排水/.test(txt) ? 3 : 0;
          if(w.h <= 40) s += /润燥|滋阴|润肺|生津|银耳|雪梨|百合|麦冬|桑|蜂蜜/.test(txt) ? 3 : 0;
          if([61,63,65,80,81,82,95,96,99].indexOf(w.code) >= 0) s += /祛湿|健脾|化湿|排湿/.test(txt) ? 1 : 0;
          if([71,73,75,85,86].indexOf(w.code) >= 0) s += /温|散寒|暖/.test(txt) ? 1 : 0;
        }
        // —— 节气 + 养生要点（提炼调理方向，不按体质）——
        if(termTxt) dirs.forEach(d => { if(d.k.test(termTxt) && d.p.test(txt)) s += 3; });
        return {p, s};
      });
      // 无正向命中的产品：该大类不推荐
      const ok = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s);
      if(!ok.length) return;
      // 每大类取评分最高的 1-2 款，按日期轮换起点，保证每天尽量不重复
      const n = Math.min(2, ok.length);
      const start = (dayIdx + ci) % ok.length;
      const picks = [];
      for(let i = 0; i < n; i++) picks.push(ok[(start + i) % ok.length].p);
      lines.push('· ' + cat + '：' + picks.map(p => p.name + '（' + this.cleanEff(p) + '）').join('、'));
    });
    return lines.join('\n') || '今日暂无特别匹配的推荐产品';
  },
  // 分体质调理建议独立文案（可单独复制）
  makeBtext(dateStr){
    return '【分体质调理建议 · ' + dateStr + '】\n覆盖九种体质，本店产品每类精选一款，仅作日常养生调理参考。\n' +
      this.productLines() +
      '\n\n本内容仅供日常养生调理参考，不涉及疾病诊断与治疗；特殊人群请遵医嘱。\n——' + TCM_CONFIG.shopName;
  },
  weatherTips(w){
    if(!w) return '';
    const tips = [];
    if(w.t >= 32) tips.push('今日气温较高，请注意防暑降温、及时补水');
    if(w.t <= 5) tips.push('今日气温较低，请注意防寒保暖');
    if(w.h >= 80) tips.push('湿度较大，湿邪易困脾，饮食宜清淡、少食生冷');
    if(w.h <= 35) tips.push('空气干燥，宜多饮温水、适当润燥');
    if([61,63,65,80,81,82,95,96,99].indexOf(w.code) >= 0) tips.push('今日有雨，出行请携带雨具、注意路滑');
    if([71,73,75,85,86].indexOf(w.code) >= 0) tips.push('今日有雪，出行注意防滑保暖');
    return tips.length ? '气象提示：' + tips.join('；') + '。' : '';
  },
  compose(dateStr, w){
    const term = this.getTerm(dateStr) || {name: '当令', day: 1, next: '', nextDate: ''};
    const info = TCM_DATA.TERM_INFO[term.name] || {};
    const d = parseDate(dateStr);
    const head = '【' + TCM_CONFIG.city + '·节气养生日报】\n' +
      d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekdayCn(dateStr) +
      ' · ' + term.name + '第' + term.day + '天' +
      (term.next ? '（' + term.nextDate.slice(5).replace('-', '月') + '日交' + term.next + '）' : '');
    const wx = w ?
      '灌云实时：' + w.desc + '，气温' + w.t + '℃（体感' + w.feel + '℃），相对湿度' + w.h + '%，' + this.windLevel(w.wind) + '。\n' + this.weatherTips(w)
      : '今日天气数据暂未获取，请以当地实况为准。';
    const body =
      head + '\n\n' +
      '一、今日气象\n' + wx + '\n\n' +
      '二、节气特点\n' + term.name + '：' + (info.feat || '') + '\n\n' +
      '三、今日养生要点\n' + (info.tips || '') + '\n饮食参考：' + (info.diet || '') + '\n起居提醒：' + (info.avoid || '') + '\n\n' +
      '四、今日养生推荐\n' + this.todayRec(dateStr, w) + '\n\n' +
      '五、温馨提示\n本内容为节气养生科普，仅供日常养生调理参考，不涉及疾病诊断与治疗；孕妇、哺乳期、慢性病及特殊体质人群，请在医师或药师指导下选用；如有不适，请及时就医。\n\n' +
      '——' + TCM_CONFIG.shopName;
    return {term: term.name, text: body, btext: this.makeBtext(dateStr)};
  },
  async generate(silent){
    if(this.generating) return;
    this.generating = true;
    const t = todayStr();
    const w = await this.fetchWeather();
    const out = this.compose(t, w);
    const ws = Store.get('wellness');
    if(!ws.archive) ws.archive = [];
    const old = ws.archive.find(a => a.date === t);
    if(old){ old.text = out.text; old.term = out.term; old.weather = w; old.btext = out.btext; }
    else ws.archive.push({date: t, term: out.term, weather: w, text: out.text, btext: out.btext});
    // 容量保护：素材库过大时裁剪最早的记录（保留至少最近180条）
    try {
      while(JSON.stringify(ws).length > 170000 && ws.archive.length > 180){
        ws.archive.sort((a,b) => a.date < b.date ? -1 : 1); ws.archive.shift();
      }
    } catch(e){}
    Store.markDirty('wellness');
    this.generating = false;
    if(!silent){ toast('今日节气养生文案已生成并归档'); }
    if(Nav.cur === 'wellness') this.render();
  },
  // 每日7:30自动生成（页面开启时到点自动执行；打开时已过7:30则立即补生成）
  autoCheck(){
    const now = new Date();
    if(now.getHours() * 60 + now.getMinutes() < 450) return;
    const ws = Store.get('wellness');
    if((ws.archive || []).some(a => a.date === todayStr())) return;
    this.generate(true);
  },
  render(){
    this.fetchHotspots();
    const el = $('#content');
    const ws = Store.get('wellness');
    const t = todayStr();
    const today = (ws.archive || []).find(a => a.date === t);
    const term = this.getTerm(t);
    const arch = (ws.archive || []).slice().sort((a, b) => a.date < b.date ? 1 : -1);
    const terms = Array.from(new Set(arch.map(a => a.term)));
    const filterSel = this.filterTerm || '';
    const shown = filterSel ? arch.filter(a => a.term === filterSel) : arch;
    el.innerHTML =
      '<div class="mod-head"><h2>🌿 节气养生科普</h2>' +
      '<div class="date-nav"><span class="tag big">' + term.name + ' · 第' + term.day + '天</span></div></div>' +
      '<div class="hint">每日 7:30 自动生成推送文案并归档（工作台页面开启状态下自动完成，打开时已过 7:30 会立即补生成）· 文案已绑定产品资料库，区分体质人群适宜与禁忌，仅作日常养生调理，符合宣传规范。</div>' +
      '<div class="card"><h3>📨 今日推送文案（' + t + '）</h3>' +
      (today ?
        '<pre class="copy-pre">' + esc(today.text) + '</pre>' +
        '<div class="modal-btns" style="justify-content:flex-start">' +
        '<button class="btn" onclick="WellMod.copyToday()">📋 一键复制，发养生便民服务群</button>' +
        '<button class="btn ghost" onclick="WellMod.generate()">🔄 重新生成（刷新实时天气）</button></div>'
        :
        '<div class="empty">今日文案尚未生成</div><button class="btn" onclick="WellMod.generate()">✨ 立即生成今日文案</button>') +
      '</div>' +
      '<div class="card"><h3>🧩 分体质调理建议 <em class="tag">独立项目 · 可单独复制</em></h3>' +
      '<pre class="copy-pre">' + esc(this.bodyNow()) + '</pre>' +
      '<div class="modal-btns" style="justify-content:flex-start">' +
      '<button class="btn" onclick="WellMod.copyBody()">📋 单独复制分体质调理建议</button></div></div>' +
      this.hotCard() +
      '<div class="card"><h3>🗂️ 全年节气养生素材库 <em class="tag">' + arch.length + ' 篇</em></h3>' +
      '<div class="add-row"><select onchange="WellMod.filterTerm=this.value;WellMod.render()">' +
      '<option value="">全部节气</option>' + terms.map(x => '<option ' + (filterSel === x ? 'selected' : '') + '>' + x + '</option>').join('') +
      '</select></div>' +
      (shown.map(a =>
        '<div class="arch-row"><span><b>' + a.date + '</b> <em class="tag">' + a.term + '</em>' +
        (a.weather ? ' <span class="muted">' + a.weather.desc + ' ' + a.weather.t + '℃</span>' : '') + '</span>' +
        '<span class="ops"><a onclick="WellMod.view(\'' + a.date + '\')">查看</a>' +
        '<a onclick="WellMod.copyOne(\'' + a.date + '\')">复制</a></span></div>').join('') || '<div class="empty">暂无归档，生成后自动积累</div>') +
      '</div>';
  },
  copyToday(){
    const a = (Store.get('wellness').archive || []).find(x => x.date === todayStr());
    if(a) copyText(a.text);
  },
  // 当日体质调理建议文案：优先取归档，否则实时生成（不依赖天气）
  bodyNow(){
    const a = (Store.get('wellness').archive || []).find(x => x.date === todayStr());
    return (a && a.btext) ? a.btext : this.makeBtext(todayStr());
  },
  copyBody(){ copyText(this.bodyNow()); },
  copyBodyOne(d){
    const a = (Store.get('wellness').archive || []).find(x => x.date === d);
    if(a) copyText(a.btext || this.makeBtext(d));
  },
  copyOne(d){
    const a = (Store.get('wellness').archive || []).find(x => x.date === d);
    if(a) copyText(a.text);
  },
  view(d){
    const a = (Store.get('wellness').archive || []).find(x => x.date === d);
    if(!a) return;
    openModal('<h3>' + a.date + ' · ' + a.term + '</h3><pre class="copy-pre">' + esc(a.text) + '</pre>' +
      (a.btext ? '<h4 style="margin:10px 0 6px">🧩 分体质调理建议（独立项目）</h4><pre class="copy-pre">' + esc(a.btext) + '</pre>' : '') +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">关闭</button>' +
      (a.btext ? '<button class="btn ghost" onclick="WellMod.copyBodyOne(\'' + d + '\')">📋 复制体质建议</button>' : '') +
      '<button class="btn" onclick="WellMod.copyOne(\'' + d + '\')">📋 一键复制</button></div>', 'wide');
  }
};
