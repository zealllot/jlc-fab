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

| 项 | 2026-09 基线 |
|---|---|
| 左侧模块 | 只有「铝型材」可用，连接件/打孔加工/面板/门/抽屉/其他配件 都标着开发中 |
| 顶部「编辑连接件」 | 一直可用，不受左侧模块限制 |
| 「更多」菜单 | 分享设计稿 / 开源设计稿 / 我的设计稿 / 官网 / 偏好设置，**没有导入** |
| core API | `manager` / `IOHelper` / `documentGroup` / `bomHelper` 四组方法齐全 |
| 接口数 | 15 条已知 `/api/fa-platform/*` |
| 「一键生成连接件」对注入实体 | 默认的角码不生效；改成「打孔连接(含螺钉)」后可用，但只覆盖单侧节点（2026-09-13 实测，见下） |

**对不上就按新情况重做分派，然后回来改这份文档** —— 材料 ID 表、路线图、基线表都要跟着动，别把新发现只留在这次对话里。材料库上新单独看 [fa-designer.md](references/fa-designer.md) 的材料表，那张表最容易过期。

## 路线图

| 要做的件 | 入口 | 能力边界 |
|---|---|---|
| 铝型材骨架（下料 + 攻牙 + 沉头孔 + 连接件 + 螺丝） | `xc.jlcfa.com/free-design` 设计器 | 见 [specs-and-prices.md](references/specs-and-prices.md) 的加工清单 |
| 板材：多层板 / 海洋板 / 亚克力（矩形平板） | 同一个设计器，注入 Panel 实体 | UI 里「面板」是开发中，注入可用并正常计价 |
| 金属板件：铝 5052 / 不锈钢，要折弯、圆孔、表面处理 | `jlc-bj.com` 钣金站，传 STEP | 见 [sheet-metal.md](references/sheet-metal.md) |
| 只想给一堆现成型材询价，不建整柜 | `jlcfa.com/profile-quote` 传 STEP 智能识别 | 截面自动匹配，追加工从几何里读 |

一套柜子通常落在两个入口上（型材+木板走设计器，金属板走钣金站），**两家的表面处理必然有色差** —— 挤压型材喷砂氧化 vs 板材氧化/喷塑，不是同批次能解决的，方案阶段就要当成主动的配色选择。

## 在设计器里建模

浏览器工具用 chrome-devtools MCP。设计器在一个 iframe 里，所有脚本都要先穿进 `iframe.contentWindow`。

**两个必然会撞上的交互坑：**
- **点按钮必须用 chrome-devtools 的 `click` 工具（真实 CDP 鼠标事件）。** 脚本里 `el.click()` 和手搓 `dispatchEvent(new MouseEvent(...))` 都不触发它的 React handler —— 无声失败，没有任何报错。用 `take_snapshot` 拿 uid，再 `click`。
- **「保存成功」弹窗挂在最外层 document，不在 iframe 里。** 它是 modal，不关掉会挡住之后所有点击，而且在 iframe 里怎么找都找不到。保存后先 `take_snapshot` 找到外层的 `button "Close"` 点掉，再做下一步。

1. **打开设计稿**：`https://xc.jlcfa.com/free-design?draftVersionId=<id>`，或 `/my-design` 列表点进去。等 canvas 出现再动手（10s 以上）。
2. **拿 core**：从 canvas 往上找 `__reactFiber$`，在 fiber 链上找带 `document.manager` + `IOHelper` 的 props 对象，挂到 `contentWindow.__CORE__`。完整代码在 [scripts/fa-inject.js](scripts/fa-inject.js)。
3. **写实体**：Profile（型材）只需 sp/ep 轴线端点，Panel（板材）需要 position + uAxis/vAxis + 由三轴算出的 worldQuaternion。字段模板和坐标约定在 [fa-designer.md](references/fa-designer.md)。
4. **让可视层跟上**：`loadDoc(doc)` → `await IOHelper.ensureAllAssets()` → `documentGroup.onEntityAdded({ids})`。少任何一步，实体存在但画面空白，包围盒也算不出来。
5. **校验几何**：对每个实体取 `computeAccurateWorldBoundingBox()`，逐件核对 min/max。整体尺寸用 `core.bomHelper.computeSpecification()`。**完成标准是每一件的包围盒都和图纸对得上**，不是画面看着对。
6. **命名并保存**：`core.document.setDocName(名)`，然后点页面上的「保存设计稿」按钮，等到出现「保存成功」。保存走它自己的流程，入参由它组装。
7. **生成连接件**：「编辑连接件」→「一键生成连接件」→「确定」→「退出连接件编辑」→ 再保存一次。
8. **计价**：点「计价/下单」，读「设计稿尺寸 / 铝型材数量 / 连接件数量 / 各项费用」。

