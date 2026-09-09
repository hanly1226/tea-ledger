'use strict';
// ============ 2️⃣ 日常工作进度 ============
const WK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WorkMod = {
  selDate: todayStr(),
  bizMonth: todayStr().slice(0, 7),
  bizYear: String(new Date().getFullYear()),
  weekOffset: 0,
  weekCustomStart: '',
  weekCustomLen: 7,
  specialFor(dateStr){
    const d = parseDate(dateStr);
    const day = d.getDate(), wd = d.getDay();
    const W = this.content();
    const sp = {early: [], late: [], monthly: [], monthlyDay: [], labels: [], monthlyStaff: '', monthlyShift: '', monthlyTarget: '', monthlyFallback: false};
    if(wd === 1){
      W.mondayEarly.forEach(t => sp.early.push({t, tag: '每周一固定'}));
      W.mondayLate.forEach(t => sp.late.push({t, tag: '每周一固定'}));
      sp.labels.push('每周一固定');
    }
    const isStart = (day === 1 || day === 2);
    const isMid = (day === 15 || day === 16);
    if(isStart || isMid){
      const dayLabel = isStart ? '月初1/2日' : '月中15/16日';
      const staff = this.monthlyStaffOf(dateStr);
      const shift = SchedMod.getShift(dateStr, staff); // 结合排班表判定负责人当天班次
      sp.monthlyStaff = staff; sp.monthlyShift = shift;
      // 不拆分：整套固定任务只排进「当月负责人当天的那一个班次」
      // 早班→早班；晚班→晚班；全天班→早班；休/未排班→兜底早班（并标注，避免任务遗漏）
      let target = 'early';
      if(shift === '晚班') target = 'late';
      else if(shift === '早班' || shift === '全天班' || shift === '白班') target = 'early';
      else { target = 'early'; sp.monthlyFallback = true; } // 休 / 未排班

      sp.monthlyTarget = target;
      const shiftTxt = shift || '未排班';
      W.monthlyTasks.forEach(t => {
        sp.monthly.push(t);
        const tag = dayLabel + '固定·' + staff + '·' + shiftTxt + (sp.monthlyFallback ? '(暂归早班)' : '');
        sp[target].push({t, tag});
      });
      W.monthlyTasks.forEach(() => sp.monthlyDay.push(dayLabel));
      sp.labels.push('每月' + dayLabel + '固定');
    }
    if(day === 25){
      W.day25Early.forEach(t => sp.early.push({t, tag: '每月25日固定'}));
      W.day25Late.forEach(t => sp.late.push({t, tag: '每月25日固定'}));
      sp.labels.push('每月25日固定');
    }
    return sp;
  },
  log(dateStr){
    const w = Store.get('work');
    if(!w.logs) w.logs = {};
    if(!w.logs[dateStr]) w.logs[dateStr] = {early: {}, late: {}, spEarly: {}, spLate: {}, monthly: {}};
    return w.logs[dateStr];
  },
  // 可编辑内容（早/晚班、每月1/15日固定任务）：优先用云端 work 分片，首次自动用默认
  content(){
    const w = Store.get('work'); const W = TCM_DATA.WORK;
    return {
      earlyDaily: (w.earlyDaily && w.earlyDaily.length) ? w.earlyDaily : W.earlyDaily.slice(),
      lateDaily:  (w.lateDaily  && w.lateDaily.length)  ? w.lateDaily  : W.lateDaily.slice(),
      monthlyTasks: (function(){
        if(w.monthlyTasks && w.monthlyTasks.length) return w.monthlyTasks;
        const merged = (w.monthly1 || []).concat(w.monthly15 || []);
        if(merged.length) return merged;
        return ['绿植浇水、修剪养护','深度洗制冰机、破壁机、茶桶、全套器具并消毒沥干','设备保养','整理库房','全屋死角消杀','安全隐患排查'];
      })(),
      mondayEarly: W.mondayEarly.slice(),
      mondayLate:  W.mondayLate.slice(),
      day25Early:  W.day25Early.slice(),
      day25Late:   W.day25Late.slice()
    };
  },
  // 每月固定任务负责人：按月轮换（2026-07 于丹、08 魏燕征、09 于丹、10 魏燕征…）
  monthlyStaffOf(dateStr){
    const w = Store.get('work');
    const staff = (w.monthlyStaff && w.monthlyStaff.length) ? w.monthlyStaff : ['于丹','魏燕征'];
    const d = parseDate(dateStr);
    const diff = (d.getFullYear() - 2026) * 12 + (d.getMonth() - 6); // 2026-07 记为 0 → 于丹
    const idx = ((diff % staff.length) + staff.length) % staff.length;
    return staff[idx];
  },
  monthlyStaffNow(){ return this.monthlyStaffOf(todayStr()); },
  // 早/晚班完成统计
  shiftStats(key){
    const W = this.content(); const sp = this.specialFor(todayStr());
    const items = key === 'early' ? W.earlyDaily : W.lateDaily;
    const spItems = sp[key]; const spKey = key === 'early' ? 'spEarly' : 'spLate';
    const log = this.log(todayStr());
    let total = items.length + spItems.length, done = 0; const pending = [];
    items.forEach((t, i) => { if(log[key][i]) done++; else pending.push(t); });
    spItems.forEach((t, i) => { if(log[spKey][i]) done++; else pending.push(typeof t === 'string' ? t : t.t); });
    return {total, done, pending, complete: total > 0 && done === total};
  },
  render(){
    const el = $('#content');
    const d = this.selDate;
    const W = this.content(), sp = this.specialFor(d), log = this.log(d);
    el.innerHTML =
      '<div class="mod-head"><h2>🧹 日常工作进度</h2><div class="date-nav">' +
      '<button class="btn sm" onclick="WorkMod.shift(-1)">◀</button>' +
      '<input autocomplete="off" type="date" value="' + d + '" onchange="WorkMod.setDate(this.value)">' +
      '<button class="btn sm" onclick="WorkMod.shift(1)">▶</button>' +
      '<button class="btn sm ghost" onclick="WorkMod.setDate(todayStr())">今天</button></div></div>' +
      '<div class="hint">' + d + ' ' + weekdayCn(d) +
      (sp.labels.length ? ' · <b class="warn-txt">今日固定任务：' + sp.labels.join('、') + '</b>' : ' · 无特殊固定任务') + '</div>' +
      this.ledgerJump() +
      this.reminderCard() +
      '<div class="two-col">' +
      this.shiftCard('早班', 'early', W.earlyDaily, sp.early, 'spEarly', log) +
      this.shiftCard('晚班', 'late', W.lateDaily, sp.late, 'spLate', log) +
      '</div>' +
      (sp.monthly.length ? this.monthlyCard(sp, log) : '') +
      this.bizCard(d);
  },
  // 显眼的「记录台账」快捷入口，置于提醒项目上方
  ledgerJump(){
    return '<div class="jump-ledger">' +
      '<button class="btn lg-jump" onclick="Nav.go(\'ledger\')">📒 记录台账 →</button>' +
      '<button class="btn lg-jump alt" onclick="WorkMod.scrollBiz()">📊 每日数据填写</button>' +
      '<span class="jump-tip">左：快速进入运营台账登记订单；右：直接跳到下方每日经营数据填报</span></div>';
  },
  // 滚动到下方「每日经营数据」卡片
  scrollBiz(){
    const el = document.querySelector('.biz-card');
    if(el) el.scrollIntoView({behavior: 'smooth', block: 'start'});
  },
  // ===== 提醒项目（顶部，可增 / 改 / 删，随云端同步；支持每天 / 每周几 / 具体日期）=====
  isDoneToday(r){ return !!r && r.doneDate === todayStr(); },
  // 该提醒今天是否处于「应提醒」状态（按重复方式判定）
  isActiveToday(r){
    if(!r || r.del) return false;
    const mode = r.repeat || 'day';
    if(mode === 'day') return true;
    if(mode === 'week'){
      const days = (r.days && r.days.length) ? r.days.map(Number) : [];
      return days.includes(new Date().getDay());
    }
    if(mode === 'date'){
      if(!r.date) return true;            // 未设日期则当每天
      return todayStr() >= r.date;        // 当天或逾期未完成则持续提醒，直到打卡
    }
    return true;
  },
  // 重复方式的中文标签
  repeatTag(r){
    const mode = r.repeat || 'day';
    if(mode === 'day') return '<em class="tag">每天</em>';
    if(mode === 'week'){
      const days = (r.days && r.days.length) ? r.days.map(Number) : [];
      const labels = days.length ? days.map(d => WK[d]).join('、') : '未设星期';
      return '<em class="tag">' + labels + '</em>';
    }
    return '<em class="tag">' + (r.date || '未设日期') + '</em>';
  },
  reminderCard(){
    const w = Store.get('work');
    if(!w.reminders) w.reminders = [];
    const list = w.reminders.filter(r => !r.del)
      .sort((a, b) => (this.isActiveToday(a) && !this.isDoneToday(a) ? 0 : 1) - (this.isActiveToday(b) && !this.isDoneToday(b) ? 0 : 1) || (a.createdAt - b.createdAt));
    const rows = list.length ? list.map(r => this.remindRow(r)).join('') : '<div class="empty">暂无提醒项目，下面可添加</div>';
    const activePending = list.filter(r => this.isActiveToday(r) && !this.isDoneToday(r));
    const allDone = !activePending.length;
    const voiceOn = localStorage.getItem('tcmws_voice') !== '0';
    return '<div class="card remind-card"><h3>🔔 提醒项目' +
      '<span class="card-ops"><a onclick="WorkMod.toggleVoice()" title="语音提醒开关（弹窗时朗读）">' + (voiceOn ? '🔊' : '🔇') + '</a></span>' +
      (allDone ? ' <em class="tag ok">今日应打卡项已全部完成 ✓</em>' : '') + '</h3>' +
      '<div class="hint">可按「每天 / 每周几 / 具体日期」设置，到点语音提醒并弹窗</div>' +
      '<div class="add-row"><input autocomplete="off" id="remind-add" placeholder="输入提醒内容，回车或点添加" onkeydown="if(event.key===\'Enter\')WorkMod.addRemind()">' +
      '<button class="btn" onclick="WorkMod.addRemind()">＋添加</button></div>' + rows + '</div>';
  },
  remindRow(r){
    const active = this.isActiveToday(r);
    const done = this.isDoneToday(r);
    let status;
    if(!active) status = '<em class="tag mute">今日不提醒</em>';
    else if(done) status = '<em class="tag ok">今日已打卡</em>';
    else status = '<em class="tag warn">今日待打卡</em>';
    const cb = active ? '<input autocomplete="off" type="checkbox" ' + (done ? 'checked' : '') + ' onchange="WorkMod.toggleRemind(\'' + r.id + '\')">' : '';
    return '<div class="todo-item' + (done ? ' done' : '') + '">' +
      '<label>' + cb + '<span>' + esc(r.text) + ' ' + this.repeatTag(r) + ' ' + status + '</span></label>' +
      '<span class="ops"><a onclick="WorkMod.editRemind(\'' + r.id + '\')">✎</a>' +
      '<a class="del" onclick="WorkMod.delRemind(\'' + r.id + '\')">✕</a></span></div>';
  },
  addRemind(){
    const inp = $('#remind-add'); const t = inp.value.trim();
    if(!t){ toast('请输入提醒内容', false); return; }
    const w = Store.get('work'); if(!w.reminders) w.reminders = [];
    w.reminders.push({id: uid(), text: t, repeat: 'day', days: [], date: '', done: false, doneDate: '', createdAt: Date.now(), del: false});
    Store.markDirty('work'); this.render(); toast('已添加提醒（默认：每天）');
  },
  toggleRemind(id){
    const w = Store.get('work'); if(!w.reminders) return;
    const r = w.reminders.find(x => x.id === id); if(!r) return;
    if(!this.isActiveToday(r)){ toast('今天不在该提醒的重复日，无需打卡', false); return; }
    r.doneDate = this.isDoneToday(r) ? '' : todayStr();
    Store.markDirty('work'); this.render();
  },
  editRemind(id){
    const w = Store.get('work'); if(!w.reminders) return;
    const r = w.reminders.find(x => x.id === id); if(!r) return;
    const mode = r.repeat || 'day';
    const weekChips = WK.map((nm, idx) =>
      '<span class="chip' + ((r.days || []).map(Number).includes(idx) ? ' on' : '') + '" data-day="' + idx + '" onclick="WorkMod.toggleDayChip(this)">' + nm + '</span>'
    ).join('');
    openModal('<h3>修改提醒</h3>' +
      '<label class="f-label">内容</label><textarea id="rm-text" rows="3">' + esc(r.text) + '</textarea>' +
      '<label class="f-label">重复提醒</label>' +
      '<select id="rm-repeat" onchange="WorkMod.onRepeatChange()">' +
      '<option value="day"' + (mode === 'day' ? ' selected' : '') + '>每天</option>' +
      '<option value="week"' + (mode === 'week' ? ' selected' : '') + '>每周几</option>' +
      '<option value="date"' + (mode === 'date' ? ' selected' : '') + '>具体日期</option></select>' +
      '<div id="rm-week-wrap" style="margin:6px 0;display:' + (mode === 'week' ? 'block' : 'none') + '">固定星期（可多选）<div class="chips">' + weekChips + '</div></div>' +
      '<div id="rm-date-wrap" style="margin:6px 0;display:' + (mode === 'date' ? 'block' : 'none') + '">具体日期 <input type="date" id="rm-date" value="' + (r.date || '') + '"></div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="WorkMod.saveRemind(\'' + id + '\')">保存</button></div>');
  },
  onRepeatChange(){
    const m = $('#rm-repeat').value;
    const ww = document.getElementById('rm-week-wrap');
    const dw = document.getElementById('rm-date-wrap');
    if(ww) ww.style.display = (m === 'week') ? 'block' : 'none';
    if(dw) dw.style.display = (m === 'date') ? 'block' : 'none';
  },
  toggleDayChip(el){
    if(el && el.classList) el.classList.toggle('on');
  },
  saveRemind(id){
    const w = Store.get('work'); if(!w.reminders) return;
    const r = w.reminders.find(x => x.id === id); if(!r) return;
    const t = $('#rm-text').value.trim();
    if(!t){ toast('内容不能为空', false); return; }
    const mode = $('#rm-repeat').value;
    r.text = t; r.repeat = mode; r.days = []; r.date = '';
    if(mode === 'week'){
      const days = [].slice.call(document.querySelectorAll('#rm-week .chip.on')).map(c => +c.dataset.day);
      r.days = days;
    } else if(mode === 'date'){
      r.date = $('#rm-date') ? ($('#rm-date').value || '') : '';
    }
    Store.markDirty('work'); closeModal(); this.render(); toast('已保存');
  },
  delRemind(id){
    const w = Store.get('work'); if(!w.reminders) return;
    const r = w.reminders.find(x => x.id === id); if(!r) return;
    if(!confirm('确定删除该提醒？')) return;
    r.del = true; Store.markDirty('work'); this.render(); toast('已删除');
  },
  toggleVoice(){
    const on = localStorage.getItem('tcmws_voice') !== '0';
    localStorage.setItem('tcmws_voice', on ? '0' : '1');
    if(!on) speak('语音提醒已开启');
    this.render();
  },
  setDate(v){ if(v){ this.selDate = v; this.render(); } },
  setBizMonth(v){ if(v){ this.bizMonth = v; this.render(); } },
  setBizYear(v){ if(v){ this.bizYear = String(v); this.render(); } },
  shift(n){ this.selDate = fmtDate(addDays(parseDate(this.selDate), n)); this.render(); },
  shiftCard(title, key, items, spItems, spKey, log){
    const total = items.length + spItems.length;
    let doneN = 0;
    items.forEach((_, i) => { if(log[key][i]) doneN++; });
    spItems.forEach((_, i) => { if(log[spKey][i]) doneN++; });
    const pct = total ? Math.round(doneN / total * 100) : 0;
    const rows = items.map((t, i) =>
      '<label class="chk-row' + (log[key][i] ? ' done' : '') + '"><input autocomplete="off" type="checkbox" ' + (log[key][i] ? 'checked' : '') +
      ' onchange="WorkMod.toggle(\'' + key + '\',' + i + ')"><span>' + esc(t) + '</span></label>').join('') +
      spItems.map((it, i) => {
        const t = (it && it.t != null) ? it.t : it;
        const tag = (it && it.tag != null) ? it.tag : '固定任务';
        return '<label class="chk-row sp' + (log[spKey][i] ? ' done' : '') + '"><input autocomplete="off" type="checkbox" ' + (log[spKey][i] ? 'checked' : '') +
        ' onchange="WorkMod.toggle(\'' + spKey + '\',' + i + ')"><span>' + esc(t) + ' <em class="tag warn">' + esc(tag) + '</em></span></label>';
      }).join('');
    return '<div class="card"><h3>' + (key === 'early' ? '🌅' : '🌙') + ' ' + title +
      '<em class="tag ' + (pct === 100 ? 'ok' : '') + '">完成度 ' + pct + '%</em>' +
      '<span class="card-ops"><a data-field="' + key + 'Daily" data-title="' + title + '内容" onclick="WorkMod.editContent(this.dataset.field,this.dataset.title)" title="编辑内容">✎</a></span></h3>' +
      '<div class="pbar"><i style="width:' + pct + '%"></i></div>' + rows + '</div>';
  },
  // 固定任务卡片：只做「负责人 / 班次 / 任务清单」展示与编辑，
  // 打卡统一在上方对应班次里完成（不拆分、不重复打卡）
  monthlyCard(sp, log){
    const targetTxt = sp.monthlyTarget === 'late' ? '晚班' : '早班';
    const shiftTxt = sp.monthlyShift || '未排班';
    const shiftCls = sp.monthlyShift === '早班' ? 'sh-early' : sp.monthlyShift === '晚班' ? 'sh-late' : sp.monthlyShift === '全天班' ? 'sh-full' : 'sh-none';
    const spKey = sp.monthlyTarget === 'late' ? 'spLate' : 'spEarly';
    const base = (sp[sp.monthlyTarget] || []).length - sp.monthly.length; // 固定任务在该班次专项列表中的起始下标
    const rows = sp.monthly.map((t, i) => {
      const done = !!(log[spKey] && log[spKey][base + i]);
      return '<div class="chk-row sp ro' + (done ? ' done' : '') + '"><span>' + (done ? '✅ ' : '⬜ ') + esc(t) +
        ' <em class="tag">' + esc(sp.monthlyDay[i]) + '固定</em></span></div>';
    }).join('');
    return '<div class="card"><h3>🔁 每月固定任务（月初1/2日 · 月中15/16日）' +
      '<em class="tag warn">已排入' + targetTxt + '</em></h3>' + rows +
      '<div class="hint">本月负责人（按月轮换）：<b>' + esc(sp.monthlyStaff) + '</b>' +
      ' · 当天班次：<span class="shift ' + shiftCls + '">' + shiftTxt + '</span>' +
      ' → 全部固定任务已整套排入上方 <b>' + targetTxt + '</b> 任务清单，请在' + targetTxt + '中打卡即可（不拆分到两个班次）。' +
      (sp.monthlyFallback ? '<br><b class="warn-txt">注意：负责人当天休息/未排班，已暂归早班，请自行调整排班或指定人员完成。</b>' : '') +
      '</div>' +
      '<div class="add-row"><button class="btn sm ghost" onclick="WorkMod.editMonthly()">✎ 编辑固定任务</button></div></div>';
  },
  // ===== 每日经营数据（进店/出店 → 人流量 / 营业额 / 美团 / 淘宝闪购 / 小程序单量）=====
  biz(s){
    const w = Store.get('work'); if(!w.biz) w.biz = {};
    if(!w.biz[s]) w.biz[s] = {flowIn: 0, flowOut: 0, salesEarly: 0, salesLate: 0, meituan: 0, taobao: 0, mini: 0};
    return w.biz[s];
  },
  // 人流量 = (进店 + 出店) / 2；旧数据仅有 flow 时回退到 flow
  bizFlow(r){
    if(r && (r.flowIn != null || r.flowOut != null)){
      return Math.round(((+r.flowIn || 0) + (+r.flowOut || 0)) / 2);
    }
    return (+r.flow || 0);
  },
  // 营业额 = 早班 + 晚班；兼容旧数据仅有 sales 字段时回退到 sales
  bizSales(r){
    if(!r) return 0;
    const e = +r.salesEarly || 0, l = +r.salesLate || 0;
    if((r.salesEarly == null && r.salesLate == null) && r.sales != null) return +r.sales || 0;
    return e + l;
  },
  bizCard(d){
    const w = Store.get('work'); if(!w.biz) w.biz = {};
    const rec = this.biz(d);
    const month = this.bizMonth;
    const ana = this.bizAnalyze(month);
    const days = Object.keys(w.biz).filter(k => k.slice(0, 7) === month).sort();
    const rows = days.map(k => {
      const r = w.biz[k];
      const fl = this.bizFlow(r);
      const se = +r.salesEarly || 0, sl = +r.salesLate || 0;
      const sa = this.bizSales(r);
      const orders = (+r.meituan || 0) + (+r.taobao || 0) + (+r.mini || 0);
      const unit = fl ? (sa / fl) : 0;
      return '<tr><td>' + k + '</td><td>' + weekdayCn(k).replace('星期', '周') + '</td>' +
        '<td>' + fl + '</td><td>' + moneyFmt(se) + '</td><td>' + moneyFmt(sl) + '</td><td>' + moneyFmt(sa) + '</td>' +
        '<td>' + (+r.meituan || 0) + '</td><td>' + (+r.taobao || 0) + '</td><td>' + (+r.mini || 0) + '</td>' +
        '<td>' + orders + '</td><td>' + moneyFmt(unit) + '</td></tr>';
    }).join('') || '<tr><td colspan="11" class="empty">本月暂无填报数据</td></tr>';
    return '<div class="card biz-card"><h3>📊 每日经营数据' +
      '<span class="card-ops">' +
      '<a onclick="WorkMod.downloadBizTemplate()" title="下载 Excel 导入模板">📄 模板</a>' +
      '<a onclick="WorkMod.importBizFile()" title="从 Excel/CSV 批量导入历史数据">📥 导入</a>' +
      '</span></h3>' +
      '<div class="hint">记录每天的人流量与各大渠道单量，月底可一键分析与导出（数据随云端全店共享，换设备也不丢）。也可用「📥 导入」批量上传 Excel/CSV 历史数据。</div>' +
      '<div class="add-row biz-form">' +
        '<label>进店人数<input autocomplete="off" id="biz-flowIn" type="number" min="0" value="' + (+rec.flowIn || 0) + '" oninput="WorkMod.calcBizFlow()"></label>' +
        '<label>出店人数<input autocomplete="off" id="biz-flowOut" type="number" min="0" value="' + (+rec.flowOut || 0) + '" oninput="WorkMod.calcBizFlow()"></label>' +
        '<label>人流量(自动)<input autocomplete="off" id="biz-flow" type="number" min="0" value="' + this.bizFlow(rec) + '" disabled></label>' +
        '<label>早班营业额(元)<input autocomplete="off" id="biz-salesE" type="number" min="0" step="0.01" value="' + (+(rec.salesEarly || 0)) + '" oninput="WorkMod.calcBizTotal()"></label>' +
        '<label>晚班营业额(元)<input autocomplete="off" id="biz-salesL" type="number" min="0" step="0.01" value="' + (+(rec.salesLate || 0)) + '" oninput="WorkMod.calcBizTotal()"></label>' +
        '<label>营业额合计(自动)<input autocomplete="off" id="biz-sales" type="number" min="0" step="0.01" value="' + this.bizSales(rec) + '" disabled></label>' +
        '<label>美团单量<input autocomplete="off" id="biz-meituan" type="number" min="0" value="' + (+rec.meituan || 0) + '"></label>' +
        '<label>淘宝闪购单量<input autocomplete="off" id="biz-taobao" type="number" min="0" value="' + (+rec.taobao || 0) + '"></label>' +
        '<label>小程序单量<input autocomplete="off" id="biz-mini" type="number" min="0" value="' + (+rec.mini || 0) + '"></label>' +
        '<button class="btn" onclick="WorkMod.saveBiz()">保存 ' + d.slice(5) + ' 数据</button>' +
      '</div>' +
      '<div class="hint">早班、晚班营业额分别在各自<b>交班后</b>填写，系统自动合计当天总营业额；人流量按 (进店 + 出店) ÷ 2 自动计算。历史旧数据（只有「营业额」）首次保存后会自动归入早班。</div>' +
      this.renderBizWeek() +
      '<h3 style="margin-top:14px">📈 月度分析 ' +
      '<input autocomplete="off" type="month"  value="' + month + '" onchange="WorkMod.setBizMonth(this.value)" ' +
      'style="width:auto;display:inline-block;vertical-align:middle;margin-left:6px;font-size:13px">' +
      '</h3>' +
      (ana.dayCount ? this.bizSummary(ana) :
        '<div class="empty">「' + month + '」还没有数据，先在上面填几天的吧</div>') +
      (ana.dayCount ?
        '<div class="add-row"><button class="btn sm ghost" onclick="WorkMod.exportBizCsv(\'' + month + '\')">⬇️ 导出 ' + month + ' 经营数据 CSV</button></div>' +
        '<table class="biz-table"><thead><tr><th>日期</th><th>星期</th><th>人流量</th><th>早班营业额</th><th>晚班营业额</th><th>营业额合计</th><th>美团</th><th>淘宝闪购</th><th>小程序</th><th>总单量</th><th>客单价</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '') +
      '<h3 style="margin-top:14px">📅 ' +
      '<input autocomplete="off" type="number" min="2000" max="2100" value="' + this.bizYear + '" onchange="WorkMod.setBizYear(this.value)" ' +
      'style="width:78px;display:inline-block;vertical-align:middle;font-size:13px"> 年度分析</h3>' +
      this.bizYearSummary(this.bizYearAnalyze(this.bizYear)) +
      '<input autocomplete="off" type="file" id="biz-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="WorkMod.handleBizFile(this.files[0]);this.value=\'\'">' +
      '</div>';
  },
  bizAnalyze(month){
    const w = Store.get('work'); const biz = w.biz || {};
    const days = Object.keys(biz).filter(k => k.slice(0, 7) === month);
    let flow = 0, sales = 0, meituan = 0, taobao = 0, mini = 0;
    let maxDay = '', minDay = '', maxS = -1, minS = 1e18;
    days.forEach(k => {
      const r = biz[k];
      const fl = this.bizFlow(r), sa = this.bizSales(r), mt = +r.meituan || 0, tb = +r.taobao || 0, mn = +r.mini || 0;
      flow += fl; sales += sa; meituan += mt; taobao += tb; mini += mn;
      if(sa > maxS){ maxS = sa; maxDay = k; }
      if(sa < minS){ minS = sa; minDay = k; }
    });
    const dayCount = days.length;
    const orders = meituan + taobao + mini;
    const [y, m] = month.split('-').map(Number);
    const pm = (m === 1) ? (y - 1) + '-12' : y + '-' + pad2(m - 1);
    const pdays = Object.keys(biz).filter(k => k.slice(0, 7) === pm);
    let pSales = 0, pFlow = 0;
    pdays.forEach(k => { pSales += this.bizSales(biz[k]); pFlow += this.bizFlow(biz[k]); });
    const pOrders = pdays.reduce((a, k) => a + (+biz[k].meituan || 0) + (+biz[k].taobao || 0) + (+biz[k].mini || 0), 0);
    return {month, dayCount, flow, sales, meituan, taobao, mini, orders, maxDay, minDay, maxS, minS,
      pSales, pFlow, pOrders, pDayCount: pdays.length};
  },
  bizSummary(a){
    const avgSales = a.dayCount ? a.sales / a.dayCount : 0;
    const avgFlow = a.dayCount ? a.flow / a.dayCount : 0;
    const unit = a.flow ? a.sales / a.flow : 0;
    const pct = (x, total) => total ? Math.round(x / total * 100) : 0;
    const deltaTxt = d => (d === null || isNaN(d)) ? '—' : (d >= 0 ? '↑ +' : '↓ ') + d.toFixed(1) + '%';
    const pSalesDelta = a.pSales ? ((a.sales - a.pSales) / a.pSales * 100) : null;
    const pFlowDelta = a.pFlow ? ((a.flow - a.pFlow) / a.pFlow * 100) : null;
    const stat = (label, val) => '<div class="stat"><b>' + val + '</b><span>' + label + '</span></div>';
    return '<div class="stat-grid">' +
      stat('有数据天数', a.dayCount + ' 天') +
      stat('总营业额', moneyFmt(a.sales)) +
      stat('日均营业额', moneyFmt(avgSales)) +
      stat('总人流量', a.flow) +
      stat('日均人流量', Math.round(avgFlow)) +
      stat('客单价(营业额/人流量)', moneyFmt(unit)) +
      stat('总单量', a.orders) +
      stat('外卖日均单量', (a.dayCount ? (a.orders / a.dayCount).toFixed(1) : '0') + ' 单') +
      stat('美团单量', a.meituan) +
      stat('淘宝闪购单量', a.taobao) +
      stat('小程序单量', a.mini) +
      stat('环比上月营业额', deltaTxt(pSalesDelta)) +
      stat('环比上月人流量', deltaTxt(pFlowDelta)) +
      '</div>' +
      '<div class="hint">各渠道单量占比：美团 ' + pct(a.meituan, a.orders) + '% · 淘宝闪购 ' + pct(a.taobao, a.orders) +
        '% · 小程序 ' + pct(a.mini, a.orders) + '%（共 ' + a.orders + ' 单）。' +
      (a.maxDay ? '本月营业额最高：' + a.maxDay + '（' + moneyFmt(a.maxS) + '）；最低：' + a.minDay + '（' + moneyFmt(a.minS) + '）。' : '') + '</div>';
  },
  // 年度分析：汇总某年全部日数据，并拆到各月
  bizYearAnalyze(year){
    const w = Store.get('work'); const biz = w.biz || {};
    const y = String(year);
    const days = Object.keys(biz).filter(k => k.slice(0, 4) === y);
    let flow = 0, sales = 0, meituan = 0, taobao = 0, mini = 0;
    const months = {};
    days.forEach(k => {
      const r = biz[k];
      const fl = this.bizFlow(r), sa = this.bizSales(r), mt = +r.meituan || 0, tb = +r.taobao || 0, mn = +r.mini || 0;
      flow += fl; sales += sa; meituan += mt; taobao += tb; mini += mn;
      const m = k.slice(0, 7);
      if(!months[m]) months[m] = {sales: 0, flow: 0, orders: 0};
      months[m].sales += sa; months[m].flow += fl; months[m].orders += mt + tb + mn;
    });
    const dayCount = days.length;
    const orders = meituan + taobao + mini;
    const py = String(+year - 1);
    const pdays = Object.keys(biz).filter(k => k.slice(0, 4) === py);
    let pSales = 0; pdays.forEach(k => { pSales += this.bizSales(biz[k]); });
    return {year: y, dayCount, flow, sales, meituan, taobao, mini, orders, months, pSales, pDayCount: pdays.length};
  },
  bizYearSummary(a){
    if(!a.dayCount) return '<div class="empty">「' + a.year + '」年暂无经营数据</div>';
    const avgSales = a.dayCount ? a.sales / a.dayCount : 0;
    const avgFlow = a.dayCount ? a.flow / a.dayCount : 0;
    const avgOrders = a.dayCount ? a.orders / a.dayCount : 0;
    const delta = d => (d === null || isNaN(d)) ? '—' : (d >= 0 ? '↑ +' : '↓ ') + d.toFixed(1) + '%';
    const pSalesDelta = a.pSales ? ((a.sales - a.pSales) / a.pSales * 100) : null;
    const stat = (label, val) => '<div class="stat"><b>' + val + '</b><span>' + label + '</span></div>';
    let html = '<div class="stat-grid">' +
      stat('有数据天数', a.dayCount + ' 天') +
      stat('年总营业额', moneyFmt(a.sales)) +
      stat('年日均营业额', moneyFmt(avgSales)) +
      stat('年总人流量', a.flow) +
      stat('年日均人流量', Math.round(avgFlow)) +
      stat('年外卖总单量', a.orders) +
      stat('年外卖日均单量', avgOrders.toFixed(1) + ' 单') +
      stat('有数据月数', Object.keys(a.months).length + ' 个') +
      stat('环比去年营业额', delta(pSalesDelta)) +
      '</div>';
    const ms = Object.keys(a.months).sort();
    if(ms.length){
      const maxS = Math.max.apply(null, ms.map(m => a.months[m].sales).concat([1]));
      html += '<div class="hint">各月营业额（共 ' + ms.length + ' 个月有数据）：</div><div class="bar-list">' +
        ms.map(m => {
          const s = a.months[m].sales; const pct = Math.round(s / maxS * 100);
          return '<div class="bar-row"><span class="bar-m">' + m.slice(5) + '月</span>' +
            '<div class="bar-track"><i style="width:' + pct + '%"></i></div>' +
            '<span class="bar-v">' + moneyFmt(s) + '</span></div>';
        }).join('') + '</div>';
    }
    return html;
  },
  calcBizFlow(){
    const fin = +($('#biz-flowIn').value || 0), fout = +($('#biz-flowOut').value || 0);
    const el = $('#biz-flow'); if(el) el.value = Math.round((fin + fout) / 2);
  },
  // 早班 + 晚班 自动合计当天总营业额
  calcBizTotal(){
    const e = +($('#biz-salesE').value || 0), l = +($('#biz-salesL').value || 0);
    const el = $('#biz-sales'); if(el) el.value = (e + l).toFixed(2);
  },
  saveBiz(){
    const w = Store.get('work'); if(!w.biz) w.biz = {};
    const d = this.selDate;
    w.biz[d] = {
      flowIn: +($('#biz-flowIn').value || 0),
      flowOut: +($('#biz-flowOut').value || 0),
      salesEarly: +($('#biz-salesE').value || 0),
      salesLate: +($('#biz-salesL').value || 0),
      meituan: +($('#biz-meituan').value || 0),
      taobao: +($('#biz-taobao').value || 0),
      mini: +($('#biz-mini').value || 0)
    };
    Store.markDirty('work'); this.render(); toast('已保存 ' + d + ' 经营数据');
  },
  exportBizCsv(month){
    const w = Store.get('work'); const biz = w.biz || {};
    const days = Object.keys(biz).filter(k => k.slice(0, 7) === month).sort();
    if(!days.length){ toast('本月暂无数据可导出', false); return; }
    const head = ['日期', '星期', '进店', '出店', '人流量', '早班营业额', '晚班营业额', '营业额合计', '美团单量', '淘宝闪购单量', '小程序单量', '总单量', '客单价'];
    const rows = days.map(k => {
      const r = biz[k];
      const fin = +r.flowIn || 0, fout = +r.flowOut || 0;
      const fl = this.bizFlow(r), sa = this.bizSales(r), se = +r.salesEarly || 0, sl = +r.salesLate || 0, mt = +r.meituan || 0, tb = +r.taobao || 0, mn = +r.mini || 0;
      const orders = mt + tb + mn;
      const unit = fl ? (sa / fl) : 0;
      return [k, weekdayCn(k).replace('星期', '周'), fin, fout, fl, se, sl, sa, mt, tb, mn, orders, unit.toFixed(2)];
    });
    const lines = [head.join(',')].concat(rows.map(r => r.join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\n')], {type: 'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '经营数据_' + month + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出 ' + month + ' 经营数据 CSV');
  },
  // ===== 每日经营数据：Excel / CSV 导入 =====
  importBizFile(){ const el = document.getElementById('biz-file'); if(el) el.click(); },
  handleBizFile(file){
    if(!file) return;
    const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
    if(typeof XLSX === 'undefined'){
      // 库未加载时，CSV 用纯前端解析兜底（保证导入功能不依赖网络）
      if(!isCsv){ toast('表格解析组件未加载，无法读取 Excel；请改用「模板」导出的 CSV，或刷新页面后重试', false); return; }
      const reader = new FileReader();
      reader.onload = e => {
        try { const rows = this.parseCsvToRows(e.target.result); if(rows) this.previewBizImport(rows); }
        catch(err){ toast('解析失败：' + (err && err.message ? err.message : err), false); }
      };
      reader.onerror = () => toast('文件读取失败', false);
      reader.readAsText(file, 'utf-8');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, {type: 'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {defval: ''});
        this.previewBizImport(rows);
      } catch(err){
        toast('解析失败：' + (err && err.message ? err.message : err), false);
      }
    };
    reader.onerror = () => toast('文件读取失败', false);
    reader.readAsArrayBuffer(file);
  },
  // CSV 解析（XLSX 缺失时的兜底，支持引号包裹与逗号）
  parseCsvToRows(text){
    const lines = this.splitCsvLines(text);
    if(lines.length < 2){ toast('CSV 至少需表头 + 一行数据', false); return null; }
    const header = this.parseCsvLine(lines[0]).map(h => h.trim());
    const out = [];
    for(let i = 1; i < lines.length; i++){
      if(!lines[i].trim()) continue;
      const cells = this.parseCsvLine(lines[i]);
      const obj = {};
      header.forEach((h, idx) => { obj[h] = (cells[idx] != null ? cells[idx] : '').trim(); });
      out.push(obj);
    }
    return out;
  },
  splitCsvLines(text){
    const res = []; let cur = ''; let q = false;
    for(let i = 0; i < text.length; i++){
      const c = text[i];
      if(c === '"'){ if(q && text[i+1] === '"'){ cur += '"'; i++; } else q = !q; }
      else if(c === '\n'){ if(q) cur += '\n'; else { res.push(cur); cur = ''; } }
      else if(c !== '\r'){ cur += c; }
    }
    if(cur.length || res.length) res.push(cur);
    return res;
  },
  parseCsvLine(line){
    const res = []; let cur = ''; let q = false;
    for(let i = 0; i < line.length; i++){
      const c = line[i];
      if(c === '"'){ if(q && line[i+1] === '"'){ cur += '"'; i++; } else q = !q; }
      else if(c === ','){ if(q) cur += ','; else { res.push(cur); cur = ''; } }
      else cur += c;
    }
    res.push(cur);
    return res;
  },
  previewBizImport(rows){
    if(!rows || !rows.length){ toast('文件为空或无法识别', false); return; }
    // 扫描表头，建立 字段→列名 映射
    const fields = {date: null, flowIn: null, flowOut: null, flow: null, sales: null, meituan: null, taobao: null, mini: null};
    const first = rows[0];
    Object.keys(first).forEach(k => {
      const f = this.mapBizField(k);
      if(f && !fields[f]) fields[f] = k;
    });
    if(!fields.date){ toast('未找到「日期」列，请用模板或确保首行含 日期/进店/出店/营业额 等表头', false); return; }
    if(!fields.flowIn && !fields.flowOut && !fields.flow && !fields.sales && !fields.meituan && !fields.taobao && !fields.mini){
      toast('未识别到任何数据列（进店/出店/人流量/营业额/美团/淘宝闪购/小程序）', false); return;
    }
    // 逐行解析
    const out = [];
    rows.forEach(r => {
      const d = this.normBizDate(r[fields.date]);
      if(!d) return;
      const fin = this.numBiz(r[fields.flowIn]);
      const fout = this.numBiz(r[fields.flowOut]);
      const fl = (fields.flowIn || fields.flowOut) ? Math.round((fin + fout) / 2) : this.numBiz(r[fields.flow]);
      out.push({
        date: d,
        flowIn: (fields.flowIn || fields.flowOut) ? fin : null,
        flowOut: (fields.flowIn || fields.flowOut) ? fout : null,
        flow: (fields.flowIn || fields.flowOut) ? null : fl,
        salesEarly: (fields.salesEarly || fields.salesLate) ? this.numBiz(r[fields.salesEarly]) : this.numBiz(r[fields.sales]),
        salesLate: (fields.salesEarly || fields.salesLate) ? this.numBiz(r[fields.salesLate]) : 0,
        meituan: this.numBiz(r[fields.meituan]),
        taobao: this.numBiz(r[fields.taobao]),
        mini: this.numBiz(r[fields.mini])
      });
    });
    if(!out.length){ toast('没有可导入的有效日期行（请检查日期列格式，如 2026-08-01）', false); return; }
    this._bizImport = out;
    const LABEL = {flow: '人流量', sales: '营业额', meituan: '美团单量', taobao: '淘宝闪购单量', mini: '小程序单量'};
    const mapTxt = ['日期→' + fields.date]
      .concat((fields.flowIn || fields.flowOut) ? ['进店/出店→' + (fields.flowIn || '(空)') + '/' + (fields.flowOut || '(空)')] : [])
      .concat(['flow', 'sales', 'meituan', 'taobao', 'mini'].filter(f => fields[f]).map(f => LABEL[f] + '→' + fields[f])).join('；');
    const sample = out.slice(0, 8).map(r =>
      '<tr><td>' + r.date + '</td><td>' + this.bizFlow(r) + '</td><td>' + this.bizSales(r) + '</td><td>' + r.meituan + '</td><td>' + r.taobao + '</td><td>' + r.mini + '</td></tr>').join('');
    openModal('<h3>📥 确认导入经营数据</h3>' +
      '<div class="hint">识别到 <b>' + out.length + '</b> 行有效数据（已忽略无日期的行）。列映射：' + mapTxt + '。导入后随云端全店共享。</div>' +
      '<div class="add-row"><label class="chk-row"><input autocomplete="off" type="checkbox" id="biz-ov" checked> 覆盖同名日期已有数据（取消则只新增、不改动已填日期）</label></div>' +
      '<div style="max-height:220px;overflow:auto"><table class="biz-table"><thead><tr><th>日期</th><th>人流量</th><th>营业额</th><th>美团</th><th>淘宝闪购</th><th>小程序</th></tr></thead><tbody>' +
      sample + (out.length > 8 ? '<tr><td colspan="6" class="empty">…仅显示前 8 行</td></tr>' : '') + '</tbody></table></div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="WorkMod.confirmBizImport(WorkMod._bizImport, document.getElementById(\'biz-ov\').checked)">导入 ' + out.length + ' 行</button></div>');
  },
  confirmBizImport(rows, overwrite){
    const w = Store.get('work'); if(!w.biz) w.biz = {};
    let added = 0, updated = 0;
    rows.forEach(r => {
      const exists = !!w.biz[r.date];
      if(exists && !overwrite) return;
      const rec = {salesEarly: r.salesEarly, salesLate: r.salesLate, meituan: r.meituan, taobao: r.taobao, mini: r.mini};
      if(r.flowIn != null || r.flowOut != null){ rec.flowIn = r.flowIn || 0; rec.flowOut = r.flowOut || 0; }
      else { rec.flow = r.flow || 0; }
      w.biz[r.date] = rec;
      if(exists) updated++; else added++;
    });
    Store.markDirty('work'); closeModal(); this.render();
    toast('已导入：新增 ' + added + ' 天，更新 ' + updated + ' 天');
  },
  mapBizField(header){
    const h = String(header == null ? '' : header).toLowerCase().replace(/\s/g, '');
    if(/日期|时间/.test(h) && !/星期|周/.test(h)) return 'date';
    if(/进店|进场|入店|客流入/.test(h)) return 'flowIn';
    if(/出店|出场|离店|客流出/.test(h)) return 'flowOut';
    if(/人流量|客流|到店|flow|客流量/.test(h)) return 'flow';
    if(/早班/.test(h) && /营业额/.test(h)) return 'salesEarly';
    if(/晚班/.test(h) && /营业额/.test(h)) return 'salesLate';
    if(/营业额|营收|销售额|销售|金额|sales/.test(h)) return 'sales';
    if(/美团/.test(h)) return 'meituan';
    if(/淘宝/.test(h)) return 'taobao';
    if(/小程序/.test(h)) return 'mini';
    return null;
  },
  numBiz(v){
    if(v == null || v === '') return 0;
    if(typeof v === 'number') return Math.max(0, v);
    let s = String(v).replace(/[^\d.\-]/g, '');
    if(s === '' || s === '-' || s === '.') return 0;
    const n = parseFloat(s);
    return isNaN(n) ? 0 : Math.max(0, n);
  },
  normBizDate(v){
    if(v == null || v === '') return null;
    if(typeof v === 'number'){
      const d = new Date((v - 25569) * 86400000);
      return isNaN(d) ? null : fmtDate(d);
    }
    let s = String(v).trim();
    let m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if(m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
    m = s.match(/(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
    if(m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
    m = s.match(/(\d{1,2})[/\-](\d{1,2})/);
    if(m){ const y = new Date().getFullYear(); return y + '-' + pad2(+m[1]) + '-' + pad2(+m[2]); }
    return null;
  },
  downloadBizTemplate(){
    const aoa = [
      ['日期', '进店', '出店', '早班营业额', '晚班营业额', '美团单量', '淘宝闪购单量', '小程序单量'],
      ['2026-08-01', 120, 110, 1500, 900, 30, 15, 40],
      ['2026-08-02', 135, 128, 1600, 1080, 35, 18, 52]
    ];
    // 优先用 XLSX 生成真正的 .xlsx；若库未加载（如网络受限），自动兜底为 CSV
    if(typeof XLSX !== 'undefined'){
      try {
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.writeFile(ws, '经营数据导入模板.xlsx');
        toast('已下载 Excel 导入模板');
        return;
      } catch(e){ /* 落到 CSV 兜底 */ }
    }
    const csv = '﻿' + aoa.map(r => r.join(',')).join('\r\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '经营数据导入模板.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已下载 CSV 导入模板（Excel 可双击打开）');
  },
  // ===== 周分析（以「周五」为界：上周六 ~ 这周五）=====
  weekRange(){
    if(this.weekCustomStart){
      const start = parseDate(this.weekCustomStart);
      const len = Math.max(1, Math.min(31, this.weekCustomLen || 7));
      return {start: fmtDate(start), end: fmtDate(addDays(start, len - 1)), custom: true, label: '自定义（' + len + '天）'};
    }
    const thisFri = fridayEnd(new Date());
    const end = addDays(thisFri, this.weekOffset * 7);   // 这周五（按周偏移）
    const start = addDays(end, -6);                       // 向前 6 天 = 上周六
    let label = '本周';
    if(this.weekOffset < 0) label = '上' + Math.abs(this.weekOffset) + '周';
    else if(this.weekOffset > 0) label = '下' + this.weekOffset + '周';
    return {start: fmtDate(start), end: fmtDate(end), custom: false, label};
  },
  bizWeekAnalyze(start, end){
    const w = Store.get('work'); const biz = w.biz || {};
    const days = [];
    let cur = parseDate(start), e = parseDate(end);
    let flow = 0, sales = 0, meituan = 0, taobao = 0, mini = 0;
    let maxDay = '', minDay = '', maxS = -1, minS = 1e18;
    while(cur <= e){
      const k = fmtDate(cur);
      const r = biz[k];
      const fl = r ? this.bizFlow(r) : 0;
      const sa = r ? this.bizSales(r) : 0;
      const mt = r ? (+r.meituan || 0) : 0;
      const tb = r ? (+r.taobao || 0) : 0;
      const mn = r ? (+r.mini || 0) : 0;
      const has = !!r;
      const orders = mt + tb + mn;
      if(has){ flow += fl; sales += sa; meituan += mt; taobao += tb; mini += mn;
        if(sa > maxS){ maxS = sa; maxDay = k; }
        if(sa < minS){ minS = sa; minDay = k; } }
      days.push({date: k, has, flow: fl, sales: sa, meituan: mt, taobao: tb, mini: mn, orders});
      cur = addDays(cur, 1);
    }
    const dayCount = days.filter(d => d.has).length;
    return {start, end, dayCount, flow, sales, meituan, taobao, mini, orders: meituan + taobao + mini, days, maxDay, minDay, maxS, minS};
  },
  bizWeekSummary(a){
    if(!a.dayCount) return '<div class="empty">该周期（' + a.start + ' ~ ' + a.end + '）暂无填报数据</div>';
    const avgSales = a.sales / a.dayCount, avgFlow = a.flow / a.dayCount;
    const unit = a.flow ? a.sales / a.flow : 0;
    const pct = (x, t) => t ? Math.round(x / t * 100) : 0;
    const stat = (label, val) => '<div class="stat"><b>' + val + '</b><span>' + label + '</span></div>';
    const rows = a.days.filter(d => d.has).map(d =>
      '<tr><td>' + d.date + '</td><td>' + weekdayCn(d.date).replace('星期', '周') + '</td><td>' + d.flow + '</td><td>' + moneyFmt(d.sales) + '</td><td>' + d.meituan + '</td><td>' + d.taobao + '</td><td>' + d.mini + '</td><td>' + d.orders + '</td><td>' + moneyFmt(d.flow ? d.sales / d.flow : 0) + '</td></tr>'
    ).join('') || '<tr><td colspan="9" class="empty">暂无数据</td></tr>';
    return '<div class="stat-grid">' +
      stat('有数据天数', a.dayCount + ' 天') +
      stat('总营业额', moneyFmt(a.sales)) +
      stat('日均营业额', moneyFmt(avgSales)) +
      stat('总人流量', a.flow) +
      stat('日均人流量', Math.round(avgFlow)) +
      stat('客单价', moneyFmt(unit)) +
      stat('总单量', a.orders) +
      stat('外卖日均单量', (a.dayCount ? (a.orders / a.dayCount).toFixed(1) : '0') + ' 单') +
      stat('美团单量', a.meituan) +
      stat('淘宝闪购单量', a.taobao) +
      stat('小程序单量', a.mini) +
      '</div>' +
      '<div class="hint">各渠道单量占比：美团 ' + pct(a.meituan, a.orders) + '% · 淘宝闪购 ' + pct(a.taobao, a.orders) + '% · 小程序 ' + pct(a.mini, a.orders) + '%（共 ' + a.orders + ' 单）。' +
      (a.maxDay ? '周期营业额最高：' + a.maxDay + '（' + moneyFmt(a.maxS) + '）；最低：' + a.minDay + '（' + moneyFmt(a.minS) + '）。' : '') + '</div>' +
      '<table class="biz-table"><thead><tr><th>日期</th><th>星期</th><th>人流量</th><th>营业额</th><th>美团</th><th>淘宝闪购</th><th>小程序</th><th>总单量</th><th>客单价</th></tr></thead><tbody>' + rows + '</tbody></table>';
  },
  renderBizWeek(){
    const r = this.weekRange();
    const a = this.bizWeekAnalyze(r.start, r.end);
    const nav = '<button class="btn sm" onclick="WorkMod.weekOffset--;WorkMod.weekCustomStart=\'\';WorkMod.render()">◀ 上周</button>' +
      '<button class="btn sm ghost" onclick="WorkMod.weekOffset=0;WorkMod.weekCustomStart=\'\';WorkMod.render()">本周</button>' +
      '<button class="btn sm" onclick="WorkMod.weekOffset++;WorkMod.weekCustomStart=\'\';WorkMod.render()">下周 ▶</button>';
    const customRow = '<div class="add-row"><label>自定义起始日期<input autocomplete="off" type="date" value="' + esc(this.weekCustomStart) + '" onchange="WorkMod.weekCustomStart=this.value;WorkMod.render()"></label>' +
      '<label>天数<input autocomplete="off" type="number" min="1" max="31" value="' + this.weekCustomLen + '" onchange="WorkMod.weekCustomLen=Math.max(1,Math.min(31,+this.value||7));WorkMod.render()"></label>' +
      (this.weekCustomStart ? '<button class="btn sm ghost" onclick="WorkMod.weekCustomStart=\'\';WorkMod.render()">取消自定义</button>' : '') + '</div>';
    const hint = r.custom ? '' : '<div class="hint">固定以「周五」为周界（上周六 ~ 这周五）。也可上方选择自定义起始日期与天数。</div>';
    return '<div class="card biz-week"><h3>📆 周分析 · ' + r.label + ' <span class="tag">' + r.start + ' ~ ' + r.end + '</span></h3>' +
      '<div class="date-nav">' + nav + '</div>' + hint + customRow + this.bizWeekSummary(a) + '</div>';
  },
  toggle(key, i){
    const log = this.log(this.selDate);
    log[key][i] = !log[key][i];
    Store.markDirty('work'); this.render();
  },
  // 固定日期弹窗提醒（每天每台设备只弹一次）
  checkReminder(){
    const t = todayStr();
    const sp = this.specialFor(t);
    if(!sp.labels.length) return;
    const flag = 'tcmws_remind_' + t;
    if(localStorage.getItem(flag)) return;
    localStorage.setItem(flag, '1');
    const txt = x => (x && x.t != null) ? x.t : x;
    const list = []
      .concat(sp.early.map(x => '【早班】' + txt(x)))
      .concat(sp.late.map(x => '【晚班】' + txt(x)));
    if(sp.monthly.length){
      list.push('—— 每月固定任务由 ' + sp.monthlyStaff + '（' + (sp.monthlyShift || '未排班') + '）负责，已排入' +
        (sp.monthlyTarget === 'late' ? '晚班' : '早班') + ' ——');
    }
    speak('提醒：今天有固定任务，请打开工作台查看并完成。');
    openModal('<h3>🔔 今日固定任务提醒（' + sp.labels.join('、') + '）</h3>' +
      '<div class="remind-list">' + list.map(x => '<div class="remind-item">• ' + esc(x) + '</div>').join('') + '</div>' +
      '<div class="modal-btns"><button class="btn" onclick="closeModal();Nav.go(\'work\')">去完成 →</button></div>');
  },
  // 提醒项目「每日重新打卡」弹窗：每天 8:00 起提示，未完成每 30 分钟再次提醒
  remindersAllDoneToday(){
    const w = Store.get('work'); if(!w.reminders) return true;
    const list = w.reminders.filter(r => !r.del);
    return list.length > 0 && list.every(r => this.isDoneToday(r));
  },
  checkRemindCheckin(){
    if($('#modal-mask')) return;               // 不打断其它弹窗
    const now = new Date();
    if(now.getHours() < 8) return;             // 早 8 点前不弹
    const w = Store.get('work');
    if(!w.reminders || !w.reminders.length) return;
    const list = w.reminders.filter(r => !r.del);
    if(!list.length) return;
    // 仅对「今天应提醒且未完成打卡」的项弹窗（按 每天 / 每周几 / 具体日期 判定）
    const pending = list.filter(r => this.isActiveToday(r) && !this.isDoneToday(r));
    if(!pending.length) return;                // 今日应打卡项已全部完成
    const t = Date.now();
    const key = 'tcmws_remind_checkin_last';
    let last = null;
    try { last = JSON.parse(localStorage.getItem(key) || 'null'); } catch(e){}
    if(last && last.date === todayStr() && (t - last.ts) < 30 * 60 * 1000) return; // 30 分钟内不重复
    localStorage.setItem(key, JSON.stringify({date: todayStr(), ts: t}));
    const texts = pending.map(r => esc(r.text) + ' <em class="tag">' + (r.repeat === 'week' ? WK[now.getDay()] : (r.repeat === 'date' ? r.date : '每天')) + '</em>');
    if('Notification' in window && Notification.permission === 'granted'){
      try { new Notification('🔔 提醒项目待打卡', {body: '今日还有 ' + pending.length + ' 项未完成，点开工作台去打卡'}); } catch(e){}
    }
    speak('提醒：今日还有 ' + pending.length + ' 项打卡未完成，请尽快打卡。');
    openModal('<h3>🔔 今日提醒项目待打卡</h3>' +
      '<div class="hint">每天需重新打卡完成，今日还有 <b>' + pending.length + '</b> 项未完成：</div>' +
      '<div class="remind-list">' + texts.map(x => '<div class="remind-item">• ' + x + '</div>').join('') + '</div>' +
      '<div class="modal-btns">' +
      '<button class="btn ghost" onclick="closeModal()">稍后</button>' +
      '<button class="btn" onclick="closeModal();Nav.go(\'work\')">去打卡 →</button></div>');
  },
  // ===== 可编辑内容（早/晚班、每月固定任务）=====
  editContent(field, title){
    this._editField = field; this._editTitle = title;
    const w = Store.get('work');
    const cur = (w[field] && w[field].length) ? w[field] : this.content()[field];
    openModal('<h3>✎ 编辑' + title + '</h3>' +
      '<div class="hint">每行一项，保存后全店即时同步</div>' +
      '<textarea id="cc-ta" rows="8" style="width:100%;box-sizing:border-box">' + esc(cur.join('\n')) + '</textarea>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">取消</button>' +
      '<button class="btn" onclick="WorkMod.saveContent()">保存</button></div>');
  },
  saveContent(){
    const field = this._editField, title = this._editTitle;
    const w = Store.get('work');
    const lines = $('#cc-ta').value.split('\n').map(s => s.trim()).filter(s => s);
    if(!lines.length){ toast('至少保留一项', false); return; }
    w[field] = lines; Store.markDirty('work'); closeModal(); this.render(); toast('已保存' + title);
  },
  editMonthly(){
    this.editContent('monthlyTasks', '每月固定任务');
  },
  // ===== 早班/晚班进度提醒：早班未完→中午12点；晚班未完→晚上6点（每天各一次）=====
  checkShiftReminder(){
    if($('#modal-mask')) return;
    const now = new Date();
    this.maybeShiftPop(now, 'early', 12);
    this.maybeShiftPop(now, 'late', 18);
  },
  maybeShiftPop(now, key, hour){
    const flag = 'tcmws_shift_' + key + '_' + todayStr();
    if(localStorage.getItem(flag)) return;       // 当天已处理过（弹过或已跳过）
    if(now.getHours() < hour) return;           // 还没到提醒时间
    localStorage.setItem(flag, '1');
    if(!this.shiftStats(key).complete) this.popShift(key, hour === 12 ? '中午12点' : '晚上6点');
  },
  popShift(key, when){
    const label = key === 'early' ? '早班' : '晚班';
    const st = this.shiftStats(key);
    if('Notification' in window && Notification.permission === 'granted'){
      try { new Notification('⏰ ' + label + '待完成提醒', {body: when + '，今日' + label + '还有 ' + st.pending.length + ' 项未完成'}); } catch(e){}
    }
    speak('提醒：' + when + '，今日' + label + '还有 ' + st.pending.length + ' 项未完成，请尽快处理。');
    openModal('<h3>⏰ ' + when + ' · ' + label + '进度提醒</h3>' +
      '<div class="hint">今日' + label + '还有 <b>' + st.pending.length + '</b> 项未完成，请尽快处理：</div>' +
      '<div class="remind-list">' + st.pending.map(x => '<div class="remind-item">• ' + esc(x) + '</div>').join('') + '</div>' +
      '<div class="modal-btns"><button class="btn ghost" onclick="closeModal()">稍后</button>' +
      '<button class="btn" onclick="closeModal();Nav.go(\'work\')">去处理 →</button></div>');
  }
};
