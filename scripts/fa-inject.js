// 往嘉立创型材设计器注入实体的模板。
// 用 chrome-devtools 的 evaluate_script 整段执行；页面是 xc.jlcfa.com/free-design。
// 按需删掉用不到的部分：找 core → 建实体 → 写入 → 校验 → 保存。

async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const f = document.querySelector('iframe');
  if (!f) return { err: 'no iframe' };
  const d = f.contentDocument;

  // ---- 1. 拿 core（缓存在 contentWindow.__CORE__，刷新后会丢） ----
  let core = f.contentWindow.__CORE__;
  if (!core) {
    const cvs = d.querySelector('canvas');
    if (!cvs) return { err: 'no canvas，页面还没加载完' };
    let el = cvs, fk = null, host = null;
    while (el && !fk) { fk = Object.keys(el).find(k => k.startsWith('__reactFiber$')); if (fk) host = el; else el = el.parentElement; }
    let fb = host[fk], depth = 0;
    while (fb && depth < 80 && !core) {
      if (fb.memoizedProps) for (const k of Object.keys(fb.memoizedProps)) {
        const v = fb.memoizedProps[k];
        if (v && typeof v === 'object') {
          if (v.document && v.document.manager && v.IOHelper) core = v;
          else if (v.core && v.core.document && v.core.document.manager && v.core.IOHelper) core = v.core;
        }
        if (core) break;
      }
      fb = fb.return; depth++;
    }
    if (!core) return { err: 'core not found' };
    f.contentWindow.__CORE__ = core;
  }
  const mgr = core.document.manager, dg = core.documentVisual.documentGroup;

  // ---- 2. 几何小工具 ----
  const V = (x, y, z) => ({ x, y, z });
  const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  // 由三个正交单位轴（作为列向量）构造四元数
  function quat(u, v, n) {
    const m00 = u.x, m01 = v.x, m02 = n.x, m10 = u.y, m11 = v.y, m12 = n.y, m20 = u.z, m21 = v.z, m22 = n.z;
    const tr = m00 + m11 + m22; let x, y, z, w;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
    return { isQuaternion: true, _x: x, _y: y, _z: z, _w: w };
  }
  const nid = () => { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    return Array.from(crypto.getRandomValues(new Uint8Array(21))).map(b => c[b & 63]).join(''); };

  // ---- 3a. Profile：一根型材。sp/ep 是轴线两端（端面中心），2020 截面绕轴线 ±10 ----
  function profile(name, sp, ep) {
    return { id: nid(), type: 'Profile',
      quaternion: { isQuaternion: true, _x: 0, _y: 0, _z: 0, _w: 1 },
      visible: true, opacity: 0.3, lock: false,
      name, productName: name, version: '1.0',
      sp, ep, logicSp: { ...sp }, logicEp: { ...ep },
      worldQuaternion: { isQuaternion: true, _x: 0, _y: 0, _z: 0, _w: 1 },
      sectionId: '1488216301085844', materialId: '1375666316970598',
      materialName: '本色(喷砂氧化)', model: 'TXCJ-2020',
      classificationEnCode: '20mm', shapeCenter: { x: 10, y: 10 },
      dxfMin: { x: 0.01, y: 0.01 },
      spAutoGenConnector: true, epAutoGenConnector: true };
  }

  // ---- 3b. Panel：一块板。u/v 是板面两个方向，法向 n = u×v ----
  //      pos 在板面内(u,v)是中心，在厚度方向是 -n 侧的表面：板从 pos 沿 +n 长出 T。
  //      例：层板搁在 y=20 的横梁顶面上、法向朝上 → pos.y 写 20，板占 20..38。
  //      drawType: 'Flush' 贴合面与型材外表面齐平 / 'Overlay' 叠在型材上
  const WOOD = { specId: '1588904263988966', materialId: '1137671796893973',
    materialName: '多层板 原木色', model: 'DCB-A', materialModel: 'BC-DCB-YMS', productName: '多层胶合板' };
  function panel(name, drawType, L, W, T, pos, u, v, mat = WOOD) {
    const n = cross(u, v), hl = L / 2, hw = W / 2;
    const pts = [{ x: -hl, y: -hw }, { x: hl, y: -hw }, { x: hl, y: hw }, { x: -hl, y: hw }];
    return { id: nid(), type: 'Panel',
      quaternion: { isQuaternion: true, _x: 0, _y: 0, _z: 0, _w: 1 },
      visible: true, opacity: 1, lock: false, name, version: '1.0', drawType, ...mat,
      length: L, width: W, thickness: T,
      originalContour: { vertices: pts.map(p => ({ ...p })), edges: pts.map(() => ({ type: 'line' })), holes: [] },
      editorOutline: { vertices: pts.map(p => ({ ...p })), edges: pts.map(() => ({ type: 'line' })), holes: [], vertexOps: [], edgeOps: [] },
      editedContour: pts.map(p => ({ ...p })), isRectangle: true, triangleIndices: [],
      position: pos, worldQuaternion: quat(u, v, n), thicknessAnchorN: 0.5,
      uAxis: u, vAxis: v, rotationAngle: 0,
      sizeRange: { minWidth: 100, maxWidth: 2440, minHeight: 100, maxHeight: 1220 } };
  }

  // ---- 4. 造件 ----
  // 示例：深(x) 400 × 宽(z) 600 × 高(y) 900 的置物架，一层层板 + 一块侧板。
  // 每一行后面的注释是验算，照着改尺寸时把验算一起改，这是唯一能在下单前发现偏移的办法。
  const P = [];

  // 4 根立柱，轴线内缩 10（截面 ±10）→ 外廓 x 0..400、z 0..600 = 标称 400 深 600 宽
  [[10, 10], [10, 590], [390, 10], [390, 590]].forEach(([x, z]) =>
    P.push(profile('2020铝型材', V(x, 0, z), V(x, 900, z))));

  // 横梁端点抵在立柱内表面：x 向从 20 到 380（长 360），z 向从 20 到 580（长 560）
  // 三个高度的轴线 y = 10 / 450 / 890 → 截面分别占 0..20、440..460、880..900
  [10, 450, 890].forEach(y => {
    [10, 390].forEach(x => P.push(profile('2020铝型材', V(x, y, 20), V(x, y, 580))));   // 沿宽，长 560
    [10, 590].forEach(z => P.push(profile('2020铝型材', V(20, y, z), V(380, y, z))));   // 沿深，长 360
  });

  // 层板：压在中层横梁顶面（y=460）上，x 跨满 0..400 才有搭接面；Overlay = 叠在型材上
  // u=(0,0,1) 长 560 沿 z：300±280 → z 20..580 ✓ 让开立柱
  // v=(1,0,0) 宽 400 沿 x：200±200 → x 0..400 ✓ 压在两根沿宽横梁顶面上
  // n=u×v=(0,1,0) 朝上，pos.y=460 → 板占 460..478 ✓ 底面正好贴横梁顶面
  P.push(panel('层板', 'Overlay', 560, 400, 18, V(200, 460, 300), V(0, 0, 1), V(1, 0, 0)));

  // 侧板 8mm：嵌在 z=0 这一侧，外表面与型材外表面齐平 → Flush
  // u=(0,1,0) 长 900 沿 y，v=(1,0,0) 宽 400 沿 x，n=u×v=(0,0,-1) 朝柜外
  // pos.z=8 → 板沿 -z 长出，占 z 0..8 ✓ 与型材外表面 z=0 齐平
  P.push(panel('左侧板', 'Flush', 900, 400, 8, V(200, 450, 8), V(0, 1, 0), V(1, 0, 0)));

  // ---- 5. 写入。loadDoc 路径比逐个 addEntity 稳（材质引用一起重建） ----
  const doc = core.IOHelper.getDocument();
  doc.entities.push(...P);
  core.document.loadDoc(doc);
  await core.IOHelper.ensureAllAssets();
  const ids = mgr.getAllEntities().map(e => e.id);
  try { dg.onEntityAdded({ ids }); } catch (e) {}
  await sleep(2000);

  // ---- 6. 校验：逐件核对包围盒，这是"做完了"的判据 ----
  const rr = n => Math.round(n * 10) / 10;
  const boxes = P.filter(p => p.type === 'Panel').map(p => {
    const b = dg.getEntityObjectById(p.id).computeAccurateWorldBoundingBox();
    return { n: p.name, x: [rr(b.min.x), rr(b.max.x)], y: [rr(b.min.y), rr(b.max.y)], z: [rr(b.min.z), rr(b.max.z)] };
  });

  // ---- 7. 保存：改稿名 + 点它自己的按钮，别手搓 free-save ----
  core.document.setDocName && core.document.setDocName('方案名');
  const sv = [...d.querySelectorAll('button')].find(e => /保存设计稿/.test(e.textContent));
  if (sv) sv.click();
  await sleep(12000);

  return { 整体: core.bomHelper.computeSpecification(), 包围盒: boxes,
           保存: /保存成功/.test(d.body.innerText) };
}

