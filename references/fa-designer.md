# 型材设计器内部结构

`xc.jlcfa.com/free-design` 是 React + Three.js，跑在一个同源 iframe 里。下面是实测（2026-09）可用的写入面。

## core 对象

从 canvas 元素往上找第一个带 `__reactFiber$` 的宿主，沿 `fiber.return` 向上最多 80 层，在每层 `memoizedProps` 里找满足 `v.document.manager && v.IOHelper` 的对象（或 `v.core` 满足同样条件）。拿到后挂在 `iframe.contentWindow.__CORE__` 上复用。

页面刷新、切换设计稿后 `__CORE__` 会丢，每个脚本都要能自己重新找（模板已内置）。

| 入口 | 用途 |
|---|---|
| `core.document.manager` | 实体增删改查：`getAllEntities()` `addEntity(e)` `delEntityById(id)` `updateEntity(e, patch)` `getManagerByType(t)` |
| `core.IOHelper` | `getDocument()` 取整篇文档、`ensureAllAssets()` 等资源就位 |
| `core.document.loadDoc(doc)` | 用一篇完整文档重建场景 |
| `core.documentVisual.documentGroup` | 可视层：`onEntityAdded({ids})` `onEntityDeleted({ids})` `onEntityUpdated({ids, changedKeys})` `getEntityObjectById(id)` |
| `core.assetsManager.ensureMaterialAssets([materialId])` | 换材质后拉贴图 |
| `core.bomHelper` | `computeSpecification()` 出整体尺寸字符串、`generateBomInfo()` 出 BOM |
| `core.document.setDocName(name)` | 改稿名，保存时生效 |

**写实体有两条等价路径**：逐个 `mgr.addEntity(p)`，或者 `doc = IOHelper.getDocument(); doc.entities.push(...P); core.document.loadDoc(doc)`。后者更稳（材质引用会一起重建）。两条都要跟 `ensureAllAssets()` + `onEntityAdded`。

## 坐标约定

**轴向：x = 深，y = 高（向上），z = 宽。** 原点在柜体左前下角。

`bomHelper.computeSpecification()` 返回 `深*宽*高`，也就是 `x*z*y`，整数、星号分隔、无空格无单位 —— 实测那套鞋柜返回的就是字符串 `"350*750*1173"`。这和用户口语里的「宽×深×高」不是一个顺序，报数前先换算回去。

### Profile

- `sp`/`ep` 是**轴线两端**，也就是端面中心；截面绕轴线各 ±半边（2020 型材 ±10）。所以一根贴着原点角的立柱轴线在 `(10, *, 10)`，它的截面占 x 0..20、z 0..20。
- **外廓 = 轴线坐标 ± 半边。** 两根立柱轴线在 x=10 和 x=340，整体深就是 350，不是 340。算标称尺寸时把这 ±10 加回去，这是最容易少算一圈的地方。
- 横梁端点精确抵在立柱**内表面**上（对接，不是搭接）：立柱轴线 x=10、截面到 x=20，横梁就从 x=20 起。
- 所有 Profile 的 `quaternion` 和 `worldQuaternion` 都是单位四元数 `(0,0,0,1)`，走向完全由 sp→ep 决定。

### Panel

姿态靠 `uAxis` `vAxis` 和由 `quat(u, v, u×v)` 算出的 `worldQuaternion`，法向 `n = u × v`。

**`position` 在板面内（u、v 两个方向）是中心，在厚度方向是 `-n` 侧的那个表面** —— 板从 `position` 沿 `+n` 长出 `thickness`。`thicknessAnchorN: 0.5` 这个字段名有误导性，实测四种朝向的板都是这个规律：

| 板 | position | n | 实测包围盒 |
|---|---|---|---|
| 侧板 8mm | z = 0 | (0,0,1) | z 0..8 |
| 背板 8mm | x = 350 | (-1,0,0) | x 342..350 |
| 顶板 18mm | y = 1173 | (0,-1,0) | y 1155..1173 |
| 层板 18mm | y = 20 | (0,1,0) | y 20..38 |

所以放一块搁在 y=20 横梁顶面上的层板，`position.y` 就写 20（不是 29），法向朝上。**朝向记反了板会长到型材里去**，第 5 步的包围盒校验就是抓这个的。

### 层板靠什么托是设计决策

实测那套的层板 x 跨 20..330，正好是两根立柱的净空，四周不搭在任何型材上 —— 它靠的是另配的**层板托**。要让层板自己搁在横梁上，就得把板做大到压过横梁顶面（x 跨 0..350）。两种都成立，但必须自己选一个，坐标约定不替你决定。

## 实体 schema

### Profile（型材）

