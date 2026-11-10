import { Story } from "inkjs";
import introStoryData from "../../content/dialogues/intro.json";

export interface DialogueStep {
  text: string;
  choices: string[];
  isComplete: boolean;
  stateJson: string;
}

export interface DialogueChoiceResult extends DialogueStep {
  responseId: string;
  affectionDelta: number;
}

export class InkIntroStory {
  private readonly story: Story;

  constructor(savedStateJson: string | null = null) {
    this.story = new Story(introStoryData);
    if (savedStateJson) this.story.state.LoadJson(savedStateJson);
  }

  beginOrResume(): DialogueStep {
    const text = this.drainToDecision();
    return this.makeStep(text);
  }

  choose(index: number): DialogueChoiceResult {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.story.currentChoices.length
    ) {
      throw new RangeError("The selected Ink choice is not available.");
    }

    this.story.ChooseChoiceIndex(index);
    const text = this.drainToDecision();
    const affectionValue = this.story.variablesState.$("affection_delta");
    const responseValue = this.story.variablesState.$("response_id");
    const step = this.makeStep(text);

    return {
      ...step,
      responseId: typeof responseValue === "string" ? responseValue : "unknown",
      affectionDelta: typeof affectionValue === "number" ? affectionValue : 0,
    };
  }

  private drainToDecision(): string {
    const lines: string[] = [];
    while (this.story.canContinue) {
      const line = this.story.Continue()?.trim();
      if (line) lines.push(line);
    }
    return lines.join("\n\n");
  }

  private makeStep(text: string): DialogueStep {
    const choices = this.story.currentChoices;
    return {
      text,
      choices: choices.map((choice) => choice.text),
      isComplete: !this.story.canContinue && choices.length === 0,
      stateJson: this.story.state.toJson(),
    };
  }
}