// ============================================================
// 改材质（换板材、改厚度）：updateEntity 之后要补三步，否则贴图和价格对不上
// ============================================================
// const TEA = {specId:'1472967605936867', materialId:'1480323274557562',
//              materialName:'亚克力茶色', model:'PMMA', materialModel:'BC-PMMA-CS',
//              productName:'亚克力板', thickness:5};
// const ids = [];
// for (const p of mgr.getAllEntities().filter(e => /^层板/.test(e.name))) {
//   try { mgr.updateEntity(p, TEA); } catch (e) { Object.assign(p, TEA); }
//   ids.push(p.id);
// }
// await core.assetsManager.ensureMaterialAssets([TEA.materialId]);
// await core.IOHelper.ensureAllAssets();
// dg.onEntityUpdated({ids, changedKeys:['specId','materialId','materialName','model','materialModel','thickness']});

// ============================================================
// 改型材长度：sp/ep 和 logicSp/logicEp 必须一起改
// ============================================================
// const patch = {sp:{x, y:-25, z}, logicSp:{x, y:-25, z}};
// mgr.updateEntity(p, patch);
// dg.onEntityUpdated({ids, changedKeys:['sp','ep','logicSp','logicEp']});

// ============================================================
// 读任意一版设计稿的实体明细：拉 docUrl 的 zip 解 document.json
// ============================================================
// const tok = (document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1];
// const H = {'content-type':'application/json', 'x-xsrf-token':tok, 'secretkey':'64656661756c744b65794964'};
// const r = await fetch('/api/fa-platform/profile-draft/list', {method:'POST', headers:H,
//   body: JSON.stringify({orderBy:2, pageSize:5, pageNum:1})});
// const it = (await r.json()).data.list[0];
// const buf = new Uint8Array(await (await fetch(it.docUrl)).arrayBuffer());
// let doc = null;
// for (let i = 0; i < buf.length - 30; i++) {
//   if (buf[i]===0x50 && buf[i+1]===0x4b && buf[i+2]===0x03 && buf[i+3]===0x04) {
//     const m = buf[i+8] | (buf[i+9]<<8);
//     const cs = buf[i+18] | (buf[i+19]<<8) | (buf[i+20]<<16) | (buf[i+21]<<24);
//     const nl = buf[i+26] | (buf[i+27]<<8), el = buf[i+28] | (buf[i+29]<<8);
//     const nm = new TextDecoder().decode(buf.slice(i+30, i+30+nl));
//     const data = buf.slice(i+30+nl+el, i+30+nl+el+cs);
//     if (nm === 'document.json') {
//       doc = JSON.parse(m === 0 ? new TextDecoder().decode(data)
//         : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
//       break;
//     }
//     i += 30 + nl + el + cs - 1;
//   }
// }
