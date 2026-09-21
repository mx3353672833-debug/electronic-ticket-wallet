# 电子票夹 · Electronic Ticket Wallet

把车票、登机牌和旅途故事放回地图上。

地图式单页票夹：票面悬浮在对应线路上，搜索、年份筛选、随机翻票都在主页完成。点开票看大图，再按需打开故事侧栏。底部票带可以收起，把空间还给地图。

项目以 **MIT** 协议开源。仓库只包含源码和合成测试数据，不包含真实票据、照片、私人轨迹、账号密码或维护者的部署资料。新安装从空收藏开始。

## 已有功能

- 批量收录照片，按内容去重；原始图片字节保留，扫描票面、缩略图分别保存。
- 传统图像处理：纸张边界检测、透视校正、方向处理、OCR；不调用 GPT、云 OCR 或生图接口，不生成缺失的票面文字。
- 搜索地点、日期、车次、文件名与故事；年份筛选、随机翻票、全屏票面与旅程笔记。
- Leaflet 地图与照片聚合；导入 GPX / GeoJSON，保留轨迹分段，不跨缺口连线。
- 本机 IndexedDB 收藏；或部署带邮箱验证码注册、邀请码和独立收藏的多用户服务器版。
- 站内「提建议」入口；站长收件箱、邮件通知、处理状态，以及邮件失败后的重试。

## 本机运行

需要 Node.js 22.18+；自动扫描还需要 macOS 和 Xcode Command Line Tools（`swiftc`、Vision / CoreImage）。其他系统可以开发前端，但本机扫描接口依赖 macOS；Linux 扫描用于下述服务器模式。

```bash
git clone https://github.com/mx3353672833-debug/electronic-ticket-wallet.git
cd electronic-ticket-wallet
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

访问 <http://127.0.0.1:5173/>。首次扫描会编译本机扫描程序，耗时较长。

本机收藏与浏览器、协议、主机名、端口绑定；`localhost` 和 `127.0.0.1` 的数据不互通。不要清理站点数据，也不要把 IndexedDB 当成唯一备份。开发页面的私密导出会写到 `.local-data/exports/`，不是公开下载地址。

## 私密服务器

见 [自托管说明](docs/self-hosting.md)。服务器版使用 Node.js + OpenCV + Tesseract，票夹主页、照片和私密 API 均要求登录。注册 / 登录表单可公开访问。默认部署路径为 `/tickets/`，必须通过 HTTPS 反向代理使用。

配置邮件服务并启用多用户后，朋友通过邀请链接打开注册页，输入邮箱、验证码和密码即可使用；不需要自行部署。站长在「账号」里复制邀请链接、查看收到的建议。普通用户无法访问别人的票据、图片或反馈收件箱。

默认按小范围朋友内测配置：20 个账号上限，普通账号 256 MiB 收藏空间，站长 2 GiB；包括原图、扫描缓存和恢复记录。额度可在私密配置中调整，但应先确认磁盘容量。扫描并发有限，验证码与反馈均有发送限制。当前采用单进程文件存储，不适合直接扩展为大规模公开服务。

**不能把真实照片放进 `public/`，也不能只把 `dist/` 上传到公开静态托管。** 本机与服务器是独立收藏，目前没有自动双向同步或通用迁移向导。

## 线路和识别的边界

地图只绘制有几何数据的线路。没有线路时仅标站点或保留在待定位列表，不用起终点直线冒充实际轨迹。

1. 导入的 GPX / GeoJSON 优先，坐标按 WGS84 原样绘制。
2. 可选铁路脚本基于 OSM 路网计算路径，保留真实线形，但**不代表历史车次经由已确认，更不是当次 GPS**。界面标注「铁路路网推算」。
3. 开源包不附站名词典或路网缓存。新收藏可以手动补充信息、导入轨迹；自动站点定位和路网匹配需要自行准备数据。
4. 新站点组合尚不自动在线查车次；航班也不画模拟航迹。足迹软件的专有备份格式尚未接入。
5. OCR、纸张四角检测都有可能出错。识别结果必须人工核对；手动四角编辑器尚未实现，可切换查看保留的原图。

### 可选的离线路网准备（macOS）

从 [HOT/HDX](https://data.humdata.org/dataset/hotosm_chn_railways) 自行下载中国铁路 GeoJSON ZIP。脚本要求其中包含 `railways.geojson` 与 `metadata.json`，数据不是项目的一部分。

```bash
mkdir -p .local-data/bin
swiftc scripts/scan-ticket.swift -o .local-data/bin/scan-ticket
python3 scripts/build-rail-network.py /absolute/path/china-osm-railways.zip
node scripts/process-folder.mjs /absolute/path/your-ticket-photos
python3 scripts/build-rail-network.py /absolute/path/china-osm-railways.zip
python3 scripts/rail-route.py
```

然后在票夹中「重新整理」以应用结果。所有扫描结果、OCR 全文、站点索引和路径缓存都在 `.local-data/`。脚本不修改源照片，不直接写浏览器数据库。路网使用当前数据，不能据此证明历史铁路经由；请保留来源日期和 OSM 署名。只加载自己生成的 `rail-network.pickle`，不要加载他人提供的 pickle 文件。

## 检查与开发

```bash
npm test
npm run test:server
npm run lint
npm run build
npm run build:server
```

测试使用合成数据，不需要私人缓存。改动地图或上传流程后，还应实测桌面和手机：收录 → 搜索 → 开票 → 原图切换 → 故事保存 → 刷新。测试通过不代表 OCR 准确率或历史经由已验收。

- `src/`：React / TypeScript 界面、IndexedDB 与状态管理。
- `server/`：本机扫描接口、独立私密服务和测试。
- `scripts/`：传统扫描、离线路网处理、服务器构建与空收藏初始化。
- `docs/self-hosting.md`：通用部署模板，不含实际账号或服务器信息。

贡献前请读 [CONTRIBUTING.md](CONTRIBUTING.md)。隐私与部署风险见 [SECURITY.md](SECURITY.md)。

## 隐私与许可

票据通常包含姓名、证件信息和出行记录。请勿在公开 Issue、截图、示例或仓库中上传未脱敏内容。本项目支持用户间的数据隔离，但不是端到端加密服务；服务器管理员在运维时可能接触数据。尚未经过独立安全审计。

扫描不会把照片发送给第三方 AI；底图会向 OpenStreetMap 请求瓦片，瓦片区域可能反映正在浏览的地理区域。联网底图不等于离线运行。

项目原创代码使用 [MIT](LICENSE)，第三方软件和地图数据仍受各自许可证约束，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
