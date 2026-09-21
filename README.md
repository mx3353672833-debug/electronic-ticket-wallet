# 电子票夹 · Electronic Ticket Wallet

把车票、登机牌和旅途故事放回地图上。

地图式单页票夹：票面悬浮在对应线路上，搜索、年份筛选、随机翻票都在主页完成。点开票看大图，再按需打开故事侧栏。底部票带可以收起，把空间还给地图。

项目以 **MIT** 协议开源。仓库只包含源码和合成测试数据，不包含真实票据、照片、私人轨迹、账号密码或维护者的部署资料。新安装从空收藏开始。

## 已有功能

- 批量收录照片，按内容去重；原始图片字节保留，扫描票面、缩略图分别保存。
- 传统图像处理：纸张边界检测、透视校正、方向处理、OCR；不调用 GPT、云 OCR 或生图接口，不生成缺失的票面文字。
- 服务器上传后默认统一票面纸色、亮度和展示尺寸，保留原有印字、折痕与磨损；登机牌保留自身版式。大图仍可查看原图，原始照片与旧扫描不覆盖。见 [票面处理说明](docs/appearance-study.md)。
- 搜索地点、日期、车次、文件名与故事；年份筛选、随机翻票、全屏票面与旅程笔记。
- Motion 开合过渡、浅色票面阅读、缩略图先显再渐入清晰图；服务器按需生成轻量展示副本，原照片和无损存档不变。线路支持更宽的鼠标命中范围，底图延迟时保留基础陆地轮廓。见 [动效与加载说明](docs/motion-and-loading.md)。
- Leaflet 地图与照片聚合；「只看轨迹」可隐藏地图票面，并记住选择。导入 GPX / GeoJSON，保留轨迹分段，不跨缺口连线。
- 本机 IndexedDB 收藏；或部署带邮箱验证码、一次性邀请链接和独立收藏的多用户服务器版。
- 站内「提建议」入口；站长收件箱、邮件通知、处理状态，以及邮件失败后的重试。
- 主页「更新记录」按版本列出简短公告，点开查看，不自动弹窗。

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

配置邮件服务并启用多用户后，朋友通过邀请链接打开注册页，输入邮箱、验证码和密码即可使用；不需要自行部署。站长在「账号」里生成一次性邀请链接、查看收到的建议。每个链接 7 天内有效，只能成功注册一个账号，也可提前撤销；旧共用邀请码配置不会自动生效。普通用户无法访问别人的票据、图片或反馈收件箱。

默认按小范围朋友内测配置：20 个账号上限，普通账号 256 MiB 收藏空间，站长 2 GiB；包括原图、扫描缓存和恢复记录。额度可在私密配置中调整，但应先确认磁盘容量。扫描并发有限，验证码与反馈均有发送限制。当前采用单进程文件存储，不适合直接扩展为大规模公开服务。

**不能把真实照片放进 `public/`，也不能只把 `dist/` 上传到公开静态托管。** 本机与服务器是独立收藏，目前没有自动双向同步或通用迁移向导。

## 线路和识别的边界

地图只绘制有几何数据的线路。没有线路时仅标站点或保留在待定位列表，不用起终点直线冒充实际轨迹。

1. 导入的 GPX / GeoJSON 优先，坐标按 WGS84 原样绘制。
2. 车次线路先按车次＋乘车日期查询 RailGo，再截取上下车站之间的有序停站，逐段匹配 OSM 铁路。旧日期无数据时使用可用的同车次时刻表；来源和查询日期保存在数据中。不同停站约束可生成不同路径。地图使用 Canvas 和分级显示细节减少缩放计算，不修改保存的原坐标。
3. 开源包不附站名词典或路网缓存。新收藏可以手动补充信息、导入轨迹；自动站点定位和路网匹配需要自行准备数据。
4. 新上传的火车票扫描后自动查询车次线路；已有票可在旅程笔记中「更新车次线路」，或在「扫描与识别」中「按车次更新全部线路」。查询失败保留原线路；导入的 GPX 不会被覆盖。航班不画模拟航迹，足迹软件的专有备份格式尚未接入。
5. OCR、纸张四角检测都有可能出错。识别结果必须人工核对；手动四角编辑器尚未实现，可切换查看保留的原图。

已接入的公开车次接口、使用条件与历史库授权申请见 [车次数据来源](docs/route-data-sources.md)。RailGo 当前仅支持非商业应用，部署者需遵守其使用条件。

### 可选的离线路网准备（macOS）

从 [HOT/HDX](https://data.humdata.org/dataset/hotosm_chn_railways) 自行下载中国铁路 GeoJSON ZIP。脚本要求其中包含 `railways.geojson` 与 `metadata.json`，数据不是项目的一部分。

```bash
mkdir -p .local-data/bin
swiftc scripts/scan-ticket.swift -o .local-data/bin/scan-ticket
python3 scripts/build-rail-network.py /absolute/path/china-osm-railways.zip
node scripts/process-folder.mjs /absolute/path/your-ticket-photos
python3 scripts/build-rail-network.py /absolute/path/china-osm-railways.zip
python3 scripts/rail-route.py
python3 scripts/rail_graph.py .local-data/rail-network.pickle .local-data/rail-network.rgraph
```

然后在票夹中「扫描与识别」→「按车次更新全部线路」。所有扫描结果、OCR 全文、站点索引和路径缓存都在 `.local-data/`。脚本不修改源照片，不直接写浏览器数据库。私密服务器需把自己生成的 `rail-network.rgraph` 和 `stations.json` 放入 `WALLET_DATA` 数据目录，由服务账号读取。rgraph 使用内存映射，减少整张铁路图加载时的内存占用。转换器拒绝覆盖已有文件，更新时先生成新文件再切换；只转换自己生成的可信 pickle 文件，数据目录不得公开。

## 检查与开发

```bash
npm test
npm run test:server
npm run test:routes
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

每次发布需同步追加网页公告并升版本，见 [发布检查清单](docs/releasing.md)。`npm run build` 会校验公告与版本一致；发布前还需 `npm run check:release -- --since <上次线上提交>`，避免漏升版本或删掉旧公告。

## 隐私与许可

票据通常包含姓名、证件信息和出行记录。请勿在公开 Issue、截图、示例或仓库中上传未脱敏内容。本项目支持用户间的数据隔离，但不是端到端加密服务；服务器管理员在运维时可能接触数据。尚未经过独立安全审计。

扫描不会把照片发送给第三方 AI；底图会向 OpenStreetMap 请求瓦片，瓦片区域可能反映正在浏览的地理区域。联网底图不等于离线运行。

项目原创代码使用 [MIT](LICENSE)，第三方软件和地图数据仍受各自许可证约束，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
