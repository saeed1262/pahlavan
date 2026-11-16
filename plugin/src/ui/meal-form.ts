// The meal form (Pahlavan: Log a meal, and the Food tab's button): what the
// user ate in their own words, an optional photo (dropped or chosen), the
// day and the time. Save hands it to the writer, which keeps it in
// Coach/Inbox/meals/ for the coach to estimate; the form never shows a
// number, since Pahlavan estimates nothing. Drawn like a reminder card (the
// same classes), in its own modal. Standard DOM only.

import type { MealFormField } from '../../../src/report/meal-pending.ts';
import type { MealFormInput, MealSaveOutcome } from '../meal-writer.ts';
import { isHeic, isImage } from './cards.ts';
import { h, icon } from './dom.ts';

export interface MealFormControls {
  save(input: MealFormInput): Promise<MealSaveOutcome>;
  /** Closes the form (Cancel, the ×, or after a save). */
  close(): void;
  /** After a save: the modal closes and the caller says where it went. */
  saved(id: string, photo: boolean): void;
}

interface Pick {
  name: string;
  file: Blob | null;
  url: string | null;
}

export class MealFormController {
  readonly el: HTMLElement;
  private readonly controls: MealFormControls;
  private text = '';
  private date: string;
  private at: string;
  private photo: Pick | null = null;
  private busy = false;
  private msg: string | null = null;
  private bad = new Set<MealFormField>();
  private readonly made: string[] = [];

  /** `start`: the day (the training day) and the time (now) the form opens on. */
  constructor(start: { date: string; at: string }, controls: MealFormControls) {
    this.controls = controls;
    this.date = start.date;
    this.at = start.at;
    this.el = h('div', { class: 'pahlavan-view pv-nv is-meal' });
    this.draw();
  }

  /** Enter: Save (a newline in the text box stays a newline). */
  submit(): void {
    void this.save();
  }

  /** The preview URLs made, revoked when the modal closes. */
  urls(): string[] {
    return [...this.made];
  }

  focus(): void {
    this.el.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }

  private draw(): void {
    this.el.replaceChildren(...[
      h('div', { class: 'pv-nv-head' },
        h('span', { class: 'pv-nv-icon' }, icon('bowl')),
        h('div', { class: 'pv-nv-head-t' }, h('div', { class: 'pv-kicker' }, 'Food'), h('h3', { class: 'pv-nv-title' }, 'Log a meal'), h('div', { class: 'pv-nv-sub' }, 'Your coach estimates it next time you talk to it.')),
        h('button', { class: 'pv-nv-x', 'aria-label': 'Close', title: 'Close', onclick: () => this.controls.close() }, icon('x')),
      ),
      h('div', { class: 'pv-nv-body' },
        h('label', { class: `pv-field pv-nv-field pv-meal-text${this.bad.has('text') ? ' is-bad' : ''}`, 'data-field': 'text' },
          h('span', {}, 'What you ate'),
          h('textarea', {
            rows: 4,
            'aria-label': 'What you ate',
            placeholder: 'Chicken, rice and salad: a palm of chicken, a cupped hand of rice, cooked in a little olive oil',
            oninput: (ev: Event) => {
              this.text = (ev.target as HTMLTextAreaElement).value;
              this.clear('text');
            },
          }, this.text),
          h('small', {}, 'Anything that helps: the portions, the oil or butter, a label’s numbers.'),
        ),
        this.photoZone(),
        h('div', { class: 'pv-nv-fields is-2' },
          h('label', { class: `pv-field pv-nv-field${this.bad.has('date') ? ' is-bad' : ''}`, 'data-field': 'date' },
            h('span', {}, 'Day'),
            h('span', { class: 'pv-field-in' }, h('input', { type: 'date', 'aria-label': 'Day', value: this.date, oninput: (ev: Event) => { this.date = (ev.target as HTMLInputElement).value; this.clear('date'); } }))),
          h('label', { class: `pv-field pv-nv-field${this.bad.has('at') ? ' is-bad' : ''}`, 'data-field': 'at' },
            h('span', {}, 'Time'),
            h('span', { class: 'pv-field-in' }, h('input', { type: 'time', 'aria-label': 'Time', value: this.at, oninput: (ev: Event) => { this.at = (ev.target as HTMLInputElement).value; this.clear('at'); } })),
            h('small', {}, 'Optional')),
        ),
      ),
      this.msg ? h('div', { class: 'pv-nv-msg', role: 'alert' }, icon('alert'), h('span', {}, this.msg)) : null,
      h('div', { class: 'pv-nv-why' }, icon('info'), h('div', {}, h('span', {}, 'Saved for your coach, not estimated here. The photo stays only until your coach has read it, and never goes into git.'))),
      h('div', { class: 'pv-nv-foot' },
        h('div', { class: 'pv-nv-foot-l' }, h('button', { class: 'pv-btn-quiet', onclick: () => this.controls.close() }, 'Cancel')),
        h('button', { class: 'pv-btn-primary', disabled: this.busy, 'data-k': 'meal-save', onclick: () => void this.save() }, icon('check'), this.busy ? 'Saving…' : 'Save for my coach'),
      ),
    ].filter((x): x is HTMLDivElement => x !== null));
  }

