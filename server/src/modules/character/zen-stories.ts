export interface ZenStory {
  id: "zhaozhou_tea" | "finger_and_moon" | "wind_flag_mind";
  title: string;
  telling: string;
  reflection: string;
}

export const zenStories: readonly ZenStory[] = [
  {
    id: "zhaozhou_tea",
    title: "赵州吃茶",
    telling: "禅门常讲：有人来问赵州禅师，无论来过还是初来，他都只答“吃茶去”。这不是把问题赶走，而是先让人回到眼前真实的一杯茶。",
    reflection: "有些答案不是再想一层，而是先看清此刻正在发生什么。",
  },
  {
    id: "finger_and_moon",
    title: "指月",
    telling: "禅门常用“指月”作譬喻：手指能指出月亮，却不是月亮本身。若只盯着手指，反而会错过它所指的方向。",
    reflection: "名字、判断和方法都可以帮助理解，但不等于事情本身。",
  },
  {
    id: "wind_flag_mind",
    title: "风幡之辩",
    telling: "《坛经》中有风动、幡动之辩，六祖把争论转向观看者的心。这个故事不是说外界不存在，而是提醒人：我们同时也在经历自己的解释。",
    reflection: "事实与心里的解释可以同时看见，不必把其中一个抹掉。",
  },
] as const;

const storyRequestPattern = /^(?:鹿禅[，,\s]*)?(?:请|给我|来|想听|想要)?(?:给我)?(?:讲|说|分享).{0,24}(?:禅宗|禅门|禅意|公案|故事)|(?:我想听|我想要|请讲|给我讲|来一个|来个|有没有).{0,24}(?:禅宗|禅门|禅意|公案|故事)|(?:禅宗|禅门|禅意|公案).{0,16}(?:讲讲|讲一个|听听|来一个|来个)/u;

export function selectZenStory(userText: string): ZenStory | null {
  if (!storyRequestPattern.test(userText)) return null;
  if (/(?:念头|判断|标签|答案|道理|方法|执着|执念)/u.test(userText)) return zenStories[1]!;
  if (/(?:争论|争执|事实|解释|怎么看|谁对|谁错)/u.test(userText)) return zenStories[2]!;
  return zenStories[0]!;
}

export function renderZenStory(story: ZenStory): string {
  return `${story.title}。${story.telling}${story.reflection}`;
}

export function zenStoryPromptContext(story: ZenStory, userText: string): string {
  return [
    "## 用户主动请求的禅宗故事",
    `故事=${story.title}`,
    `可用讲法=${story.telling}`,
    `可用观照=${story.reflection}`,
    `用户原话=${userText}`,
    "用自己的话讲清楚，最多四句；称为禅门故事、譬喻或经典记载，不声称逐字史实。若用户没有给出现实处境，不强行心理分析；若给了处境，只连接一个具体落点，不把故事当处方。",
  ].join("\n");
}
