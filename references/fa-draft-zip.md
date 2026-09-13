# 设计稿 zip 与离线上传

设计稿本身是个 zip，可以完全离线生成后传进账号。日常改模型用注入更快（改完就看得到），这条路适合一次性塞几十根型材、或者在浏览器之外批量出方案。

## zip 结构

```
设计稿.zip
├── metadata.json    {"version":"1.1","designerVersion":"1.0.0","docName":"..."}
├── document.json    {"entities":[ Profile / Panel / SlotHoleConnector / ProcessHole ]}
├── resource.json    引用 section / material / model 的 id
└── resources/       截面、材质、螺钉模型
```

**resources 整个复用。** 只要用同样的型材和材质，从一份已有设计稿里解出来原样打包，只替换 `document.json` 的 `entities` 数组即可。

已有设计稿的 zip 从 `/api/fa-platform/profile-draft/list` 返回的 `docUrl` 直接 fetch（带签名的 OSS 直链，不用额外鉴权）。

## 上传链路

```
1. POST /api/fa-platform/file/get-upload-url
        {fileName, fileSize, md5, channelSource:1}
        → {fileIndexId, uploadUrl}
2. PUT  <uploadUrl>   body=zip 字节   header: Content-Md5: <base64 md5>
3. GET  /api/fa-platform/file/update-file-status?fileIndexId=<id>
        → {fileAccessId, fileName, publicReadFilePath}
4. POST /api/fa-platform/profile-draft/free-save
```

**PUT 不能带 Content-Type。** OSS 的签名把 Content-Type 算进去了，`urllib` 和 `curl` 默认都会自己加一个，结果是 403。用 `curl -X PUT -H 'Content-Md5: ...' --data-binary @file <url>`，或者在 Python 里显式清掉这个头。

**同一个 zip 要传两遍**，`onlineDoc` 和 `offlineDoc` 是两个不同的 `fileAccessId`。缩略图单独走 `POST /api/fa-platform/profile-draft/file-upload`（multipart，返回 `fileAccessId`）。

## free-save 的 body

```json
{"onlineDoc":  {"fileAccessId":"...", "fileName":"X.zip", "publicReadFilePath":"https://fs-web-stream.jlc.com/..."},
 "offlineDoc": {"fileAccessId":"...", "fileName":"X.zip", "publicReadFilePath":"..."},
 "thumbnail":  {"fileAccessId":"...", "fileName":"X.png", "publicReadFilePath":"..."},
 "draftName":  "SHOE_CABINET_FRAME_2020",
 "bomDetail": {
   "baseInfo": {"name":"SHOE_CABINET_FRAME_2020", "specification":"340*750*1173", "version":"1.1"},
   "profiles": [ ... ], "accessories": []}}
```

四个文件字段都要带 `publicReadFilePath`，只给 `fileAccessId` + `fileName` 会返回「系统异常」而不说缺什么。

`baseInfo.specification` 是自报的标称尺寸字符串，设计器打开后会按实体重算，填得不准不影响几何 —— 但它会显示在设计稿列表上，按 `深*宽*高` 填对。

`bomDetail.profiles` 按长度分组，每组一条：

```json
{"id":"<该组第一根的实体id>", "profileIds":["<组内所有实体id>"],
 "name":"2020铝型材", "model":"TXCJ-2020", "catalog":"2020", "classification":"20MM",
 "materialCode":"XC-TXCJ-H6-2020-L1173-N1",
 "materialDesc":"2020，TXCJ-2020/2020铝型材，本色(喷砂氧化)，*图纸1*，长度：1173mm",
 "account":4, "color":"本色(喷砂氧化)",
 "textureProfileProductBizKey":"1375666316970598",
 "length":1173, "width":20, "height":20, "locationNumber":1, "angleCutNum":0,
 "holesInfo":[],
 "localAxisX":{"x":1,"y":0,"z":0}, "localAxisY":{"x":0,"y":1,"z":0}, "localAxisZ":{"x":0,"y":0,"z":1}}
```

`holesInfo` 留空 —— 孔由设计器打开设计稿后「一键生成连接件」时补齐。

返回 `{draftName, draftVersion, id}`，`id` 就是 `draftVersionId`，用 `https://xc.jlcfa.com/free-design?draftVersionId=<id>` 直接打开。

**free-save 每次都是新建版本，不覆盖旧版。**

## 请求头

所有 `xc.jlcfa.com/api` 请求带：

```
content-type: application/json
x-xsrf-token: <cookie 里的 XSRF-TOKEN>
secretkey:    64656661756c744b65794964
cookie:       customerCode / FA-SID / XSRF-TOKEN / isLoginCustomerFlag / businessCode
```

在浏览器里跑 fetch 时 cookie 自动带；在本地跑 Python/curl 时从浏览器取一次 `document.cookie`。
