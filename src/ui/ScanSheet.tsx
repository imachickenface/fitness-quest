import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Food } from '../contract.ts';
import { getFoodByBarcode, upsertFood } from '../db/db.ts';
import { getDetector } from './barcode.ts';
import { useDb } from './dbContext.ts';
import { nowStamp } from './format.ts';
import { offClient } from './offClient.ts';
import { Sheet } from './Sheet.tsx';

export type Missing = { barcode: string; name?: string; brand?: string };

type Props = {
  onFound: (food: Food) => void;
  onMissing: (missing: Missing) => void;
  onClose: () => void;
};

type Phase =
  | { kind: 'scanning' }
  | { kind: 'looking'; barcode: string }
  | { kind: 'missing'; missing: Missing; message: string }
  | { kind: 'error'; barcode: string; message: string; retryable: boolean };

const BARCODE = /^\d{8,14}$/;

export function ScanSheet({ onFound, onMissing, onClose }: Props) {
  const db = useDb();
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  async function lookUp(barcode: string) {
    setPhase({ kind: 'looking', barcode });
    try {
      await findFood(barcode);
    } catch {
      setPhase({ kind: 'error', barcode, message: 'Something went wrong.', retryable: true });
    }
  }

  async function findFood(barcode: string) {
    const local = await getFoodByBarcode(db, barcode);
    if (local) return onFound(local);
    const r = await offClient.lookup(barcode, nowStamp());
    if (r.status === 'found') {
      await upsertFood(db, r.food);
      onFound(r.food);
    } else if (r.status === 'not_found') {
      setPhase({
        kind: 'missing',
        missing: { barcode },
        message: `Barcode ${barcode} isn't in Open Food Facts yet.`,
      });
    } else if (r.status === 'no_nutrition') {
      setPhase({
        kind: 'missing',
        missing: { barcode, name: r.name, brand: r.brand },
        message: `Found ${r.name ?? `barcode ${barcode}`}, but it has no calorie data.`,
      });
    } else {
      setPhase({ kind: 'error', barcode, message: r.message, retryable: r.retryable });
    }
  }

  const scanning = phase.kind === 'scanning';

  // Camera and detection run only while scanning; any other phase stops the camera.
  useEffect(() => {
    if (!scanning) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocamera');
        const [s, detector] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          }),
          getDetector(),
        ]);
        stream = s;
        if (stopped) return;
        const el = video.current;
        if (!el) return;
        el.srcObject = s;
        await el.play().catch(() => undefined);
        setCameraError(null);
        const tick = async () => {
          if (stopped) return;
          if (el.readyState >= 2) {
            const codes = await detector.detect(el).catch(() => []);
            const hit = codes.find((c) => BARCODE.test(c.rawValue));
            if (hit && !stopped) {
              navigator.vibrate?.(60);
              void lookUp(hit.rawValue);
              return;
            }
          }
          timer = setTimeout(() => void tick(), 200);
        };
        void tick();
      } catch (err) {
        if (!stopped) setCameraError(cameraMessage(err));
      }
    }
    void start();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // lookUp only reads the stable db handle and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    const code = typed.replace(/\s/g, '');
    if (BARCODE.test(code)) void lookUp(code);
  }

  return (
    <Sheet title="Scan a barcode" onClose={onClose}>
      {scanning && !cameraError && (
        <div className="scan-view">
          <video ref={video} muted playsInline aria-label="Camera view" />
          <span className="scan-frame" aria-hidden="true" />
        </div>
      )}
      <p className="muted" role="status">
        {phase.kind === 'scanning' &&
          (cameraError ?? 'Point the camera at the barcode and hold it steady.')}
        {phase.kind === 'looking' && `Looking up ${phase.barcode}...`}
        {(phase.kind === 'missing' || phase.kind === 'error') && phase.message}
      </p>

      {phase.kind === 'missing' && (
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onMissing(phase.missing)}
          >
            Enter label values
          </button>
          <button type="button" className="btn" onClick={() => setPhase({ kind: 'scanning' })}>
            Scan again
          </button>
        </div>
      )}
      {phase.kind === 'error' && (
        <div className="form-actions">
          {phase.retryable && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void lookUp(phase.barcode)}
            >
              Try again
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => onMissing({ barcode: phase.barcode })}
          >
            Enter label values
          </button>
        </div>
      )}

      {scanning && (
        <form className="scan-typed" onSubmit={submitTyped}>
          <label className="field">
            <span>Or type the barcode</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={16}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          <button type="submit" className="btn" disabled={!BARCODE.test(typed.replace(/\s/g, ''))}>
            Look up
          </button>
        </form>
      )}
      <p className="fine-print">Product data: Open Food Facts (ODbL).</p>
    </Sheet>
  );
}

function cameraMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError')
    return "Camera access was refused. Allow it in Chrome's site settings, or type the barcode below.";
  if (name === 'NotFoundError' || (err instanceof Error && err.message === 'nocamera'))
    return 'No camera found. Type the barcode below.';
  return 'The camera could not start. Type the barcode below.';
}
