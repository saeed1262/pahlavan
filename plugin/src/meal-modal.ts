// The meal form in Obsidian: a Modal holding the form's controller. Enter is
// Save (a newline in the text box stays one); closing it keeps nothing.
//
// No field here may shadow a Modal member (the guard test checks this file
// as it checks the card's).

import { Modal, type App } from 'obsidian';
import type { MealFormInput, MealSaveOutcome } from './meal-writer.ts';
import { MealFormController } from './ui/meal-form.ts';

export interface MealModalDeps {
  /** The day the form opens on (the training day) and the time now, HH:MM. */
  start: { date: string; at: string };
  save(input: MealFormInput): Promise<MealSaveOutcome>;
  saved(id: string, photo: boolean): void;
}

export class MealModal extends Modal {
  private readonly form: MealFormController;

  constructor(app: App, deps: MealModalDeps) {
    super(app);
    this.form = new MealFormController(deps.start, { save: (i) => deps.save(i), saved: (id, photo) => deps.saved(id, photo), close: () => this.close() });
  }

  override onOpen(): void {
    this.modalEl.classList.add('pahlavan-modal');
    this.containerEl.classList.add('pahlavan-modal-container');
    this.contentEl.replaceChildren(this.form.el);
    this.scope.register([], 'Enter', (ev) => {
      const t = ev.target as HTMLElement | null;
      if (t && t.tagName === 'TEXTAREA') return true;
      this.form.submit();
      return false;
    });
    this.form.focus();
  }

  override onClose(): void {
    for (const u of this.form.urls()) URL.revokeObjectURL(u);
    this.contentEl.replaceChildren();
  }
}
