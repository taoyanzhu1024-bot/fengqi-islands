# 资产清单（V2）

本项目没有使用外部 3D 模型、贴图或音频文件。所有内容都由代码在浏览器中生成。
需求中“优先使用 Blender / GLB 高质量模型”的部分**尚未实现**：当前的开发环境无法运行 Blender，也没有可用的授权模型资产。下面列出的都是程序化模型，精细度低于专业建模资产。

| 资产 | 文件 | 说明 |
| --- | --- | --- |
| 列车「风栖号」 | js/world/train.js | 车头 + 客车；车身、内饰、车窗、灯具、车门、车轮、连杆、烟囱、前灯为独立部件 |
| 飞艇「风帆号」 | js/world/airship.js | 车床旋转体气囊（分瓣色带）、带内饰的吊舱（座椅、舵轮、吊灯、行李架、船尾沙发）、舱门、舷梯、三副螺旋桨、方向舵、可展开风帆、航行灯、名牌 |
| 空港 | js/world/airship.js | 栈桥、T 形登船台、栏杆闸门、系泊塔、售票亭、风向袋 |
| 云鲸 | js/world/whale.js | 旋转体身体、可摆动尾干与尾鳍、胸鳍、背部云团、夜光点 |
| 天空之城建筑 | js/world/city/buildings.js、js/world/islands/city.js | 联排小楼、拱廊、尖塔、喷泉、车站大厅、钟楼、王庭 |
| 居民 / 村民 | js/world/city/residents.js | 4 种服装、实例化渲染，天空之城 42 人，其余各岛共 27 人 |
| 岛屿道具 | js/world/props.js | 树、房屋、风车、灯塔、水井、花箱、晾衣绳、推车、蜂箱、野餐布、小木桥、柴堆、树桩、稻草人、邮筒、雪人、雪橇、原木小屋、彩旗、集市小摊、划艇、花拱门、树屋、石灯笼等 |
| 文字牌 | js/core/materials.js `textTexture` | Canvas 绘制 |
| 音频 | js/audio/audio.js | Web Audio 实时合成，见 docs/AUDIO.md |
| 第三方库 | lib/three.module.min.js | Three.js r170（MIT 许可） |
