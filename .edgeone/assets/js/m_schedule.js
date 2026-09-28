'use strict';
// ============ 7️⃣ 排班表 ============
const SchedMod = {
  weekOffset: 0,
  TPL_START: '2026-07-27',   // 排班规律基准起点
  TPL_LEN: 14,               // 7-27 ~ 8-9 共 14 天为一套循环模板
  _tpl: null,
  weekDates(){
    const start = addDays(startOfWeek(new Date()), this.weekOffset * 7);
    return Array.from({length: 7}, (_, i) => fmtDate(addDays(start, i)));
  },
  st(){
    const s = Store.get('schedule');
    if(!s.overrides) s.overrides = {};
    if(!s.internNames) s.internNames = ['实习生①', '实习生②'];
    if(!s.intern) s.intern = {};
    return s;
  },
  // 默认规则：于丹、魏燕征周一至周五轮流早晚班（按周轮换），周日轮流全天班
  defaultShift(dateStr, staff){
    const d = parseDate(dateStr);
    const wd = d.getDay();
    const even = isoWeekNo(d) % 2 === 0;
    const first = staff === TCM_DATA.STAFF[0]; // 于丹
    if(wd >= 1 && wd <= 5) return (even === first) ? '早班' : '晚班';
    if(wd === 0) return (even === first) ? '全天班' : '休';
    return ''; // 周六未设定，可点击安排
  },
  // 双周规律：以「本周与上周」实际排班为模板，未来每周按相同奇偶周自动沿用
  _patternDate(dateStr){
    const tgt = parseDate(dateStr);
    const tgtParity = isoWeekNo(tgt) % 2;
    const refParity = isoWeekNo(new Date()) % 2;
    let refMonday = startOfWeek(new Date());
    if(tgtParity !== refParity) refMonday = addDays(refMonday, -7);
    return fmtDate(addDays(refMonday, (tgt.getDay() + 6) % 7));
  },
  getShift(dateStr, staff){
    const o = this.st().overrides[dateStr + '|' + staff];
    if(o !== undefined) return o;
    const idx = this.tplIndex(dateStr);
    if(idx >= 0){ const t = this.empTpl().emp[staff]; if(t && t[idx] !== undefined) return t[idx]; }
    return this.defaultShift(dateStr, staff);
  },
  defaultIntern(dateStr){
    const wd = parseDate(dateStr).getDay();
    return (wd >= 1 && wd <= 5) ? '白班' : '休';
  },
  getIntern(dateStr, di){
    const o = this.st().intern[di + '|' + dateStr];
    if(o !== undefined) return o;
    const idx = this.tplIndex(dateStr);
    if(idx >= 0){ const t = this.empTpl().intern[di]; if(t && t[idx] !== undefined) return t[idx]; }
    return this.defaultIntern(dateStr);
  },
  // 以 2026-07-27 ~ 2026-08-09 的实际排班（手动覆盖 + 默认规则）构建 14 天模板，之后每周按相同规律循环
  empTpl(){
    if(this._tpl) return this._tpl;
    const tpl = {emp: {}, intern: {}};
    const names = this.st().internNames || ['实习生①', '实习生②'];
    for(let i = 0; i < this.TPL_LEN; i++){
      const d = fmtDate(addDays(parseDate(this.TPL_START), i));
      TCM_DATA.STAFF.forEach(name => {
        if(!tpl.emp[name]) tpl.emp[name] = [];
        const o = this.st().overrides[d + '|' + name];
        tpl.emp[name][i] = (o !== undefined) ? o : this.defaultShift(d, name);
      });
      names.forEach((nm, di) => {
        if(tpl.intern[di] === undefined) tpl.intern[di] = [];
        const o = this.st().intern[di + '|' + d];
        tpl.intern[di][i] = (o !== undefined) ? o : this.defaultIntern(d);
      });
    }
    this._tpl = tpl;
    return tpl;
  },
  tplIndex(dateStr){
    const diff = Math.round((parseDate(dateStr) - parseDate(this.TPL_START)) / 86400000);
    if(diff < 0) return -1;
    return ((diff % this.TPL_LEN) + this.TPL_LEN) % this.TPL_LEN;
  },
  cls(s){
    return s === '早班' ? 'sh-early' : s === '晚班' ? 'sh-late' : s === '全天班' ? 'sh-full' : s === '白班' ? 'sh-day' : s === '休' ? 'sh-rest' : 'sh-none';
  },
  render(){
    const el = $('#content');
    const dates = this.weekDates();
    const today = todayStr();
    const head = '<tr><th>人员</th>' + dates.map((d, i) =>
      '<th class="' + (d === today ? 'today-col' : '') + '">周' + WEEK_CN[(i + 1) % 7] + '<br><span class="muted">' + d.slice(5) + '</span></th>').join('') + '</tr>';
    const staffRows = TCM_DATA.STAFF.map(name =>
      '<tr><td><b>' + name + '</b></td>' + dates.map(d => {
        const s = this.getShift(d, name);
        return '<td class="' + (d === today ? 'today-col ' : '') + '"><span class="shift ' + this.cls(s) + '" onclick="SchedMod.cycle(\'' + d + '\',\'' + name + '\')">' + (s || '—') + '</span></td>';
      }).join('') + '</tr>').join('');
    const names = this.st().internNames;
    const internRows = names.map((nm, di) => {
      const restN = dates.filter((d, i) => i < 5 && this.getIntern(d, di) === '休').length;
      return '<tr><td><input autocomplete="off" class="inline-name" value="' + esc(nm) + '" maxlength="8" onchange="SchedMod.setInternName(' + di + ', this.value)"> <em class="tag ' + (restN === 2 ? 'ok' : 'warn') + '">休' + restN + '/2</em></td>' + dates.map(d => {
        const s = this.getIntern(d, di);
        return '<td class="' + (d === today ? 'today-col ' : '') + '"><span class="shift ' + this.cls(s) + '" onclick="SchedMod.cycleIntern(\'' + d + '\',' + di + ')">' + (s || '—') + '</span></td>';
      }).join('') + '</tr>';
    }).join('');
    el.innerHTML =
      '<div class="mod-head"><h2>🗓️ 排班表</h2><div class="date-nav">' +
      '<button class="btn sm" onclick="SchedMod.weekOffset--;SchedMod.render()">◀ 上一周</button>' +
      '<button class="btn sm ghost" onclick="SchedMod.weekOffset=0;SchedMod.render()">本周</button>' +
      '<button class="btn sm" onclick="SchedMod.weekOffset++;SchedMod.render()">下一周 ▶</button></div></div>' +
      '<div class="hint">' + dates[0] + ' ~ ' + dates[6] + '（第' + isoWeekNo(parseDate(dates[0])) + '周）· 点击格子可手动调整班次（早班→晚班→全天班→白班→休→空）· 后续周次按 2026-07-27~08-09 规律自动生成· 调整即时同步到云端所有人可见。</div>' +
      '<div class="card"><h3>👥 员工排班表</h3>' +
      '<div class="tbl-scroll"><table class="tbl sched">' + head + staffRows + '</table></div>' +
      '<div class="hint">排班按 <b>2026-07-27 ~ 08-09</b> 的实际班次形成的 14 天规律自动向后循环生成；点击格子可临时改某天（含手动调整），调整即时同步云端。</div></div>' +
      '<div class="card"><h3>🎓 实习排班表</h3>' +
      '<div class="tbl-scroll"><table class="tbl sched">' + head + internRows + '</table></div>' +
      '<div class="hint">规律：实习生按 2026-07-27~08-09 的休息安排自动向后循环；周一至周五休息天数达标亮绿，其余为白班；点击格子在 白班 / 休 之间切换；左侧名字可直接修改。</div></div>' +
      '<div class="legend">' +
      ['早班', '晚班', '全天班', '白班', '休'].map(s => '<span class="shift ' + this.cls(s) + '">' + s + '</span>').join('') + '</div>';
  },
  setInternName(di, val){
    const s = this.st();
    s.internNames[di] = (val || '').trim() || ('实习生' + (di + 1));
    this._tpl = null;
    Store.markDirty('schedule'); this.render();
  },
  cycle(dateStr, staff){
    const cyc = TCM_DATA.SHIFT_CYCLE;
    const cur = this.getShift(dateStr, staff);
    const next = cyc[(cyc.indexOf(cur) + 1) % cyc.length];
    this.st().overrides[dateStr + '|' + staff] = next;
    this._tpl = null;
    Store.markDirty('schedule'); this.render();
  },
  cycleIntern(dateStr, di){
    const cur = this.getIntern(dateStr, di);
    const next = cur === '白班' ? '休' : cur === '休' ? '' : '白班';
    this.st().intern[di + '|' + dateStr] = next;
    this._tpl = null;
    Store.markDirty('schedule'); this.render();
  }
};
