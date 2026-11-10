import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Story } from "inkjs";

const compiledStory = readFileSync(
  new URL("../src/content/dialogues/intro.json", import.meta.url),
  "utf8",
).replace(/^\uFEFF/, "");

test("compiled InkJS story exposes two choices and applies the warm response flag", () => {
  const story = new Story(compiledStory);
  const opening: string[] = [];
  while (story.canContinue) {
    const line = story.Continue()?.trim();
    if (line) opening.push(line);
  }

  assert.match(opening.join(" "), /Ты вернулся/);
  assert.equal(story.currentChoices.length, 2);
  story.ChooseChoiceIndex(0);

  const ending: string[] = [];
  while (story.canContinue) {
    const line = story.Continue()?.trim();
    if (line) ending.push(line);
  }

  assert.match(ending.join(" "), /Мне приятно/);
  assert.equal(story.variablesState.$("response_id"), "warm");
  assert.equal(story.variablesState.$("affection_delta"), 3);
  assert.equal(story.currentChoices.length, 0);

  const serialized = story.state.toJson();
  const restored = new Story(compiledStory);
  restored.state.LoadJson(serialized);
  assert.equal(restored.currentChoices.length, 0);
  assert.equal(restored.variablesState.$("response_id"), "warm");
});