```json
{"id":"<21位nanoid>","type":"Profile",
 "quaternion":{"isQuaternion":true,"_x":0,"_y":0,"_z":0,"_w":1},
 "visible":true,"opacity":0.3,"lock":false,
 "name":"2020铝型材","productName":"2020铝型材","version":"1.0",
 "sp":{"x":10,"y":0,"z":10},"ep":{"x":10,"y":1173,"z":10},
 "logicSp":{"x":10,"y":0,"z":10},"logicEp":{"x":10,"y":1173,"z":10},
 "worldQuaternion":{"isQuaternion":true,"_x":0,"_y":0,"_z":0,"_w":1},
 "sectionId":"1488216301085844","materialId":"1375666316970598",
 "materialName":"本色(喷砂氧化)","model":"TXCJ-2020",
 "classificationEnCode":"20mm","shapeCenter":{"x":10,"y":10},
 "dxfMin":{"x":0.01,"y":0.01},
 "spAutoGenConnector":true,"epAutoGenConnector":true}
```

改长度就改 `sp`/`ep`，`logicSp`/`logicEp` 必须同步改，`changedKeys` 带上 `['sp','ep','logicSp','logicEp']`。

### Panel（板材）

必填字段见 [scripts/fa-inject.js](../scripts/fa-inject.js) 里的 `panel()` 函数。两个容易错的：

- `drawType`：`'Flush'` = 板的贴合面与型材外表面齐平（侧板、背板、门板）；`'Overlay'` = 板叠在型材上（层板搁在横梁上）。这个值影响价格计算和 3D 位置。
- `length`/`width`/`thickness` 要和 `originalContour` 的顶点自洽 —— 轮廓是以中心为原点的 `±length/2 × ±width/2` 矩形。

### ProcessHole / SlotHoleConnector

孔和螺钉由「一键生成连接件」自动产出，不用手写。`ProcessHole` 带 `ownerId` `faceName` `localPosition` `localDirection` `holeType`；`SlotHoleConnector` 带 `relatedEntity` 指明它连哪两根。

三通角的连接逻辑是设计器算的：**一颗沉头孔螺钉打进横梁端面螺纹孔，一颗通孔螺钉打进另一根的侧槽配 T 螺母**，两条路径不共线所以不干涉。手工排孔位会在八个角上排错，交给它算。

## 材料 ID 表（2026-09 实测）

型材：

| 型号 | sectionId | name / productName | classificationEnCode | shapeCenter | 说明 |
|---|---|---|---|---|---|
| `TXCJ-2020` | `1488216301085844` | `2020铝型材` | `20mm` | `{x:10,y:10}` | 欧标 20 系列，槽宽 6，壁厚 1.4，0.48 kg/m，¥13.24/m 未税 |
| `TXCK-3030` | `1476655426582219` | `3030铝型材 欧标` | `30mm OB` | `{x:15,y:15}` | 欧标 30 系列，壁厚 2，0.85 kg/m，¥23.84/m 未税，设计器默认款 |

**要任意型号的整组参数，直接打接口，别去界面里画** —— `POST /api/fa-platform/profile/cad/section` `{profileProductModels:["TXCK-3030"]}` 一次就全给了，而且字段名能直接对上实体 schema：

| 接口返回 | 填进实体的字段 |
|---|---|
| `data[0].bizKey` | `sectionId` |
| `data[0].productName` | `name` 和 `productName` |
| `data[0].profileProductModel` | `model` |
| `data[0].classificationEnCode` | `classificationEnCode` |
| `data[0].w` / `.h` | `shapeCenter = {x: w/2, y: h/2}` |
| `data[0].materials[].textureProfileProductBizKey` | `materialId` |

`materials[]` 还带每个颜色的 `meterPrice`（未税米价）和 `meterWeight`，估价直接读这个。四色实测：本色 `1375666316970598` / 黑色 `1236793474354756` / 白色 `1227277954592747` / 原木色 `1428676321059605` —— 这四个 ID 在 2020 和 3030 上是同一套，跨规格通用。3030 原木色 ¥26.17/m，比本色贵 ¥2.33/m。

（`/profile-draft/example` 在 2026-09-13 返回 500，扒官方示例稿这条路暂时断了。）

**改型材规格要带 shapeCenter。** `mgr.updateEntity(p, {sectionId, model, name, productName, classificationEnCode, shapeCenter})`，`changedKeys` 六个字段全带上，再跟 `ensureAllAssets()` + `onEntityUpdated`。漏了 `shapeCenter` 截面中心会错半边。

板材（specId / materialId / materialName / model / materialModel / productName）：