### 三件会静默出错的事

- **默认的「角码」对注入实体一个都生成不出来，必须先把默认连接件改成螺钉（2026-09-13 实测）。**
  路径：`编辑连接件 → 默认连接件 旁边的「修改」→ 偏好设置 → 连接件 → 90°默认生成连接件类型`，从「角码连接(含附件)」改成「打孔连接(含螺钉)」。这个下拉是 antd Select，选项渲染在 portal 里、a11y 树上看不到，用 `click` 打开后按 ArrowDown/Enter 选（Home 键无效）。设置存在服务端，刷新后仍在。
  改完点「一键生成连接件」会弹「确定重新生成连接件吗？」，**点确定才真的生成**。之前以为按钮没反应，其实是这个确认弹窗被别的 modal 挡住了——排查时先确认屏幕上没有其它 modal。
  **角码模式下千万别点一键生成**：它不产出任何角码，却会把已经生成好的螺钉连接件清空（实测 18 → 0），切回螺钉重新生成才恢复。
- **螺钉也只覆盖一部分节点。** 63 根型材、约 102 个节点的货架只生成了 18 个连接件 —— 全是「梁只从一侧接到柱上」的端头。柱子两侧都有梁的内部节点，打孔连接的钻孔路径会互相撞，它直接跳过。连续排架的中间柱基本都拿不到。剩下的节点只能自己配角码（淘宝 ¥0.8~2/套），或在界面里一个个手工加。
- **连接件的真实单价很便宜，别按经验高估。** 实测 18 个连接件 / 36 个孔：加工费 ¥57.66 未税 = **¥1.60/孔**（和 specs 里的 ¥1.6/特征 对上），配件费 ¥3.42 未税 = **¥0.19/颗螺钉**。**一个节点（2 孔 + 1 螺钉）约 ¥3.39 未税 / ¥3.83 含税**，102 个节点全走平台也才 ¥390。连接件不是成本大头，板材才是。
- **跨系列节点是标准件。** 生成出来的螺钉叫「欧标 **20/30 系列** M6 内六角圆柱头 / 平圆头螺钉」，一个型号同时吃 20 系和 30 系，所以 3030 立柱 + 2020 横梁这种混搭不需要额外的转接件。
- **计价面板是快照。** 生成连接件之前打开过的计价弹窗不会自己刷新。改完模型关掉弹窗重新点一次「计价/下单」。
- **改材质要带 assets。** `mgr.updateEntity(p, 新材料字段)` 之后走 `assetsManager.ensureMaterialAssets([materialId])` + `ensureAllAssets()` + `onEntityUpdated({ids, changedKeys})`，否则渲染用旧贴图，价格却按新材料算。

## 建 STEP 给钣金站

平板件在钣金站要手动框选轮廓，那是跨域画布，脚本进不去。**传 3D STEP 全自动出价，折弯件也只能走 STEP。** 用 cadquery 建模，模板在 [scripts/bend-part.py](scripts/bend-part.py)，流程和材料/表面处理选项在 [sheet-metal.md](references/sheet-metal.md)。

## 离线生成设计稿

要一次塞几十根型材、或者要在浏览器之外批量出方案时，设计稿本身是个 zip，可以离线生成后上传：`get-upload-url` → PUT → `update-file-status` → `free-save`。完整链路和 payload 在 [fa-draft-zip.md](references/fa-draft-zip.md)。日常改模型用注入更快，这条路留给批量。

## 账号边界

设计稿、上传的文件都写在用户自己的嘉立创商业账号里。**写账号之前说一声**：新建设计稿、保存新版本都是可见的痕迹（`/profile-draft/delete` 能删，版本号不回退）。下单永远由用户自己点。
