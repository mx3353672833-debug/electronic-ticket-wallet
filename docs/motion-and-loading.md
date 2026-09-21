# 开票与地图的连贯体验

## 选型与视觉方向

复用 [Motion](https://github.com/motiondivision/motion) 13.4.0（MIT；调研时约 3.37 万 Star）的动画控制、spring 与 React 元素；地图缩放和聚合沿用 Leaflet / markercluster 的原生机制，不编写帧循环或另造地图引擎。对照过 react-spring，本项目选择 Motion 以同时处理 DOM 飞入、透明度和退出生命周期。资料：[Motion 动画](https://motion.dev/docs/animate)、[Leaflet API](https://leafletjs.com/reference.html)。

这次只改动感，不另造首页。色板沿用：阅读纸白 `#f5f5f7`、浮层白 `#ffffff`、水面灰蓝 `#e8edf0`、主字 `#1d1d1f`、注释灰 `#737378`、交互蓝 `#007aff`。标题/正文保留系统字体（SF/PingFang），数据用系统等宽字体；不引入阻塞字体下载。视觉重点只有票面从原位置进入阅读区，再收回；其余淡入克制，避免散落装饰动效。

```
地图/票据栏中的票 → 同一张预览平滑展开 → 清晰图解码后渐入
                ← 返回时收回原位置 ←
```

对设计的修正：原先全黑阅读页会打断浅色地图，改为浅色半透明阅读背景；不靠延长动画掩盖大图等待。开合由 Motion 控制，聚合由 Leaflet flyToBounds 和 markercluster 过渡控制。没有点击来源（如随机翻票）采用轻量缩放淡入。支持 `prefers-reduced-motion`；焦点、Escape、未保存笔记确认仍保留。

## 图片与隐私

- 保存的无损票面、原始照片、缩略图及 metadata 全部不覆盖。
- 展示请求使用同一需认证的媒体接口，加 `?view=screen` 或 `?view=thumb`。先验证登录及当前收藏的图片归属，才允许生成/读取展示图；保留 `Cache-Control: no-store`，不设公开 CDN。
- Pillow 仅生成 WebP 展示副本：清晰图最长边 1600 / quality 90，缩略图最长边 384 / quality 84。它是有损传输副本，不宣称与无损存档像素相同。点放大仍读取完整无损票面；查看原图读取原始照片。
- 服务端 `display-cache/` 是可重建缓存，按账号隔离、0600 文件、约 64 MiB 上限，保留至少 1 GiB 磁盘余量。属于运行缓存，不替换用户存档、不写 manifest；全局串行生成并限制队列，失败回退原保存文件。
- 当前页面按 24 张 / 24 MiB 预算复用轻量展示图（至少保留当前图），仅内存 Blob URL，不写 IndexedDB、localStorage 或 Service Worker。原照片和完整无损票面直接显示，不纳入此缓存。退出登录时撤销；页面销毁时由浏览器释放。持久化仍为 `idb://images/...`。
- 用户有意悬浮票面或键盘聚焦时才预取对应清晰图；不预取整本收藏。慢网时先显示已有缩略图，清晰图失败可重试。

## 地图

- 线路采用 Canvas 原生 `tolerance: 11` 扩大命中范围，视觉线宽不变，不生成两份轨迹；原路线坐标与分段不修改。
- 拖动时请求已进入视野的瓦片，保留适量已看过的邻近瓦片，缩放时复用旧瓦片到新瓦片到达。
- 最底层使用 world-atlas / Natural Earth 公共领域陆地轮廓（TopoJSON），为断网/慢网提供基础背景。它不是详细离线地图，网络未恢复时地名和街道不会凭空出现。
- 遵循 [OSM 瓦片政策](https://operations.osmfoundation.org/policies/tiles/)：不批量下载、预热城市或多个缩放层，不绕过 HTTP 缓存，不移除来源署名。
- 移除浏览器内 React 服务端渲染器依赖，用 Leaflet DOM 构建照片标记，文字使用 textContent，避免额外解析和不安全 HTML。

## 维护验证

执行标准前端/服务器/线路测试及构建，额外运行 `python scripts/display-image-test.py`。用独立合成收藏检查：桌面和手机开合、原图/高清、慢网预览、失败重试、连续切票、故事保存、减少动态效果、聚合放大和线路命中。服务端测试需验证匿名/他人图片不可访问、退出后媒体失效、元数据不变。

发布前可在私密服务器以服务用户运行 `node <发布目录>/scripts/warm-display-images.mjs <当前账号收藏目录>`，只预生成票据展示副本，不生成地图瓦片、不修改收藏。现有原图和账户文件不得随程序覆盖。