| 简称 | specId | materialId | materialName | model | materialModel | productName |
|---|---|---|---|---|---|---|
| 多层板原木色 | 1588904263988966 | 1137671796893973 | 多层板 原木色 | DCB-A | BC-DCB-YMS | 多层胶合板 |
| 海洋板国产素板UV | 1600616659800247 | 1396337935602445 | 海洋板 国产 素板 UV清漆 | HYBG-SU | BC-HYBG-UVQ | 海洋板 国产 素板 |
| 海洋板国产素板无漆 | 1600616659800247 | 1394927302481424 | 海洋板 国产 素板 无漆 | HYBG-SU | BC-HYBG-WUQ | 海洋板 国产 素板 |
| 海洋板国产木蜡油胡桃 | 1327712320506059 | 1547707598586504 | 海洋板 国产 木蜡油 胡桃木色 | HYBG-ML | BC-HYBG-HTM | 海洋板 国产 木蜡油 |
| 海洋板进口素板UV | 1589780854793029 | 1678930130036684 | 海洋板 进口 素板 UV清漆 | HYBW-SU | BC-HYBW-UVQ | 海洋板 进口 B/BB 素板 |
| 海洋板进口木蜡油胡桃 | 1543967297050709 | 1346877459814935 | 海洋板 进口 木蜡油 胡桃木色 | HYBW-ML | BC-HYBW-HTM | 海洋板 进口 B/BB 木蜡油 |
| 亚克力黑 | 1472967605936867 | 1340108833003276 | 亚克力黑色 | PMMA | BC-PMMA-HS | 亚克力板 |
| 亚克力茶 | 1472967605936867 | 1480323274557562 | 亚克力茶色 | PMMA | BC-PMMA-CS | 亚克力板 |
| 亚克力透明 | 1472967605936867 | 1426196088972983 | 亚克力透明 | PMMA | BC-PMMA-TM | 亚克力板 |

**这张表最容易过期** —— 2026-09 中旬就上过一批海洋板。表里没有的材质，用和型材同样的办法拿：在界面里选中那个材质画一块板，读它的实体，把 `specId` / `materialId` / `materialName` / `model` / `materialModel` / `productName` 六个字段整组抄下来，再把新行补回这张表。

```js
core.document.manager.getAllEntities().filter(e => e.type === 'Panel')
  .map(e => [e.productName, e.materialName, e.specId, e.materialId, e.model, e.materialModel].join(' | '))
```

## 平台 API

所有请求带 `x-xsrf-token`（读 cookie `XSRF-TOKEN`）和 `secretkey: 64656661756c744b65794964`。

| 接口 | 用途 |
|---|---|
| `POST /api/fa-platform/profile-draft/list` `{orderBy:2,pageSize,pageNum}` | 我的设计稿，返回 `draftName` `draftVersion` `id` `docUrl` `bomDetail` |
| `POST /api/fa-platform/profile-draft/example` | 官方示例稿，可以扒它们的实体写法 |
| `POST /api/fa-platform/profile/cad/section` `{profileProductModels:["TXCJ-2020"]}` | 返回型材截面 DXF 的下载地址 |
| `POST /api/fa-platform/web/detail-page/quotation/query-lite` | 单品询价（配件、单根型材），见下 |

`docUrl` 指向设计稿 zip，可以直接 fetch 下来解 `document.json` 读任何一版的实体明细 —— 比在界面上翻列表快得多。zip 结构见 [fa-draft-zip.md](fa-draft-zip.md)。

配件询价的 body 形状（连接件、螺丝这类标准品）：

```js
{count: 20,
 productModel: 'TPDQ-206-C-14-ZP',
 selectProductParamValue: [
   {paramName:'型材类型', paramAccessId:'dcf79db1b98e41c5a086600a92fe9787', paramValue:'206'},
   {paramName:'规格',     paramAccessId:'a44ff6d9aaf64ff9ad18992e8c7e53ed', paramValue:'C'},
   {paramName:'长度（mm）',paramAccessId:'d1f9d01c90964dacaefafb0358913913', paramValue:'14'},
   {paramName:'螺丝配件', paramAccessId:'37950670d3ac493ca385967f7ccd0b2e', paramValue:'ZP'}],
 normalProductParamValue: [], optionalProductParamValue: [],
 productCodeAccessId: '9aa55a58ccb2417f99f3b5bddce44e8d',
 promotionSkuInfoAccessId: null, unitKeyId: ''}
```

`paramAccessId` 是每个商品自己的，在商品详情页 `jlcfa.com/serial/<id>.html` 抓一次 XHR 就有。返回 `priceWithTax` `totalPriceWithTax` `showDeliveryTime.deliveryDesc`。
