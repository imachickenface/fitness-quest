/** Food barcodes: EAN-13, EAN-8, UPC-A, UPC-E. */
export const FOOD_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export type Detector = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
};

type DetectorCtor = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

let pending: Promise<Detector> | undefined;

/**
 * Chrome on Android has a native BarcodeDetector. Elsewhere load the zxing-wasm polyfill on demand,
 * with its .wasm served from this app (the library's default fetches it from a CDN).
 */
export function getDetector(): Promise<Detector> {
  pending ??= load().catch((err: unknown) => {
    pending = undefined;
    throw err;
  });
  return pending;
}

async function load(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (native) {
    const supported = await native.getSupportedFormats();
    const formats = FOOD_FORMATS.filter((f) => supported.includes(f));
    if (formats.length > 0) return new native({ formats });
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasmUrl : prefix + path,
    },
  });
  return new BarcodeDetector({ formats: [...FOOD_FORMATS] });
}
