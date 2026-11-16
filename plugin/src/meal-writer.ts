// The meal form's writes: a meal waiting for the coach's estimate, saved in
// Coach/Inbox/meals/ as the user's words and a photo (src/report/
// meal-pending.ts makes the entry), and one taken out again. The photo is
// converted to a JPEG the coach can read (macOS's sips: HEIC included) and
// written first, the entry last, so a reader never finds an entry without
// its photo; both are read back. The folder's .gitignore keeps the photos out
// of a git-backed vault. Pahlavan never estimates: the coach does, with
// `meal add --pending`, which removes these files.

import type { IsoDate } from '../../src/core/schema.ts';
import { paths } from '../../src/adapters/vault/layout.ts';
import { PENDING_GITIGNORE, PENDING_GITIGNORE_NAME, PENDING_PHOTO_EXTS, pendingFilesOf, pendingFromForm, type MealFormField, type PendingPhotoExt } from '../../src/report/meal-pending.ts';
import type { PhotoIn, ReminderAdapter } from './reminders/writer.ts';

export type PhotoConvert = (p: PhotoIn) => Promise<{ data: ArrayBuffer; ext: string }>;

export interface MealFormInput {
  text: string;
  date: string;
  at: string;
  /** The chosen photo, as picked (its own name for the extension), or null. */
  photo: { name: string; data: ArrayBuffer } | null;
}

export type MealSaveOutcome = { status: 'saved'; id: string; photo: boolean } | { status: 'invalid'; errors: { field: MealFormField; message: string }[] } | { status: 'failed'; error: string };

const asExt = (ext: string): PendingPhotoExt | null => {
  const e = ext.toLowerCase();
  return (PENDING_PHOTO_EXTS as readonly string[]).includes(e) ? (e as PendingPhotoExt) : null;
};

export class MealFormWriter {
  private readonly adapter: ReminderAdapter;
  private readonly convert: PhotoConvert;

  /** `convert`: the photo to a JPEG (main.ts passes sips; the preview and tests pass their own). */
  constructor(adapter: ReminderAdapter, convert: PhotoConvert) {
    this.adapter = adapter;
    this.convert = convert;
  }

  private get dir(): string {
    return paths().pendingMeals;
  }

  private async names(): Promise<string[]> {
    if (!(await this.adapter.exists(this.dir))) return [];
    return (await this.adapter.list(this.dir)).files.map((f) => f.slice(f.lastIndexOf('/') + 1));
  }

  /** Saves one waiting meal; `now` is the local moment of the save (its id), `today` the training day. */
  async save(input: MealFormInput, now: { date: IsoDate; time: string }, today: IsoDate): Promise<MealSaveOutcome> {
    if (input.photo && (!this.adapter.writeBinary || !this.adapter.remove)) return { status: 'failed', error: 'this vault cannot save a photo here' };
    let photo: { data: ArrayBuffer; ext: PendingPhotoExt } | null = null;
    if (input.photo) {
      const c = await this.convert({ pose: 'meal', name: input.photo.name, data: input.photo.data });
      const ext = asExt(c.ext);
      if (!ext) return { status: 'invalid', errors: [{ field: 'photo', message: /^hei[cf]$/i.test(c.ext) ? 'This HEIC photo couldn’t be converted here: save it as a JPEG first' : 'Use a JPEG, PNG, WebP or GIF photo' }] };
      photo = { data: c.data, ext };
    }
    const plan = pendingFromForm({ form: { text: input.text, date: input.date, at: input.at, photoExt: photo?.ext ?? null }, today, now, taken: await this.names() });
    if (plan.errors.length || !plan.file || !plan.text) return { status: 'invalid', errors: plan.errors };
    const dir = this.dir;
    try {
      if (!(await this.adapter.exists(dir))) await this.adapter.mkdir?.(dir);
      const ignore = `${dir}/${PENDING_GITIGNORE_NAME}`;
      if (!(await this.adapter.exists(ignore))) await this.adapter.write(ignore, PENDING_GITIGNORE);
      if (photo && plan.photoFile) {
        await this.adapter.writeBinary!(`${dir}/${plan.photoFile}`, photo.data);
        if (!(await this.adapter.exists(`${dir}/${plan.photoFile}`))) return { status: 'failed', error: 'the photo did not save' };
      }
      const file = `${dir}/${plan.file}`;
      await this.adapter.write(file, plan.text);
      if ((await this.adapter.read(file)) !== plan.text) {
        await this.cleanUp(plan.id!);
        return { status: 'failed', error: 'the meal did not read back as written' };
      }
    } catch (e) {
      await this.cleanUp(plan.id!);
      return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
    return { status: 'saved', id: plan.id!, photo: photo !== null };
  }

  /** Takes a waiting meal out: its entry, then its photo. */
  async remove(id: string): Promise<{ status: 'removed' | 'gone' } | { status: 'failed'; error: string }> {
    if (!this.adapter.remove) return { status: 'failed', error: 'this vault cannot remove files here' };
    const files = pendingFilesOf(await this.names(), id);
    if (!files.length) return { status: 'gone' };
    try {
      for (const f of files) await this.adapter.remove(`${this.dir}/${f}`);
    } catch (e) {
      return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
    const left = pendingFilesOf(await this.names(), id);
    return left.length ? { status: 'failed', error: `${left.join(', ')} could not be removed` } : { status: 'removed' };
  }

  /** A save that stopped half way: whatever it wrote goes again. */
  private async cleanUp(id: string): Promise<void> {
    try {
      for (const f of pendingFilesOf(await this.names(), id)) await this.adapter.remove?.(`${this.dir}/${f}`);
    } catch {
      // the coach's `meal discard` clears what is left
    }
  }
}
