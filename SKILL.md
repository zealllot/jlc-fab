---
name: jlc-fab
description: 嘉立创下单：铝型材骨架、板材、钣金折弯件的建模与报价。触发词 — 嘉立创 / jlcfa / jlc-bj / 铝型材 / 2020 型材 / 型材框架 / 钣金折弯 / 激光切割板件；或把一个 DIY 家具、机柜、设备架方案做成可下单的 BOM。
---

# 嘉立创下单

嘉立创把一套柜体拆成三个互不相通的下单入口，每个入口能做什么、不能做什么是硬边界。**先用路线图把件分派到入口，再动手建模** —— 分派错了会一路做到报价页才发现工艺不支持。

型材设计器没有导入按钮，但它的 React core 挂在 iframe 里可以直接写实体。**注入**是这个 skill 的主干动作：脚本写实体 → 点它自己的保存按钮 → 让它自己算连接件和价格。

## 先探一遍

**这个平台还在快速迭代**，本文档是 2026-09 的快照。已经见过一次上新（2026-09 中旬多了一批海洋板材质），而且几个关键能力就在路上：面板/门/抽屉模块、STEP 导入（bundle 里已有 `/profile-draft/step-file/check` 接口和 import 图标）。**任何一个上线，路线图和主干动作都要改** —— 导入上线就不必再注入，面板模块上线就可能一家做完不必分两个入口。

所以每次开工先跑 [scripts/probe.js](scripts/probe.js)（一两分钟），拿它的输出对下面这份基线：

| 项 | 基线（最后实测 **2026-10-10**） |
|---|---|
| 左侧模块 | **铝型材 / 连接件 / 打孔加工 / 面板 四个可用**；门 / 抽屉 / 其他配件 仍标「开发中」。（2026-09-01 时只有铝型材可用，三周内上线了三个。）**「打孔加工」已实测可用（见下），新项目优先走原生模块，注入退为后备。** |
| 标签 vs 真实能力 | **以计价为准，别信 UI 标签。**「面板」「打孔加工」标着开发中的时候，注入 Panel 和 ProcessHole 都正常计价；反过来，板材上挂孔界面一切正常、能存能查，计价却**完全忽略**。判断一道工序做不做，唯一可靠的办法是注入一个再看加工费动没动。 |
| 顶部「编辑连接件」 | 一直可用，不受左侧模块限制 |
| 「更多」菜单 | 分享设计稿 / 开源设计稿 / 我的设计稿 / 官网 / 偏好设置，**没有导入** |
| core API | `manager` / `IOHelper` / `documentGroup` 齐全；**`bomHelper.computeSpecification` 仍然没有**（2026-09-18 移除，10-10 复查未回归），整体尺寸自己扫包围盒求并集。`designerVersion` 一直报 `1.0.0`，**别拿它判断版本**。 |
| core 新增对象（2026-10-10） | `draftSaveValidator` —— 保存前校验型材和配件的模型资源，缺模型 / 缺文件 / 缺尺寸会抛 `ACCESSORY_MODEL_LOAD_FAILED` / `..._FILE_MISSING` / `ACCESSORY_SIZE_MISSING` 并**阻止保存**（只管 Profile 和配件，不碰 ProcessHole）。另有 `screenshotHelper` / `panelOutlineScene` / `editSceneManager` / `maintenanceLocked`。 |
| 接口清单 | **旧的 bundle 扫法已失效**（2026-10-10，6 个脚本 0 命中）。用 `list_network_requests` 抓实际请求。这次新发现 9 条：`profile-draft/free`、`profile-home/stop-service-status`、`profile-home/page-info`、`alumc/queryProfileGroupQRCode`、`profile/free-designer/checkAppPermission`、**`profile/free-designer/connector/modular-list-v2`**（连接件目录）、`faMall/secret/update`、`faMall/login/user`、`faMall/shoppingCart/count`。 |
| 「一键生成连接件」 | 对注入实体可用，但**必须先存盘 + 刷新**。覆盖率由几何决定，不是平台能力上限：轴线共线 + 截面同宽时实测可达 **100%**（26/26、24/24 各一次）；混用规格会掉到 7/26。阶梯见下文。 |
| 板材加工 | **不支持**（2026-09-19 实测）。板材只按外形尺寸下料，孔自己钻。 |

