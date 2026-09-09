'use strict';
// 云端同步配置（textdb.online 免费文本存储，固定键名，本地缓存可自动恢复云端数据）
window.TCM_CONFIG = {
  shopName: '中医养生茶饮',
  city: '灌云',
  // 灌云县坐标（用于天气获取，Open-Meteo 免费接口）
  lat: 34.30, lon: 119.25,
  cloudBase: 'tcmgy_ws_v1_',
  readUrl: function (k) { return 'https://textdb.online/' + k; },
  updateUrl: 'https://textdb.online/update',
  pollInterval: 2000,    // 每2秒拉取云端最新数据（团队多人实时同步）
  pushDebounce: 1200     // 修改后1.2秒内合并推送
};
