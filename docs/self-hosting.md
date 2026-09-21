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
sudo chown -R ticket-wallet:ticket-wallet /var/lib/ticket-wallet
```

生成的 `initial-login.json` 包含随机初始密码，权限为 0600。通过安全的本机方式读取，将密码保存到密码管理器后，可自行移除该明文文件；服务只使用 `auth.json` 中的加盐 scrypt 哈希。不要把凭据贴到聊天、终端日志、Issue 或 Git。

新安装的 `stations.json` 和 `routes.json` 是空对象，收藏为空。可以上传和手动录入票面信息；自动站名匹配与路网定位需要按 README 准备自己的数据。也可以直接给每张票导入 GPX / GeoJSON。

## 3. 部署程序

下面路径对应仓库中的 systemd 模板。这是新安装步骤，已有部署应先备份并使用独立发布目录。

```bash
sudo install -d /opt/ticket-wallet/dist /opt/ticket-wallet/server /opt/ticket-wallet/scripts
sudo cp -R dist/. /opt/ticket-wallet/dist/
sudo install -m 0644 .local-data/deploy/server/production.mjs /opt/ticket-wallet/server/
sudo install -m 0644 .local-data/deploy/server/recognition.mjs /opt/ticket-wallet/server/
sudo install -m 0644 .local-data/deploy/scripts/scan-ticket-linux.py /opt/ticket-wallet/scripts/
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

- 未登录时主页跳转到登录页，`/tickets/api/tickets` 和 `/tickets/media/<id>` 返回 401。
- 登录后用不含私人信息的测试图片检查上传、扫描、元数据编辑和刷新。
- 检查登出、错误密码限速、跨来源写请求拒绝；确认原始照片未被修改。
- 核对手机上的地图、缩略带展开/收起，以及原图切换。
- 在受控位置备份完整数据目录：manifest、images、scans、auth、stations、routes。备份也属于敏感资料。
- 升级先停写或停止服务并备份，再更新程序文件；不要用空 manifest 替换原收藏。

服务是单用户的，登录态在内存中，重启后需重新登录。没有自动异地备份，也没有本机 IndexedDB 与服务器的双向同步。