**对不上就按新情况重做分派，然后回来改这份文档** —— 材料 ID 表、路线图、基线表都要跟着动，别把新发现只留在这次对话里。材料库上新单独看 [fa-designer.md](references/fa-designer.md) 的材料表，那张表最容易过期。

## 路线图

| 要做的件 | 入口 | 能力边界 |
|---|---|---|
| 铝型材骨架（下料 + 攻牙 + 沉头孔 + 连接件 + 螺丝） | `xc.jlcfa.com/free-design` 设计器 | 见 [specs-and-prices.md](references/specs-and-prices.md) 的加工清单 |
| 板材：多层板 / 海洋板 / 亚克力（矩形平板） | 同一个设计器 | 「面板」模块 2026-10-10 已上线，**先试原生**；注入 Panel 实体也仍可用并正常计价。**板材不能打孔**，孔自己钻。 |
| 金属板件：铝 5052 / 不锈钢，要折弯、圆孔、表面处理 | `jlc-bj.com` 钣金站，传 STEP | 见 [sheet-metal.md](references/sheet-metal.md) |
| 只想给一堆现成型材询价，不建整柜 | `jlcfa.com/profile-quote` 传 STEP 智能识别 | 截面自动匹配，追加工从几何里读 |

一套柜子通常落在两个入口上（型材+木板走设计器，金属板走钣金站），**两家的表面处理必然有色差** —— 挤压型材喷砂氧化 vs 板材氧化/喷塑，不是同批次能解决的，方案阶段就要当成主动的配色选择。

## 在设计器里建模

浏览器工具用 chrome-devtools MCP。设计器在一个 iframe 里，所有脚本都要先穿进 `iframe.contentWindow`。

**两个必然会撞上的交互坑：**
- **点按钮：裸 `el.click()` 不可靠，要补完整的指针事件序列（2026-09-18 修正）。**
  裸 `el.click()` 对有些按钮有效（如「保存设计稿」），对另一些**无声失败**（如「计价/下单」，点了什么都不发生）。原因是 React 的 handler 挂在 pointer 事件上。
  **可靠写法**（本项目里用了二十多次，零失败）：
  ```js
  const fire = el => { const rc = el.getBoundingClientRect();
    const o = {bubbles:true, cancelable:true, view:w,
               clientX:rc.left+rc.width/2, clientY:rc.top+rc.height/2};
    ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(t =>
      el.dispatchEvent(new (t.startsWith('pointer') ? w.PointerEvent : w.MouseEvent)(t, o))); };
  ```
  `w` 是 iframe 的 contentWindow —— **事件构造函数必须取自目标 window**，用外层的 `MouseEvent` 会被当成跨 realm 对象。
  chrome-devtools 的 `click` 工具（真实 CDP 事件）当然也行，而且最保险；但它要先 `take_snapshot` 拿 uid，批量操作时上面那个 `fire()` 更顺手。
- **「保存成功」弹窗挂在最外层 document，不在 iframe 里。** 它是 modal，不关掉会挡住之后所有点击，而且在 iframe 里怎么找都找不到。保存后先 `take_snapshot` 找到外层的 `button "Close"` 点掉，再做下一步。

