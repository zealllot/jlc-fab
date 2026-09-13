# jlc-fab

一个 [Claude Code](https://claude.com/claude-code) skill：把一个 DIY 家具 / 机柜 / 设备架的方案，做成嘉立创（JLC）上可以直接下单的 BOM。

覆盖铝型材骨架、板材、钣金折弯件三条线，重点是**平台本身的边界和坑**——哪个件该走哪个入口、哪些工艺根本做不了、哪一步漏了会得到一个看起来正常但少算一半钱的报价。

## 它解决什么

嘉立创把一套柜体拆成互不相通的几个入口，各自的能力边界是硬的：

| 件 | 入口 |
|---|---|
| 铝型材骨架（下料 + 攻牙 + 沉头孔 + 连接件 + 螺丝） | `xc.jlcfa.com` 型材设计器 |
| 板材（多层板 / 海洋板 / 亚克力） | 同一个设计器，注入 Panel 实体 |
| 金属板件（折弯、圆孔、表面处理） | `jlc-bj.com` 钣金站，传 STEP |

型材设计器没有导入入口，但它的 React core 可以直接写实体——skill 的主干动作是脚本写实体、点它自己的保存按钮、让平台自己算连接件和价格。

## 装

```bash
git clone git@github.com:zealllot/jlc-fab.git ~/go/src/github.com/zealllot/jlc-fab
ln -s ~/go/src/github.com/zealllot/jlc-fab ~/.claude/skills/jlc-fab
```

之后在 Claude Code 里打 `/jlc-fab`，或者话里提到嘉立创、铝型材、钣金折弯就会触发。

浏览器操作依赖 chrome-devtools MCP；`scripts/bend-part.py` 需要 `cadquery`。

## 内容

```
SKILL.md                      先探一遍 + 路线图 + 设计器主流程 + 静默坑
references/fa-designer.md     core API、坐标约定、实体 schema、材料 ID 表、平台接口
references/fa-draft-zip.md    设计稿 zip 格式 + 离线上传链路
references/sheet-metal.md     钣金站流程、材料与表面处理、页面自动化要点
references/specs-and-prices.md 加工能力边界、公差、价格快照、还没验证的
scripts/probe.js              探测平台现状，和 SKILL.md 的基线表对比
scripts/fa-inject.js          拿 core → 建实体 → 校验包围盒 → 保存
scripts/bend-part.py          cadquery 折弯件 → STEP
```

## 两个前提

**平台在快速迭代。** 文档是 2026-09 的快照，已经见过一次材质上新，几个关键能力（面板/门/抽屉模块、STEP 导入）就在路上，任何一个上线都会改变上面的路线图。所以每次开工先跑 `scripts/probe.js`，拿输出对 SKILL.md 里的基线表；对不上就按新情况重做分派，并回来更新文档。

**价格是快照，不是报价。** 所有数字用来判断量级和做取舍，正式方案前在站上重新跑一遍。

## 来历

内容来自一次完整的实战：从四张参考图开始设计一个玄关鞋柜，到型材骨架在平台上建模成功、拿到逐件真实报价。所有结论都是实测的，包括那些「试了不行」的路——文档里保留了它们，因为知道哪条路不通和知道哪条路通一样省时间。

面向的是用自己的账号、自动化自己的设计工作流。

## License

MIT
