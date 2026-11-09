# V2.0 开发基线（基于 main @ 5673eca）

## 已有模块（实际存在）

| 文件 | 内容 |
| --- | --- |
| `js/main.js` | 渲染器、灯光、主循环；上下车、交互、HUD、区域着色、阴影跟随都写在 `frame()` 里 |
| `js/config.js` | 调色板、6 座主题岛 `ISLANDS`、3 座滑翔小岛 `ISLETS`、`UPDRAFTS`、`ROUTE`、`CASTLE`（远景坐标） |
| `js/world/world.js` | 构建顺序、`ctx` 布置工具、交互点列表 `interact[]`、`regionAt()` |
| `js/world/railway.js` | `Railway`（站点规划、CatmullRom 闭合曲线、轨道扫掠网格、站台）与 `Train`（状态 idle/arriving/dwell/running） |
| `js/world/terrain.js` | `Island`：rim(θ)、`localHeight`（渲染与碰撞共用）、顶面与岩体网格 |
| `js/world/sky.js` | 天空穹顶 shader、云海 shader、`CloudField` 云朵广告牌 |
| `js/world/background.js` | 远景浮岛、天空之城（仅远景，不可达）、飞鸟 |
| `js/world/props.js` | 程序化道具（树、屋、风车、灯塔、飞艇等），通过 `Batcher` 合批 |
| `js/world/vegetation.js` / `particles.js` | 草、花、粒子、蒸汽、瀑布 |
| `js/player/` | `Character`（基础几何拼接的角色）+ `Player`（walk/air/glide/train/locked） |
| `js/camera/rig.js` | follow / train（4 视角）/ cinematic + 镜头脚本 |
| `js/post/watercolor.js` | 全屏水彩后处理 |
| `js/ui/hud.js` | HUD、小地图 |

## 已知问题（复核代码后确认）

1. **无法下车（P0）**：`main.js` 在乘车分支里按 E 调用 `alight()`，玩家状态立刻变回 `walk`；
   同一帧稍后的“交互提示”分支再次读取同一个 E 按键，命中当前站台的“乘坐列车”交互点（列车此时是 idle 且就在该站），
   于是立刻重新上车。表现为“按 E 没反应 / 无法下车”。根因是**同一次按键被两个系统重复消费**，且没有下车冷却。
2. 下车位置直接用 `st.boardPoint`（轨道外侧 3.2 m），未做地面/碰撞校验。
3. 行驶中按 E 没有任何反馈。
4. 完全没有音频系统。
5. 列车观景车只有露天甲板，没有真实车厢内饰；列车部件被合并成每节车厢一个网格，无法单独动画（车门等）。
6. 天空之城只是不受雾影响的远景，不可到达。
7. 太阳固定，没有昼夜。
8. 主循环无法脱离渲染单独推进，自动化测试只能依赖实时帧率（无头软件渲染约 1 fps）。

## 基线功能（回归测试必须保持）

- 六站环线：呼叫列车、上车、自动运行、停站、选择目的站（1–6）、T 切换视角
- 步行 / 奔跑 / 跳跃 / 滑翔（G、空中再按空格）/ 上升气流 / 乘风台起跳
- 观景台电影镜头（主岛、灯塔岛），V 世界全景，R 返回最近车站，坠落重生
- HUD：区域名、交互提示、小地图、列车信息