1. **打开设计稿**：`https://xc.jlcfa.com/free-design?draftVersionId=<id>`，或 `/my-design` 列表点进去。等 canvas 出现再动手（10s 以上）。
2. **拿 core**：从 canvas 往上找 `__reactFiber$`，在 fiber 链上找带 `document.manager` + `IOHelper` 的 props 对象，挂到 `contentWindow.__CORE__`。完整代码在 [scripts/fa-inject.js](scripts/fa-inject.js)。
3. **写实体**：Profile（型材）只需 sp/ep 轴线端点，Panel（板材）需要 position + uAxis/vAxis + 由三轴算出的 worldQuaternion。字段模板和坐标约定在 [fa-designer.md](references/fa-designer.md)。
4. **让可视层跟上**：`loadDoc(doc)` → `await IOHelper.ensureAllAssets()` → `documentGroup.onEntityAdded({ids})`。少任何一步，实体存在但画面空白，包围盒也算不出来。
5. **校验几何**：对每个实体取 `computeAccurateWorldBoundingBox()`，逐件核对 min/max，**整体尺寸把这些包围盒求并集**（`computeSpecification()` 已被平台移除，别再调）。**完成标准是每一件的包围盒都和图纸对得上**，不是画面看着对。
6. **命名并保存**：`core.document.setDocName(名)`，然后点页面上的「保存设计稿」按钮，等到出现「保存成功」。保存走它自己的流程，入参由它组装。
7. **生成连接件**：「编辑连接件」→「一键生成连接件」→「确定」→「退出连接件编辑」→ 再保存一次。
8. **计价**：点「计价/下单」，读「设计稿尺寸 / 铝型材数量 / 连接件数量 / 各项费用」。

### 会静默出错的事

- **默认的「角码」对注入实体一个都生成不出来，必须先把默认连接件改成螺钉（2026-09-13 实测）。**
  路径：`编辑连接件 → 默认连接件 旁边的「修改」→ 偏好设置 → 连接件 → 90°默认生成连接件类型`，从「角码连接(含附件)」改成「打孔连接(含螺钉)」。这个下拉是 antd Select，选项渲染在 portal 里、a11y 树上看不到，用 `click` 打开后按 ArrowDown/Enter 选（Home 键无效）。设置存在服务端，刷新后仍在。
  改完点「一键生成连接件」会弹「确定重新生成连接件吗？」，**点确定才真的生成**。之前以为按钮没反应，其实是这个确认弹窗被别的 modal 挡住了——排查时先确认屏幕上没有其它 modal。
  **角码模式下千万别点一键生成**：它不产出任何角码，却会把已经生成好的螺钉连接件清空（实测 18 → 0），切回螺钉重新生成才恢复。
- ~~螺钉只覆盖一部分节点~~ —— **这条已作废（2026-10-10 复核）。**
  原始观察（2026-09-13）是「63 根型材约 102 个节点只生成 18 个连接件」，当时归因为"柱两侧都有梁的内部节点，钻孔路径互撞所以跳过"。**这个归因是错的** —— 第二天就发现真正的条件是「轴线共线 + 截面同宽」（见下面的覆盖率阶梯），那 18/102 是混用规格时代的数。
  2026-10-10 拿两张纯 2020 的鞋柜稿复核：**定稿 18/18、骨架稿 42/42，全覆盖，一个漏的都没有**，连「横杆顶进另一根横杆中段」的 T 型节点也照样生成。
  **结论：规格统一之后就没有"打孔连接吃不下的节点"这回事。** 需要补角码的前提是混用规格，而那本身就该先改掉。
- **脚本改过实体之后，必须存盘 + 刷新页面再点一键生成（2026-09-14 实测，推翻了当天早些时候的错误结论）。**
  同一张 18 根型材的稿：脚本 `updateEntity` 改完一根的 `sectionId`/`shapeCenter`，**不存盘直接生成** → 只出 2 颗螺钉，位置偏出框架 65mm，还把 `computeSpecification()` 从 `1224*1130*2440` 撑成 `1224*1195*2440`。
  **存盘、刷新、重新挂 core 之后再点** → 稳定出 12 个连接件 + 24 个 ProcessHole，位置精确落在节点上，整体尺寸不变。连点两次结果逐字节一致（同样的 model、position、relatedEntity），**这个按钮是确定性的**。
  原因是脚本改的是 document 里的实体，而生成器读的是可视层缓存的截面几何；不走一遍「存盘 → 重新加载」，它拿到的是旧截面。
  **别把 `faceSection === undefined` 当成故障信号。** 注入实体的这个字段一直是 undefined，连接件生成正常的那次也是 undefined —— 我一度把它写成根因，是错的。
