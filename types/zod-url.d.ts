// zod's type declarations name the global `URL` type (for its URL string format, which
// PenguinOps does not use). The pure packages have neither the DOM library nor Node types, so
// this file declares `URL` as a type only, with no value: code in the pure packages still
// cannot create or use URLs (ADR 0006, ADR 0068).

interface URL {
  readonly href: string;
}
