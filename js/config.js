// ============================================================
// 《风栖群岛》全局配置：调色板 / 岛屿 / 路线 / 世界参数
// ============================================================

// 水彩绘本调色板（sRGB 十六进制）
export const PALETTE = {
  skyZenith: 0x86acd6,
  skyMid: 0xa9c6e4,
  horizon: 0xeee4d4,
  horizonWarm: 0xf4d7b4,
  below: 0xc3c6dc,
  fog: 0xd6dcea,
  haze: 0xd9dfee,
  sun: 0xfff0d4,

  cream: 0xf5ecd9,
  creamDark: 0xe2d4b8,
  sage: 0x9db58f,
  sageLight: 0xbfd1a0,
  sageDark: 0x6f8f74,
  sageDeep: 0x55735e,
  gold: 0xd9b45a,
  goldLight: 0xecd393,
  copper: 0xc58a5a,
  coral: 0xe39a86,
  coralSoft: 0xefbcaa,
  pink: 0xf0b9c4,
  lavender: 0xb9addb,
  butter: 0xf2dc8c,
  lilac: 0x9c9cc4,
  stone: 0xd4c8b2,
  stoneDark: 0xa99c8c,
  wood: 0xa77b5a,
  woodDark: 0x7d5a45,
  soil: 0xa8826a,
  rose: 0xc4a0a0,
  rockBlue: 0x8f95b5,
  rockDeep: 0x6f789b,
  snow: 0xf4f5f9,
  ice: 0xbcd6ea,
  water: 0xa6d0e0,
  pine: 0x5f8073,
  glowWarm: 0xffdca0,
  glowMint: 0xa8f2d6,
};

export const WORLD = {
  cloudSeaY: -330,
  fogNear: 280,
  fogFar: 5200,
  sunDir: [-0.55, 0.52, -0.65],
};

// 主题岛屿（center 为岛顶基准高度所在点）
export const ISLANDS = [
  { id: 'main', name: '风栖主岛', sub: '金叶古树下的温暖起点', station: '风栖站', theme: 'main',
    center: [0, 0, 0], radius: 80, depth: 130, seed: 11, hill: 2.2, stationSide: 1, mapColor: '#b9cf9a' },
  { id: 'flower', name: '花海岛', sub: '风把花香吹成了海', station: '花海站', theme: 'flower',
    center: [560, 28, -430], radius: 96, depth: 150, seed: 23, hill: 5, mapColor: '#efb7c0' },
  { id: 'port', name: '云港岛', sub: '群岛的空中交通枢纽', station: '云港中央站', theme: 'port',
    center: [1000, -10, 160], radius: 84, depth: 160, seed: 37, hill: 1.2, mapColor: '#e8d6b0' },
  { id: 'forest', name: '森林岛', sub: '巨树与萤光的低语', station: '森语站', theme: 'forest',
    center: [500, -35, 780], radius: 106, depth: 180, seed: 41, hill: 4, mapColor: '#86a98a' },
  { id: 'lighthouse', name: '灯塔岛', sub: '云海尽头的守望', station: '灯塔站', theme: 'lighthouse',
    center: [-420, 40, 700], radius: 64, depth: 170, seed: 53, hill: 1.5, mapColor: '#c9d7d0' },
  { id: 'snow', name: '雪鸣岛', sub: '高空寒风里的铃音', station: '雪鸣站', theme: 'snow',
    center: [-740, 120, -40], radius: 94, depth: 200, seed: 67, hill: 3, mapColor: '#e4ebf3', pathColor: 0xd6d3e2 },
];

// 主岛北侧的滑翔小浮岛
export const ISLETS = [
  { id: 'islet1', name: '风铃屿', sub: '乘风而至的小岛', theme: 'islet', variant: 'bench',
    center: [60, -16, -150], radius: 17, depth: 45, seed: 101, hill: 0.6, mapColor: '#c5d6a8' },
  { id: 'islet2', name: '望云屿', sub: '看云的人会在这里发呆', theme: 'islet', variant: 'flag',
    center: [-75, -26, -192], radius: 14, depth: 38, seed: 103, hill: 0.5, mapColor: '#c5d6a8' },
  { id: 'islet3', name: '小灯屿', sub: '风的守灯人曾住在这里', theme: 'islet', variant: 'lantern',
    center: [150, -34, -215], radius: 21, depth: 55, seed: 107, hill: 0.8, mapColor: '#c5d6a8' },
];

// 上升气流（滑翔时进入可抬升）
export const UPDRAFTS = [
  { x: 36, z: -118, y0: -70, y1: 22, r: 7 },
  { x: 112, z: -178, y0: -90, y1: 34, r: 7 },
  { x: -48, z: -150, y0: -80, y1: 26, r: 7 },
];

export const ROUTE = ['main', 'flower', 'port', 'forest', 'lighthouse', 'snow'];

export const CASTLE = { pos: [-520, 640, -3900], name: '天空之城 · 艾瑟兰' };