- **打孔连接能不能自动生成，取决于两根型材接触处「轴线共线 + 截面同宽」（2026-09-14 实测到 26/26 全覆盖）。**
  同一张 18 根型材、26 个节点的稿，一路实测：

  | 状态 | 覆盖 | 连接件 / 孔位 |
  |---|---|---|
  | 混用 3030+2040+2020，5 根横杆贴柱边（轴偏 5mm） | 7/26 | 12 / 24 |
  | 那 5 根改 3030（轴线归位 x=15，前表面仍在 x=0） | 17/26 | 22 / 44 |
  | 再把拉杆和横托改 3030（截面与柱同宽） | 22/26 | 27 / 54 |
  | **全部 18 根统一 3030** | **26/26** | 26 / 52 |

  两个条件缺一不可：**轴线偏 5mm 就哑**；**截面窄一圈（2040 顶 3030）时行为不稳定**，同样构型左边生成右边不生成。全部同规格后 100% 覆盖，而且每根构件多个节点都能拿到螺钉 —— 所以「每根只接 1~2 个」那类从表象反推的规律是假的。
  **代价很小：** 该案型材材料 ¥463 → ¥517 未税（+¥54），但加工费/配件费从 ¥0 变成 ¥83.29 + ¥13.22（52 孔 × ¥1.602/孔），换来的是 26 个节点的孔全由平台加工、螺钉配齐，不用自己钻孔也不用买角码。
  **实操建议：优先让整套用同一规格型材。** 贴面/共面需求不要靠「把梁推到柱子一边」实现 —— 改用同规格型材，轴线自然居中，外表面照样齐平。
- **`bomHelper.computeSpecification()` 没了（2026-09-18 实测）。** `core.designerVersion` 报 `1.0.0`，`bomHelper` 只剩 `generateBomInfo` / `collectAccessories` / `ensureAssets`。manager 那一组（`getAllEntities` / `addEntity` / `delEntityById` / `updateEntity`）和 documentGroup 都还在。
  **替代写法**：遍历 Profile，对每个取 `computeAccurateWorldBoundingBox()` 求并集。反正逐件核包围盒本来就是必做步骤，顺手求个并集不多花什么。
- **自动保存会把稿名改掉。** core 里有个 `autoSaveController`，隔一阵自动存一版，并把设计稿名替换成 `XCSJQ_<客户号>_<序号>_V<版本>` 这种机器名（实测从「前室储藏架-v15-定稿」变成「XCSJQ_13627939A_8_V69」，版本也从 V65 悄悄推到 V69）。
  **每次动手前先读一眼 `core.document.name`**，被改了就 `core.document.setDocName('原名')` 改回来再保存，否则「我的设计稿」列表里很快全是认不出来的机器名。
