# 自托管：独立私密票夹

以下是新安装模板，不是维护者的实际服务器配置。示例域名必须换成你自己的域名。已有收藏不要重新初始化，也不要覆盖数据目录。

## 1. 环境与构建

准备 Linux、Node.js 22.18+、Python 3.10+、HTTPS 域名和反向代理。Debian / Ubuntu 的扫描依赖示例：

```bash
sudo apt-get install python3-venv tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng
sudo python3 -m venv /opt/ticket-wallet-venv
sudo /opt/ticket-wallet-venv/bin/pip install opencv-python-headless Pillow numpy
npm ci
npm run test:server
npm run build:server
```

`build:server` 生成 `dist/`，并把独立服务、共享识别逻辑和 Linux 扫描脚本放到 `.local-data/deploy/`。这个目录可能同时包含本机私密文件：**不要打包或上传整个 `.local-data` 或整个 `deploy` 目录**，仅复制下方明确列出的文件。

## 2. 初始化全新收藏

从仓库目录执行。`/var/lib/ticket-wallet` 必须尚不存在，父目录须已存在；初始化器遇到已有目录会拒绝操作，不会轮换原账号或覆盖收藏。

```bash
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin ticket-wallet
sudo node scripts/init-wallet.mjs /var/lib/ticket-wallet https://tickets.example.com owner
sudo node scripts/upgrade-accounts.mjs /var/lib/ticket-wallet owner@example.com --dry-run
sudo node scripts/upgrade-accounts.mjs /var/lib/ticket-wallet owner@example.com
sudo chown -R ticket-wallet:ticket-wallet /var/lib/ticket-wallet
```

生成的 `initial-login.json` 包含随机初始密码，权限为 0600。通过安全的本机方式读取，将密码保存到密码管理器后，可自行移除该明文文件；服务只使用 `auth.json` 中的加盐 scrypt 哈希。不要把凭据贴到聊天、终端日志、Issue 或 Git。

多用户升级器只添加 `accounts.json` 和 `service.json`，不会移动图片、重写原收藏或重置原密码。已有单用户安装必须先备份整个私密数据目录，运行 `--dry-run` 核对后再升级；不用重新运行初始化器。站长邮箱由部署时明确指定，不会把第一位注册者提升为站长。

通过安全编辑器配置 `/var/lib/ticket-wallet/service.json` 中的 `smtp`，保留自动生成的邀请码和其它字段：

```json
{
  "host": "smtp.example.com",
  "port": 465,
  "secure": true,
  "auth": { "user": "sender@example.com", "pass": "YOUR_SMTP_AUTHORIZATION_CODE" }
}
```

以上对象是 `smtp` 字段的值，不是完整 service.json。465 使用 TLS；587 应设 `secure: false`，服务仍强制 STARTTLS。这里通常填写邮件服务的授权码，而不是网页登录密码。文件权限须为 0600，归服务用户所有，不要提交到 Git。未配置邮件时注册 / 找回密码不可用，不会在日志中输出验证码供绕过。

仅支持 `registration: "invite"`，站长登录后在「账号」中生成一次性邀请链接。每个链接限成功注册一个账号，7 天有效，可撤销；打开或发送验证码不会核销，注册时原子核销。链接以 URL fragment 携带令牌，服务端仅存摘要。旧 `inviteCode` 配置不再生效，不支持开放注册。`feedbackTo` 为接收建议通知的邮箱。`memberQuotaBytes` 影响新账号；已有账号额度在私密 accounts.json 的对应用户记录中维护。修改这些配置前备份、停止服务，修改后再启动；不要与运行中的写操作竞争。当前只支持一个服务进程。

新安装的 `stations.json` 和 `routes.json` 是空对象，收藏为空。可以上传和手动录入票面信息；自动站名匹配与路网定位需要按 README 准备自己的数据。也可以直接给每张票导入 GPX / GeoJSON。

旧邀请地址兼容：注册入口会把 URL query 中格式正确的 `invite` 移到 fragment，但不会因此授予注册权限。除新生成的令牌外，校验器也识别 16 位旧令牌；它必须由运维明确登记为带有效期的单次邀请摘要才有效，单独保留 `service.json` 的 `inviteCode` 无效。不要批量恢复旧共用码，也不要重置已使用或已撤销的记录。

## 3. 部署程序

下面路径对应仓库中的 systemd 模板。这是新安装步骤，已有部署应先备份并使用独立发布目录。

```bash
sudo install -d /opt/ticket-wallet/dist /opt/ticket-wallet/server /opt/ticket-wallet/scripts /opt/ticket-wallet/node_modules
sudo cp -R dist/. /opt/ticket-wallet/dist/
sudo cp -R .local-data/deploy/server/. /opt/ticket-wallet/server/
sudo cp -R .local-data/deploy/scripts/. /opt/ticket-wallet/scripts/
sudo cp -R .local-data/deploy/node_modules/nodemailer /opt/ticket-wallet/node_modules/
sudo install -m 0644 server/ticket-wallet.service /etc/systemd/system/
```

核对 `server/ticket-wallet.service` 中 Node 的绝对路径、Python 虚拟环境路径、运行账号和数据目录，再启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ticket-wallet
```

服务仅监听 `127.0.0.1:3031`。扫描需要 Tesseract 的中文、英文和方向识别语言包；可用 `tesseract --list-langs` 检查 `chi_sim`、`eng`、`osd`。

## 4. HTTPS 反向代理

将以下片段放入**已正确配置证书**的 Nginx HTTPS `server` 块。`auth.json` 的 `origin` 必须与实际 HTTPS 来源完全一致（不含 `/tickets/` 路径）。

```nginx
location = /tickets { return 308 /tickets/; }
location /tickets/ {
    proxy_pass http://127.0.0.1:3031;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 40m;
    proxy_read_timeout 180s;
}
```

`proxy_pass` 末尾不带 `/`，保留 `/tickets/` 前缀。必须覆盖 `X-Real-IP`，不能信任客户端自带值。不要为图片目录或前端包另设绕过认证的静态映射；数据目录不能放到 Nginx Web 根目录下。生产环境保持 Secure Cookie，不以关闭安全检查解决登录问题。

## 5. 上线检查与备份

- 未登录时主页跳转到登录页，`/tickets/api/tickets` 和 `/tickets/media/<id>` 返回 401；注册表单可以访问。
- 用两个合成账号验证邮箱收码、注册、退出、重新登录、重置密码；新账号不应看到站长既有票据。对别人的票据 ID 和图片 ID 访问都应被拒绝，不能只测试界面。
- 登录后用不含私人信息的测试图片检查上传、扫描、元数据编辑和刷新。
- 检查登出、错误密码限速、跨来源写请求拒绝；确认原始照片未被修改。
- 核对手机上的地图、缩略带展开/收起，以及原图切换。
- 验证「提建议」保存、站长收件箱和邮件通知；通知失败会保持 pending 并按退避间隔重试，站内建议不丢失。发件服务接受不等于邮件一定进入收件箱，需检查垃圾邮件和域名投递配置。
- 在受控位置备份完整数据目录，包括 auth、accounts、service、feedback、users 及原有 manifest/images/scans/stations/routes。备份也属于敏感资料。
- 升级先停写或停止服务并备份，再更新程序文件；不要用空 manifest 替换原收藏。

服务使用单进程文件存储，登录态在内存中，重启后需重新登录。没有自动异地备份，也没有本机 IndexedDB 与服务器的双向同步。除非有新配置文件，原单用户服务仍可运行；启用后不能只回退账号配置而继续运行多用户代码。
