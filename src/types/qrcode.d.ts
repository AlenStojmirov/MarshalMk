/**
 * The one corner of the `qrcode` package this app uses (src/lib/qr.ts).
 * Declared here because @types/qrcode could not be fetched on the shop's
 * network; widen it only as far as a new call needs.
 */
declare module 'qrcode' {
  export interface QRCodeCreateOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    version?: number;
    maskPattern?: number;
  }

  export interface BitMatrix {
    size: number;
    /** 1 for a dark module. */
    get(row: number, col: number): number;
  }

  export interface QRCodeModel {
    modules: BitMatrix;
    version: number;
    maskPattern: number;
  }

  export function create(text: string, options?: QRCodeCreateOptions): QRCodeModel;
}