  private photoZone(): HTMLElement {
    const p = this.photo;
    const input = h('input', { type: 'file', accept: 'image/*,.heic,.heif', class: 'pv-nv-file', 'aria-label': 'Meal photo' });
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) this.put(f);
    });
    const box = h('div', { class: `pv-nv-pose-box${this.bad.has('photo') ? ' is-bad' : ''}`, role: 'button', tabindex: '0', 'aria-label': p ? 'Change the photo' : 'Add a photo', onclick: () => input.click() },
      p
        ? [p.url ? h('img', { class: 'pv-nv-thumb-img', src: p.url, alt: 'Meal photo' }) : h('div', { class: 'pv-nv-thumb' }, icon('camera')), h('span', { class: 'pv-nv-pose-ok' }, icon('check'))]
        : [icon('camera'), h('span', {}, 'Drop a photo', h('br'), 'or choose')],
    );
    box.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      box.classList.add('is-over');
    });
    box.addEventListener('dragleave', () => box.classList.remove('is-over'));
    box.addEventListener('drop', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      box.classList.remove('is-over');
      const f = [...(ev.dataTransfer?.files ?? [])].find((x) => isImage(x));
      if (f) this.put(f);
    });
    return h('div', { class: `pv-meal-photo${p ? ' is-filled' : ''}`, 'data-field': 'photo' },
      h('div', { class: `pv-nv-pose${p ? ' is-filled' : ''}` }, box, input),
      h('div', { class: 'pv-meal-photo-t' },
        h('b', {}, 'Photo'), h('small', {}, p ? p.name : 'Optional: the coach reads it once, then it’s deleted.'),
        p ? h('button', { class: 'pv-btn-quiet', 'data-k': 'meal-photo-off', onclick: () => this.drop() }, 'Remove the photo') : null),
    );
  }

  private put(file: File): void {
    this.drop(false);
    // Chromium can't draw HEIC; it is converted on save, so the zone shows a camera and the name.
    const url = isHeic(file.name) ? null : URL.createObjectURL(file);
    if (url) this.made.push(url);
    this.photo = { name: file.name, file, url };
    this.clear('photo', false);
    this.clear('text', false);
    this.draw();
  }

  private drop(redraw = true): void {
    if (this.photo?.url) URL.revokeObjectURL(this.photo.url);
    this.photo = null;
    if (redraw) this.draw();
  }

  /** A field typed in loses its mark; the message goes with the last one. */
  private clear(field: MealFormField, redraw = false): void {
    if (!this.bad.delete(field)) return;
    this.el.querySelector(`[data-field="${field}"]`)?.classList.remove('is-bad');
    if (!this.bad.size) this.msg = null;
    if (redraw) this.draw();
  }

  private async save(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.msg = null;
    this.bad.clear();
    this.draw();
    let out: MealSaveOutcome;
    try {
      const data = this.photo?.file ? await this.photo.file.arrayBuffer() : null;
      out = await this.controls.save({ text: this.text, date: this.date, at: this.at, photo: data && this.photo ? { name: this.photo.name, data } : null });
    } catch (e) {
      out = { status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
    this.busy = false;
    if (out.status === 'saved') {
      this.controls.saved(out.id, out.photo);
      this.controls.close();
      return;
    }
    if (out.status === 'invalid') {
      for (const e of out.errors) this.bad.add(e.field);
      this.msg = out.errors.map((e) => e.message).join('; ');
    } else this.msg = `The meal wasn’t saved: ${out.error}. Try again in a moment.`;
    this.draw();
    const first = out.status === 'invalid' ? out.errors[0]?.field : undefined;
    if (first) this.el.querySelector<HTMLElement>(`[data-field="${first}"] textarea, [data-field="${first}"] input`)?.focus();
  }
}