- **确认弹窗多了一句官方免责声明。** 「确定重新生成连接件吗？」里新增：*"此设计器处于上线初期，一键生成连接件功能仅覆盖常规连接场景，建议您认真核对连接件生成的合理性。"* —— 平台自己承认覆盖不全，所以生成完**必须**扫一遍节点覆盖率，别假设它全做了。
- **注入 ProcessHole（额外孔位）必须克隆现成实体，不能拼纯对象（2026-09-18 实测）。** `打孔加工` 模块还标着开发中，但孔可以注入，而且**会正常计价**。
  纯对象 `mgr.addEntity({type:'ProcessHole', ...})` 能加进 document，但平台会在实体上调方法：先是渲染时 `e.isSemiTransparent is not a function`，随后整个 iframe 界面崩掉（canvas 和按钮全消失，core 还活着）。**正确做法**：`const h = 某个同类孔.clone(); h.ownerId=…; h.localPosition=…; mgr.addEntity(h)`。判断有没有原型：`typeof e.clone === 'function'`。
  **`documentGroup.onEntityAdded({ids})` 的 `ids` 实际要的是实体对象**，不是 id 字符串（源码是 `e.ids.forEach(e=>this.addObject(e))`）。传字符串会报 `e.clone is not a function`。`onEntityUpdated` 则接受 id 字符串，而且它内部会 `updateOwnedHoles(ids)` —— **刷新宿主型材就能把挂在它上面的孔一起渲染出来**，比直接 add 更稳。
  孔实体关键字段：`ownerId`（宿主型材）、`faceName`、`localPosition`（相对型材轴线，z 沿轴线从 sp 起算）、`localDirection`、`model`（料号，如 `TK8.5`）、`specList`、`holeType`（`ThroughHole`/`ThreadedHole`/`CountersunkHole`）。自己加的孔把 `sourceAccessoryId` 置空即可，不会被回收。
- **端面攻牙同样可以注入，一键生成只管连接件那几处（2026-09-18 实测）。** 一键生成只在**连接件落点**产攻牙，柱脚装脚垫要的 M8 孔它不会给 —— 但那是同一道工序，克隆一个现成的端面孔改 `ownerId` 就行，4 个孔 ¥6.41，比让用户买丝锥自己攻划算。
  `LK8`（productName「LK8（8毫米螺孔）」）就是 M8 端面攻牙：`faceName` 取 `bottom`/`top`，`localPosition {x:0,y:0,z:-0.1}`（sp 端）或 `{0,0,L+0.1}`（ep 端），`localDirection {0,0,1}`，`holeType:'ThreadedHole'`，`specList` 里 diameter 8 / depth 20。
  **教训**：别拿 UI 上「打孔加工 开发中」的标签去判断能力边界 —— 面板和孔都是这样，标着开发中，注入进去照样计价。要判断某道工序做不做，查 specs-and-prices 的加工清单，或者直接注入一个试计价。
- **移动型材不会带动它的连接件和对侧的孔（2026-09-18 实测）。** `mgr.updateEntity(profile, {sp,ep,logicSp,logicEp})` 只动型材自己。挂在它身上的孔（localPosition 相对轴线）会跟着走，但另外两样不会：
  1. `SlotHoleConnector.position` —— 螺钉会留在原地
  2. **对侧构件上的配对孔** —— 比如横杆挪了高度，立柱上那个 `30 CT8` 沉头孔的 `localPosition.z` 还是旧值
  找法：连接件用 `relatedEntity[].id` 反查，配对孔用 `sourceAccessoryId === 连接件.id && ownerId !== 本型材.id`。全部改完再一次 `onEntityUpdated({ids, changedKeys})`。
  **不要为此重跑一键生成** —— 它会把自己注入的额外孔一起清掉。手动同步这几个实体反而更安全。
- **面名与方向的对应（3030 实测）：** `side0`→dir(1,0,0) 从 local −x 进；`side1`→(0,−1,0) 从 +y 进；`side2`→(−1,0,0) 从 +x 进；`side3`→(0,1,0) 从 −y 进；`bottom`/`top` 是 sp/ep 两个端面。沉头孔起点取轴线 ±15.2，通孔取 ±17.7。
  **局部坐标怎么对到世界**：local z 永远沿型材轴线（从 sp 起算），`local x ↔ world x`；剩下那一轴按右手系推。标定方法是挑一个**已知节点**的现成孔，用它的 localPosition 反推——别硬猜。
