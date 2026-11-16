// Parser and evaluator for SPDX license expressions such as "MIT", "(MIT OR Apache-2.0)" or
// "Apache-2.0 WITH LLVM-exception". Grammar: https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/
// Operator precedence from strongest to weakest: WITH, AND, OR. Operators are case-sensitive.

/** A parsed SPDX license expression. */
export type SpdxExpression =
  | { readonly kind: "license"; readonly id: string; readonly exception: string | undefined }
  | { readonly kind: "and"; readonly left: SpdxExpression; readonly right: SpdxExpression }
  | { readonly kind: "or"; readonly left: SpdxExpression; readonly right: SpdxExpression };

type Token =
  | { readonly kind: "open" }
  | { readonly kind: "close" }
  | { readonly kind: "operator"; readonly value: "AND" | "OR" | "WITH" }
  | { readonly kind: "id"; readonly value: string };

/** Thrown when a string is not a valid SPDX license expression. */
export class SpdxSyntaxError extends Error {
  override name = "SpdxSyntaxError";
}

// License and exception identifiers: letters, digits, ".", "-", an optional trailing "+", and
// "LicenseRef-…" / "DocumentRef-…:LicenseRef-…" references.
const ID_PATTERN = /^[A-Za-z0-9.-]+(?::[A-Za-z0-9.-]+)?\+?$/;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const word of text.replaceAll("(", " ( ").replaceAll(")", " ) ").split(/\s+/)) {
    if (word === "") {
      continue;
    }
    if (word === "(") {
      tokens.push({ kind: "open" });
    } else if (word === ")") {
      tokens.push({ kind: "close" });
    } else if (word === "AND" || word === "OR" || word === "WITH") {
      tokens.push({ kind: "operator", value: word });
    } else if (ID_PATTERN.test(word)) {
      tokens.push({ kind: "id", value: word });
    } else {
      throw new SpdxSyntaxError(`invalid identifier "${word}"`);
    }
  }
  return tokens;
}

/** Parses an SPDX license expression. Throws `SpdxSyntaxError` for invalid input. */
export function parseSpdx(text: string): SpdxExpression {
  const tokens = tokenize(text);
  let position = 0;

  const peek = (): Token | undefined => tokens[position];
  const isOperator = (value: "AND" | "OR" | "WITH"): boolean => {
    const token = peek();
    return token?.kind === "operator" && token.value === value;
  };

  const parseOr = (): SpdxExpression => {
    let left = parseAnd();
    while (isOperator("OR")) {
      position += 1;
      left = { kind: "or", left, right: parseAnd() };
    }
    return left;
  };

  const parseAnd = (): SpdxExpression => {
    let left = parsePrimary();
    while (isOperator("AND")) {
      position += 1;
      left = { kind: "and", left, right: parsePrimary() };
    }
    return left;
  };

  const parsePrimary = (): SpdxExpression => {
    const token = peek();
    position += 1;
    if (token === undefined) {
      throw new SpdxSyntaxError("unexpected end of expression");
    }
    switch (token.kind) {
      case "open": {
        const inner = parseOr();
        if (peek()?.kind !== "close") {
          throw new SpdxSyntaxError('missing ")"');
        }
        position += 1;
        return inner;
      }
      case "id": {
        if (!isOperator("WITH")) {
          return { kind: "license", id: token.value, exception: undefined };
        }
        position += 1;
        const exception = peek();
        if (exception?.kind !== "id") {
          throw new SpdxSyntaxError('expected an exception identifier after "WITH"');
        }
        position += 1;
        return { kind: "license", id: token.value, exception: exception.value };
      }
      case "close":
        throw new SpdxSyntaxError('unexpected ")"');
      case "operator":
        throw new SpdxSyntaxError(`unexpected operator "${token.value}"`);
    }
  };

  const expression = parseOr();
  const rest = peek();
  if (rest !== undefined) {
    throw new SpdxSyntaxError(
      rest.kind === "close" ? 'unexpected ")"' : "expected AND or OR between licenses",
    );
  }
  return expression;
}

/**
 * The text of a single license term as it is matched against the policy: the identifier, or
 * "<id> WITH <exception>" when an exception is attached.
 */
export function licenseTerm(license: Extract<SpdxExpression, { kind: "license" }>): string {
  return license.exception === undefined ? license.id : `${license.id} WITH ${license.exception}`;
}

/** Returns whether the expression is satisfied when exactly the accepted terms may be used. */
export function isSatisfied(
  expression: SpdxExpression,
  accepts: (term: string) => boolean,
): boolean {
  switch (expression.kind) {
    case "license":
      return accepts(licenseTerm(expression));
    case "and":
      return isSatisfied(expression.left, accepts) && isSatisfied(expression.right, accepts);
    case "or":
      return isSatisfied(expression.left, accepts) || isSatisfied(expression.right, accepts);
  }
}

/** Lists every license term of the expression, in order of appearance. */
export function licenseTerms(expression: SpdxExpression): string[] {
  switch (expression.kind) {
    case "license":
      return [licenseTerm(expression)];
    case "and":
    case "or":
      return [...licenseTerms(expression.left), ...licenseTerms(expression.right)];
  }
}
