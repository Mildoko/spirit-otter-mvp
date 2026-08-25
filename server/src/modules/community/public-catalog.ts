import type { PublicPortalFeedV01, PublicPortalItemV01 } from "@otter/shared";

const publicItems = [
  {
    id: "night-lantern-walk",
    lane: "happening_now",
    laneLabel: "正在发生",
    title: "山城夜灯慢行",
    summary: "沿旧城河岸走一小段路，看看入夜后的灯与桥。",
    detail: "一场供外圈原型展示的公开活动样例。参与者会沿河岸慢行约四十分钟，中途可以随时离开。当前版本只提供浏览，不能报名或联系组织者。",
    timeLabel: "周五 19:30 · 约 40 分钟",
    placeLabel: "旧城河岸 · 集合点待核验",
    accessLabel: "公共活动样例 · 仅浏览",
    tags: ["散步", "夜景", "低强度"],
    sourceLabel: "BoonZoom 演示目录",
    coverTheme: "lantern",
    dataStatus: "demo",
  },
  {
    id: "koi-shadow-workshop",
    lane: "possibly_relevant",
    laneLabel: "与你可能有关",
    title: "鱼影与水纹小画室",
    summary: "从一尾鱼的游动开始，练习观察水面留下的线条。",
    detail: "一项轻量绘画体验样例，不要求绘画基础，也不代表系统已经知道你的兴趣。当前版本不会根据私人对话生成推荐，只展示预先编辑的公共内容。",
    timeLabel: "周六 14:00 · 约 90 分钟",
    placeLabel: "南岸共享画室 · 地址待核验",
    accessLabel: "公共活动样例 · 仅浏览",
    tags: ["绘画", "观察", "安静"],
    sourceLabel: "BoonZoom 演示目录",
    coverTheme: "koi",
    dataStatus: "demo",
  },
  {
    id: "lotus-listening-evening",
    lane: "wander",
    laneLabel: "随便看看",
    title: "荷灯下的旧曲夜",
    summary: "听几段旧曲，也听一听曲子之间没有被填满的地方。",
    detail: "一则公共文化活动样例，用于验证万象廊的信息层级与视觉节奏。这里没有真实余位、报名或群聊功能，也不会因为你查看它就把它保存成兴趣。",
    timeLabel: "周日 20:00 · 约 60 分钟",
    placeLabel: "湖畔小庭 · 场地待核验",
    accessLabel: "公共活动样例 · 仅浏览",
    tags: ["传统音乐", "夜间", "独自可去"],
    sourceLabel: "BoonZoom 演示目录",
    coverTheme: "lotus",
    dataStatus: "demo",
  },
] satisfies PublicPortalItemV01[];

export function getPublicPortalFeedV01(): PublicPortalFeedV01 {
  return {
    schemaVersion: 1,
    circle: "outer_public",
    dataStatus: "demo",
    generatedAt: "2026-08-25T00:00:00.000Z",
    items: publicItems.map((item) => ({ ...item, tags: [...item.tags] })),
    capabilities: {
      signup: false,
      contact: false,
      post: false,
      joinGroup: false,
      personalizedRecommendation: false,
    },
  };
}

export function getPublicPortalItemV01(id: string): PublicPortalItemV01 | undefined {
  const item = publicItems.find((entry) => entry.id === id);
  return item ? { ...item, tags: [...item.tags] } : undefined;
}
