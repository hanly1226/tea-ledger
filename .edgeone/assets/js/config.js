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
  pushDebounce: 1200,    // 修改后1.2秒内合并推送
  // 月饼门店台账「立即同步」按需函数（EdgeOne Makers Cloud Function，已部署并验证服务端可用）
  // 说明：EdgeOne Makers 项目带「访问网关」，浏览器无法跨域调用其函数 API 路由（一律 401），
  // 故当前前端走兜底——点击按钮即从云端 textdb 拉取「最新快照」；云端数据由定时自动化
  // 「每小时」从金山文档同步一次（调度器最小粒度即每小时，EdgeOne 云函数不支持 cron 触发器）。
  // 若未来为该函数绑定已备案自定义域名（解除访问网关），把下方 url 换成公开地址（不含 eo_token），
  // 前端即会自动改为「点击 → 函数即时同步」的秒级方案。
  mooncakeSync: {
    url: 'https://mooncake-sync-tk6fpa2x.edgeone.cool/api/sync-mooncake?eo_token=457176588070d263f05679cee0be0285&eo_time=1788968625',
    secret: '632bf6e288a57cccf1a55d942828264a0ca51d1195e9e409'
  }
};
