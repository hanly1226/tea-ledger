'use strict';
// ============ 导航与启动 ============
const Nav = {
  cur: 'work',
  MODS: {
    todo:    {label: '待办事项', icon: '📋', mod: () => TodoMod},
    work:    {label: '工作进度', icon: '🧹', mod: () => WorkMod},
    wellness:{label: '节气养生', icon: '🌿', mod: () => WellMod},
    match:   {label: '体质匹配', icon: '🧭', mod: () => MatchMod},
    products:{label: '产品资料', icon: '📚', mod: () => ProdMod},
    ledger:  {label: '运营台账', icon: '📒', mod: () => LedgerMod},
    schedule:{label: '排班表',   icon: '🗓️', mod: () => SchedMod},
    memo:    {label: '备忘录',   icon: '📝', mod: () => MemoMod},
    finance: {label: '财务账本', icon: '💰', mod: () => FinMod},
    ai:      {label: 'AI助手',  icon: '🤖', mod: () => AiMod}
  },
  go(key){
    this.cur = key;
    $$('.nav-item').forEach(n => n.classList.toggle('on', n.dataset.key === key));
    this.MODS[key].mod().render();
  },
  renderSidebar(){
    $('#nav').innerHTML = Object.keys(this.MODS).map((k, i) =>
      '<div class="nav-item' + (k === this.cur ? ' on' : '') + '" data-key="' + k + '" onclick="Nav.go(\'' + k + '\')">' +
      '<span class="nav-num">' + (i + 1) + '</span><span class="nav-icon">' + this.MODS[k].icon + '</span>' +
      '<span class="nav-label">' + this.MODS[k].label + '</span></div>').join('');
  }
};

// 云端有更新时：如当前正在查看对应模块则自动刷新界面
Store.onRemote = function(shard){
  const map = {todo: 'todo', work: 'work', wellness: 'wellness', products: 'products', ledger: 'ledger', schedule: 'schedule', memo: 'memo', finance: 'finance'};
  toast('☁️ 已同步到其他人的最新修改');
  if(map[shard] === Nav.cur || (shard === 'products' && (Nav.cur === 'match' || Nav.cur === 'wellness'))){
    if(!document.querySelector('#modal-mask')) Nav.go(Nav.cur);
  }
};

function defaults(){
  return {
    todo: {items: []},
    work: {logs: {}},
    wellness: {archive: []},
    products: {items: TCM_DATA.DEFAULT_PRODUCTS.map(p => Object.assign({del: false}, p))},
    ledger: {linfang: [], sales: [], reception: [], bracelet: [], commission: []},
    schedule: {overrides: {}, intern: {}},
    settings: {},
    memo: {items: []},
    finance: {items: [], incomeCats: ['支付宝','微信','挂号','食堂卡','小程序','美团','淘宝闪购','院内接待','其他'], expenseCats: ['进货','房租','工资','水电燃气','设备维修','办公杂费','提成','其他支出']}
  };
}

// 云端刷新：先把本地未保存改动推上云，再以云端为准强制刷新（保证点击刷新一定显示最新）
async function AppCloudRefresh(){
  const btn = document.getElementById('cloud-refresh');
  if(btn) btn.classList.add('spin');
  const done = () => { if(btn) setTimeout(() => btn.classList.remove('spin'), 600); };
  try {
    await Store.flushDirty();   // 先推送本地未保存改动
    await Store.pullAll(true);  // 再以云端最新为准强制刷新
    if(!document.querySelector('#modal-mask')) Nav.go(Nav.cur);
    toast('☁️ 已刷新云端最新数据');
    setSyncUI('ok');
  } catch(e){
    toast('刷新失败，请检查网络后重试', false);
  }
  done();
}

window.addEventListener('DOMContentLoaded', async () => {
  $('#shop-name').textContent = TCM_CONFIG.shopName;
  Store.init(defaults());
  // 迁移：旧版仅存本机的 AI 配置 → 云端共享（填一次全店通用）
  if(typeof AiMod !== 'undefined' && AiMod.migrateLegacy) AiMod.migrateLegacy();
  Nav.renderSidebar();
  Nav.go('work');
  // 首次拉取云端（云端有更新时自动覆盖并刷新）
  await Store.pullAll();
  // 定时轮询云端 → 消息即时自动同步，每个人打开都能看到最新内容
  setInterval(() => Store.pullAll(), TCM_CONFIG.pollInterval);
  // 页面重新获得焦点时立即同步一次
  document.addEventListener('visibilitychange', () => { if(!document.hidden) Store.pullAll(); });
  // 固定日期弹窗提醒（每周一、每月1/15/25日）
  setTimeout(() => WorkMod.checkReminder(), 800);
  // 提醒项目「每天重新打卡」弹窗：8 点起提示，未完成每 30 分钟再提示
  setTimeout(() => WorkMod.checkRemindCheckin(), 1000);
  setInterval(() => WorkMod.checkRemindCheckin(), 60000);
  // 早班/晚班进度提醒：早班未完→中午12点弹窗；晚班未完→晚上6点弹窗（每天各一次）
  setTimeout(() => WorkMod.checkShiftReminder(), 1100);
  setInterval(() => WorkMod.checkShiftReminder(), 60000);
  // 运营台账提醒：每周一未付款订单 + 配送前3天起每日待配送（进入台账或每日启动触发）
  setTimeout(() => LedgerMod.checkReminders(), 1200);
  setInterval(() => LedgerMod.checkReminders(), 60000);
  // 首次交互时申请系统通知权限（用于桌面/手机系统级弹窗提醒）
  document.addEventListener('click', function reqNotif(){
    if('Notification' in window && Notification.permission === 'default'){ Notification.requestPermission().catch(() => {}); }
  }, {once: true});
  // 预热语音引擎，使弹窗提醒可即时朗读
  if('speechSynthesis' in window){ try { window.speechSynthesis.getVoices(); } catch(e){} }
  // 节气文案：打开时已过7:30自动补生成；页面开启状态下到点自动生成
  setTimeout(() => WellMod.autoCheck(), 1500);
  setInterval(() => WellMod.autoCheck(), 60000);
  // 顶部日期时钟
  const clock = () => {
    const n = new Date();
    const term = WellMod.getTerm(todayStr());
    $('#top-date').textContent = fmtDate(n) + ' ' + weekdayCn(fmtDate(n)) + ' · ' + (term ? term.name : '') +
      ' · ' + pad2(n.getHours()) + ':' + pad2(n.getMinutes());
  };
  clock(); setInterval(clock, 15000);
  // 注册 Service Worker：手机端「添加到主屏幕」即可像 App 一样全屏使用
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
});
