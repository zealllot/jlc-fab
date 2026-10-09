// 探一遍平台现状：模块可用性、导入入口、core API、接口清单、材料库。
// 在 xc.jlcfa.com/free-design 打开设计器后整段执行，把输出和 SKILL.md 的基线对比。
// 任何一项对不上，都说明平台动过了 —— 先按新情况调整方案，再回来更新 skill。
// 注意：第 1 段会逐个点开左侧模块，会改动界面状态。在新建的空白稿上跑，
// 或者跑完刷新页面再开始建模。

async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const f = document.querySelector('iframe');
  if (!f) return { err: 'no iframe' };
  const d = f.contentDocument, w = f.contentWindow;
  const out = { 探测时间: new Date().toISOString().slice(0, 10) };

  // 裸 el.click() 对一部分按钮无声失败（React handler 挂在 pointer 事件上）。
  // 事件构造函数必须取自 iframe 的 window，否则被当成跨 realm 对象。
  const fire = el => { const rc = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: w,
                clientX: rc.left + rc.width / 2, clientY: rc.top + rc.height / 2 };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t =>
      el.dispatchEvent(new (t.startsWith('pointer') ? w.PointerEvent : w.MouseEvent)(t, o))); };

  // ---- 1. 左侧模块：哪些还标着"开发中" ----
  // 基线：2026-09-01 只有「铝型材」可用，其余标「开发中」；2026-09-19 再看标记已不在。
  // 但标签说明不了能力边界 —— 面板/孔标着开发中时注入照样计价，板材挂孔界面正常却不计价。
  // 真要确认某道工序，注入一个再看加工费动没动，别看这里的标签。
  // 顶部工具栏的「编辑连接件 → 一键生成连接件」不受此限，一直可用。
  const MODULES = ['铝型材', '连接件', '打孔加工', '面板', '门', '抽屉', '其他配件'];
  out.模块 = {};
  for (const m of MODULES) {
    const tab = [...d.querySelectorAll('*')].find(e => e.children.length === 0 &&
      e.textContent.trim() === m && e.offsetParent);
    if (!tab) { out.模块[m] = '没找到入口'; continue; }
    fire(tab); await sleep(1200);
    out.模块[m] = /开发中/.test(d.body.innerText) ? '开发中' : '可用';
  }

  // ---- 2. 导入入口：出现了就不用再走注入 ----
  // 基线：「更多」里只有 分享设计稿/开源设计稿/我的设计稿/官网/偏好设置，没有导入。
  const more = [...d.querySelectorAll('*')].find(e => e.children.length === 0 &&
    e.textContent.trim() === '更多' && e.offsetParent);
  if (more) { fire(more); await sleep(1000); }
  out.更多菜单 = [...d.querySelectorAll('li,div,span')]
    .filter(e => e.offsetParent && e.children.length === 0)
    .map(e => e.textContent.trim())
    .filter(t => t && t.length < 12 && /导入|设计稿|官网|偏好|开源|分享|STEP|上传/.test(t));
  out.有导入入口 = out.更多菜单.some(t => /导入|上传|STEP/.test(t));

  // ---- 3. core 的 API 面：注入脚本依赖这些，少了就要改 ----
  const core = w.__CORE__;
  if (core) {
    const meths = o => { const s = new Set(); let p = o;
      while (p && p !== Object.prototype) { Object.getOwnPropertyNames(p).forEach(n => s.add(n)); p = Object.getPrototypeOf(p); }
      return [...s].filter(k => !/^(__|constructor|hasOwnProperty|isPrototypeOf|propertyIsEnumerable|toString|valueOf|toLocaleString)/.test(k)); };
    const NEED = {
      'document.manager': ['getAllEntities', 'addEntity', 'delEntityById', 'updateEntity'],
      'IOHelper': ['getDocument', 'ensureAllAssets'],
      'documentGroup': ['onEntityAdded', 'onEntityDeleted', 'onEntityUpdated', 'getEntityObjectById'],
      'bomHelper': ['generateBomInfo'],   // computeSpecification 已于 2026-09-18 被移除
    };
    const got = {
      'document.manager': meths(core.document.manager),
      'IOHelper': meths(core.IOHelper),
      'documentGroup': meths(core.documentVisual.documentGroup),
      'bomHelper': meths(core.bomHelper),
    };
    out.core缺失 = {};
    for (const [k, need] of Object.entries(NEED)) {
      const miss = need.filter(n => !got[k].includes(n));
      if (miss.length) out.core缺失[k] = miss;
    }
    out.core正常 = Object.keys(out.core缺失).length === 0;
    // 移除过的 API 又回来了，同样是平台动过的信号
    if (got.bomHelper.includes('computeSpecification')) out.回归的API = ['bomHelper.computeSpecification'];
    // 新增的方法往往就是新功能的入口
    out.core方法数 = Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.length]));
  } else {
    out.core = '未挂载，先跑 fa-inject.js 的第 1 段';
  }

  // ---- 4. 接口清单：扫 bundle 里所有 /api/fa-platform 路径，新路径 = 新功能 ----
  const KNOWN = new Set(['profile-draft/list', 'profile-draft/example', 'profile-draft/free-save',
    'profile-draft/file-upload', 'profile-draft/step-file/check', 'profile-draft/template-draft-visible',
    'profile-draft/delete', 'file/get-upload-url', 'file/update-file-status',
    'profile/cad/section', 'profile/cad/texture', 'profile/cad/connector',
    'profile/product/attachment-url', 'customer/preference',
    'web/detail-page/quotation/query-lite']);
  const paths = new Set();
  for (const s of [...d.querySelectorAll('script[src]')].map(x => x.src)) {
    let t; try { t = await (await fetch(s)).text(); } catch (e) { continue; }
    for (const m of t.matchAll(/\/api\/fa-platform\/([a-z0-9\-/]{4,60})/gi)) paths.add(m[1]);
  }
  out.新接口 = [...paths].filter(p => !KNOWN.has(p)).sort();
  out.接口总数 = paths.size;

  return out;
}