- **界面崩了也还能存盘：`await core.autoSaveController.saveWithRetry()`。** 存完 `autoSaveController.isDirty` 变 false 就是成功。iframe 的 React 树炸掉、按钮全没的时候，这是唯一的活路（core 仍挂在 contentWindow 上）。
- **改完刷新必须带 ignoreCache。** 设计稿是 OSS 上的一个 zip，普通刷新会命中浏览器缓存读到旧 zip —— 表现成「保存明明成功了，刷新回来改动没了」，极具迷惑性。chrome-devtools 用 `navigate_page({type:'reload', ignoreCache:true})`。
  顺带：别用 `document.body.innerText` 里有没有「保存成功」判断保存成功，隐藏的旧弹窗会干扰。靠谱做法是等外层 `.el-dialog.save-free-draft-success` 可见，顺手把它 input 里的版本号读出来，既确认了保存也拿到了版本。
- **连接件的真实单价很便宜，别按经验高估。** 实测 18 个连接件 / 36 个孔：加工费 ¥57.66 未税 = **¥1.60/孔**（和 specs 里的 ¥1.6/特征 对上），配件费 ¥3.42 未税 = **¥0.19/颗螺钉**。**一个节点（2 孔 + 1 螺钉）约 ¥3.39 未税 / ¥3.83 含税**，102 个节点全走平台也才 ¥390。连接件不是成本大头，板材才是。
- **跨系列节点是标准件。** 生成出来的螺钉叫「欧标 **20/30 系列** M6 内六角圆柱头 / 平圆头螺钉」，一个型号同时吃 20 系和 30 系，所以 3030 立柱 + 2020 横梁这种混搭不需要额外的转接件。
- **「打孔加工」模块已原生可用，别再默认走注入（2026-10-10 实测）。**
  左栏四种孔型：**通孔 / 沉头孔 / 端面攻丝 / 盲孔**，外加「打孔连接(含螺钉)」。流程是先在左栏选孔型（卡片选中态），再到 3D 里点型材表面落孔 —— 没有参数表单，位置由点击位置决定。
  **原生孔和注入孔不是同一套料号**：

  | | 注入（旧做法） | 原生（模块） |
  |---|---|---|
  | 通孔 model | `TK8.5` | **`TH-D8.5`** |
  | localPosition.x | ±17.7 | **±15**（型材表面） |
  | specList | diameter + depth | 通孔只有 diameter |
  | sourceAccessoryId | 置空 `''` | **`null`** |

  两套都能正常计价、也都真的被加工（前室储藏架那单用的是注入，货到孔都对）。但原生的是平台当前约定，**新项目优先用模块**。
  **顺带推翻一个假说**：原生孔的 `sourceAccessoryId` 也是 null，所以"平台回收无关联配件的孔"说不通 —— 否则它自己的功能就不自洽。下面那条孔消失的原因仍然没查清。
- **计价不需要存盘（2026-10-10 实测）。** 在内存里加一个孔、直接点「计价/下单」，加工费立刻反映；删掉再点，又退回去。所以**试工艺支不支持不用往账号里写版本** —— 改 → 计价 → 看数字动没动 → 撤销，全程零痕迹。
  实测单孔边际价：加一个原生通孔，加工费 ¥94.29 → ¥95.89，**差 ¥1.60 未税**，和老数据一致，没涨。
- **型材涨价了（2026-10-10）：3030 欧标本色 23.78 → `24.52 元/米` 未税**（+3.1%）。同一张 16 根的稿，型材材料从 ¥539.01 变 ¥555.72。**specs-and-prices 里的价格都要按这个比例重新看**。
- **往 3D canvas 里合成点击（落孔、选构件）的可用写法。**
  光有 clientX/clientY 不够，`PointerEvent` 要补齐 `pointerId` / `pointerType:'mouse'` / `isPrimary` / `buttons` / `pressure`，而且**要先 hover 再按下抬起**（raycast 靠 pointermove 更新）：
  ```js
  const ev = (el,type,x,y) => el.dispatchEvent(new (type.startsWith('pointer')?w.PointerEvent:w.MouseEvent)(
    type, { bubbles:true, cancelable:true, composed:true, view:w, clientX:x, clientY:y,
            button:0, buttons: type.endsWith('down')?1:0,
            pointerId:1, pointerType:'mouse', isPrimary:true, pressure: type.includes('down')?0.5:0 }));
  ev(cvs,'pointermove',x,y); await sleep(900);
  ev(cvs,'pointerdown',x,y); ev(cvs,'mousedown',x,y); await sleep(250);
  ev(cvs,'pointerup',x,y);   ev(cvs,'mouseup',x,y); ev(cvs,'click',x,y);
  ```
  **屏幕坐标别猜 —— 用相机把已知实体投影过去**：在 core 里广度搜 `o.isCamera && o.projectionMatrix` 拿到 PerspectiveCamera，再
  `v.project(cam)` → `sx = rect.left + (v.x*0.5+0.5)*rect.width`、`sy = rect.top + (-v.y*0.5+0.5)*rect.height`。
