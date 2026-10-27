import { useState, type ChangeEvent } from 'react';
import type { Workout } from '../contract.ts';
import { localDate } from '../core/diary.ts';
import { parseNotes } from '../core/import/notesParser.ts';
import { Sheet } from './Sheet.tsx';
import { dayTitle } from './format.ts';

type Props = { onImport: (workouts: Workout[]) => void; onClose: () => void };

/** Paste workout notes (or open a text file), check what was read, then import. */
export function ImportSheet({ onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const today = localDate(new Date());
  const result = text.trim() ? parseNotes(text, today) : null;

  async function openFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }

  return (
    <Sheet title="Import from notes" onClose={onClose}>
      <p className="muted">
        Paste your workout notes. Start each day with its date, then one exercise per line, e.g.
        <br />
        <code>20/10 Chest &amp; back</code>
        <br />
        <code>Bench press 80x8, 80x8, 85x6</code>
        <br />
        <code>Pull ups 3x8</code>
      </p>
      <label className="field">
        <span>Notes</span>
        <textarea
          className="notes-input"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </label>
      <label className="link-btn file-btn">
        Or open a text file
        <input type="file" accept=".txt,text/plain" onChange={(e) => void openFile(e)} />
      </label>

      {result && (
        <div className="import-preview" aria-live="polite">
          <p>
            <strong>
              {result.workouts.length} {result.workouts.length === 1 ? 'workout' : 'workouts'} found
            </strong>
          </p>
          <ul className="import-list">
            {result.workouts.slice(0, 30).map((w) => (
              <li key={w.id}>
                {dayTitle(w.date, today)} · {w.title ?? (w.kind === 'run' ? 'Run' : 'Workout')} ·{' '}
                {w.exercises.length} {w.exercises.length === 1 ? 'exercise' : 'exercises'}
              </li>
            ))}
          </ul>
          {result.unparsed.length > 0 && (
            <>
              <p className="form-error">
                {result.unparsed.length} {result.unparsed.length === 1 ? 'line' : 'lines'} couldn't
                be read. Fix them above, or import without them:
              </p>
              <ul className="import-list unparsed">
                {result.unparsed.map((u) => (
                  <li key={u.line}>
                    Line {u.line}: <code>{u.text}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!result || result.workouts.length === 0}
          onClick={() => result && onImport(result.workouts)}
        >
          Import {result?.workouts.length ?? 0} workouts
        </button>
      </div>
    </Sheet>
  );
}
