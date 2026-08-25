import { describe, expect, it } from "vitest";
import { renderZenStory, selectZenStory, zenStoryPromptContext } from "../../src/modules/character/zen-stories.js";

describe("鹿禅的禅宗故事", () => {
  it("only selects a story after an explicit request", () => {
    expect(selectZenStory("我今天脑子很乱")).toBeNull();
    expect(selectZenStory("我昨天给朋友讲了一个禅宗故事")).toBeNull();
    expect(selectZenStory("给我讲一个禅宗故事")).toMatchObject({ id: "zhaozhou_tea" });
  });

  it("selects a relevant story without presenting it as a prescription", () => {
    const story = selectZenStory("讲个关于执念和判断的禅宗公案")!;
    expect(story.id).toBe("finger_and_moon");
    expect(renderZenStory(story)).toContain("手指");
    expect(zenStoryPromptContext(story, "讲个故事")).toContain("不把故事当处方");
  });
});