- **下单之后设计稿还会继续变，别拿它当"已下单内容"的记录（2026-10-10 实测）。**
  前室储藏架在 V104 下单（69 孔 = 48 连接件孔 + 21 注入孔），货到装完没问题 —— 说明那 21 个孔确实进了订单。但三周后再打开，稿名已被 autosave 推到 **V111，孔只剩 48，21 个注入孔全部消失**，筛选条件正好是 `sourceAccessoryId` 为空。几何（16 根型材 / 筋位 / 层板）毫发无损。
  也就是说：**订单在下单那一刻冻结，设计稿不冻结**。事后回头看稿子，会以为自己漏了孔。
  **做法**：下单时把计价页的关键数（根数 / 孔数 / 各项费用）单独记在项目文档里，别指望回设计稿去查。
  **没查清的**：是平台更新后把"无关联配件的孔"当孤儿回收了，还是期间有人在界面上动过。要确认得注入一个孔 → 保存 → 刷新看它活不活，那会往用户账号写一版，**动手前先问**。

- **计价面板是快照。** 生成连接件之前打开过的计价弹窗不会自己刷新。改完模型关掉弹窗重新点一次「计价/下单」。
- **改材质要带 assets。** `mgr.updateEntity(p, 新材料字段)` 之后走 `assetsManager.ensureMaterialAssets([materialId])` + `ensureAllAssets()` + `onEntityUpdated({ids, changedKeys})`，否则渲染用旧贴图，价格却按新材料算。

### 平台现有的连接件与安装方式（2026-10-10 从左栏读出）

左栏是**分四组**的，组名透露了各自的适用场景：

| 组 | 成员 | 干什么的 |
|---|---|---|
| 角码连接 | 角码连接(含附件) / 斜角角码(含附件) | 外挂三角块，贴两个面 |
| 隐藏式连接 | 内置连接 / 锚式连接 / 角槽连接 / **打孔连接(含螺钉)** | 藏在型材内部或槽里，外表面干净 |
| 端面连接 | 双通端面 / 三通端面 / **三维连接(含附件)** | **接型材端面**，2 向 / 3 向 / 三维角 |
| 外置连接板 | T型(含附件) / L型(含附件) / X型(含附件) | 外贴平板跨过节点 |

**面板安装方式 3 种**：嵌平式 / 矩形覆盖式 / 嵌入式

**三维连接属于「端面连接」** —— 它接的是型材端面相交的角，不是"梁从侧面顶到柱子中段"。所以拿它去补中段节点是找错了工具；真要补那种节点，方向应该是**外置连接板（T型 / X型）**，外贴一块板跨过去。不过前提是真有补的必要 —— 见上面那条，规格统一后就没有漏的节点了。

### 一键生成的连接件类型有 7 种可选，不是 2 种（2026-10-10）

以前只知道「角码」和「打孔连接」两种。实际打开 `偏好设置 → 连接件 → 90°默认生成连接件类型`，下拉里是 **7 个**：

| 标签 | 枚举值 |
|---|---|
| 角码连接(含附件) | （未读到） |
| 内置连接(含附件) | （未读到） |
| 锚式连接 | （未读到） |
| 角槽连接(含附件) | `ChamferedGroove` |
| **打孔连接(含螺钉)** | **`Screw`** ← 当前默认 |
| 端面连接件(含附件) | `EndFaceConnector` |
| 型材连接板(含附件) | （未读到） |

**这是用上其它连接件最实际的路子** —— 改默认类型再点一键生成，比手工一个个放省事得多，而且覆盖全。左栏那 12 张卡片是**手工放置**用的，和这 7 个不是同一套粒度（卡片把端面连接细分成双通/三通/三维，把连接板细分成 T/L/X）。

### 偏好 JSON 能直接读，字段很有用

`GET /api/fa-platform/customer/preference` **裸 fetch 就能读**（GET 类不需要凭证）。实测返回：

```
defaultConnectorType90: "Screw"      90° 默认连接件
defaultAngleBracketType: 1           角码型号
autoGenerateConnector: true
showConnectorHoles: true
autoSaveInterval: 15                 ← 自动保存间隔，版本号疯涨的根源
holeStepSize: 2 / stepSize: 5 / translationSnap: 5 / planeSnapDistance: 30
panelAccessory: { Flush:{schemeId:'system-bearing'}, Overlay:{schemeId:'system-bearing'},
                  Embedded:{}, autoGenerate:false, customSchemes:[] }
```

**`panelAccessory.autoGenerate: false`** —— 面板配件（嵌平/覆盖/嵌入三种安装方式的五金）**能自动生成但默认关着**，没试过打开。

**POST 类接口裸 fetch 一律 403**（`modular-list-v2` / `cad/connector` / `connector/type-list` 都试过）—— 它们要启动时 `POST /api/faMall/secret/update` 换来的凭证。想看 POST 接口的内容，走 `list_network_requests` 读浏览器已经发过的那一条。

### 手工放置连接件：仍未走通，但排除了三个原因

合成 pointer 事件能成功落**孔**，却放不上**连接件**。四个目标点（已占用的顶角、空闲柱顶端面、柱底端面、另一根柱顶）全试过，实体数纹丝不动，**也没有任何报错提示**。

已排除：
- ~~弹窗遮挡~~ —— 选中端面连接件会弹「端面连接件说明」modal（里面第 1 条恰好就是"无法添加连接件？"），**偏好设置面板的 `ant-modal-wrap` 也会盖住画布**。两个都关掉、`elementFromPoint` 确认返回 CANVAS 之后，仍然放不上。
- ~~卡片没选中~~ —— 选中态正常。
- ~~目标被占用~~ —— 空闲的柱端面也不行。

**诊断遮挡用 `d.elementFromPoint(x,y)`，别数浮层个数** —— `ant-modal-wrap` 是全屏透明层，看起来什么都没挡，实际吃掉所有点击。

剩下的可能是：指示区域由一个 raf 循环按内部指针状态渲染，合成事件填不进那个状态（比如它听的是 `pointerrawupdate`，或者要求 canvas 先获得焦点）。**要走通大概得用 chrome-devtools 的真实 CDP 事件按坐标点，而不是合成事件。**

## 建 STEP 给钣金站

平板件在钣金站要手动框选轮廓，那是跨域画布，脚本进不去。**传 3D STEP 全自动出价，折弯件也只能走 STEP。** 用 cadquery 建模，模板在 [scripts/bend-part.py](scripts/bend-part.py)，流程和材料/表面处理选项在 [sheet-metal.md](references/sheet-metal.md)。

## 离线生成设计稿

要一次塞几十根型材、或者要在浏览器之外批量出方案时，设计稿本身是个 zip，可以离线生成后上传：`get-upload-url` → PUT → `update-file-status` → `free-save`。完整链路和 payload 在 [fa-draft-zip.md](references/fa-draft-zip.md)。日常改模型用注入更快，这条路留给批量。

## 账号边界

设计稿、上传的文件都写在用户自己的嘉立创商业账号里。**写账号之前说一声**：新建设计稿、保存新版本都是可见的痕迹（`/profile-draft/delete` 能删，版本号不回退）。下单永远由用户自己点。
