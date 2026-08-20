const QR_VERSION = 5;
const QR_SIZE = 17 + 4 * QR_VERSION;
const DATA_CODEWORDS = 108;
const EC_CODEWORDS = 26;
const MAX_DATA_BYTES = 106;
const ALIGNMENT_CENTERS = [6, 30] as const;

const gfExp = new Uint8Array(512);
const gfLog = new Uint8Array(256);
let gfValue = 1;
for (let index = 0; index < 255; index += 1) {
  gfExp[index] = gfValue;
  gfLog[gfValue] = index;
  gfValue <<= 1;
  if (gfValue & 0x100) gfValue ^= 0x11d;
}
for (let index = 255; index < gfExp.length; index += 1) {
  gfExp[index] = gfExp[index - 255];
}

function gfMultiply(left: number, right: number) {
  if (left === 0 || right === 0) return 0;
  return gfExp[gfLog[left] + gfLog[right]];
}

function multiplyPolynomials(left: number[], right: number[]) {
  const output = Array<number>(left.length + right.length - 1).fill(0);
  left.forEach((leftValue, leftIndex) => {
    right.forEach((rightValue, rightIndex) => {
      output[leftIndex + rightIndex] ^= gfMultiply(leftValue, rightValue);
    });
  });
  return output;
}

function reedSolomonGenerator(degree: number) {
  let polynomial = [1];
  for (let index = 0; index < degree; index += 1) {
    polynomial = multiplyPolynomials(polynomial, [1, gfExp[index]]);
  }
  return polynomial;
}

const errorCorrectionGenerator = reedSolomonGenerator(EC_CODEWORDS);

function errorCorrectionCodewords(data: number[]) {
  const remainder = Array<number>(EC_CODEWORDS).fill(0);
  data.forEach((dataByte) => {
    const factor = dataByte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor === 0) return;
    for (let index = 0; index < remainder.length; index += 1) {
      remainder[index] ^=
        gfMultiply(errorCorrectionGenerator[index + 1], factor) ?? 0;
    }
  });
  return remainder;
}

function appendBits(target: number[], value: number, width: number) {
  for (let bit = width - 1; bit >= 0; bit -= 1) {
    target.push((value >>> bit) & 1);
  }
}

function encodeCodewords(value: string) {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > MAX_DATA_BYTES) {
    throw new Error(`QR value exceeds ${MAX_DATA_BYTES} UTF-8 bytes.`);
  }

  const capacity = DATA_CODEWORDS * 8;
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));

  const terminatorLength = Math.min(4, capacity - bits.length);
  for (let index = 0; index < terminatorLength; index += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (bits.length < capacity) {
    appendBits(bits, pads[padIndex % pads.length], 8);
    padIndex += 1;
  }

  const data: number[] = [];
  for (let offset = 0; offset < capacity; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      byte = (byte << 1) | bits[offset + bit];
    }
    data.push(byte);
  }

  return [...data, ...errorCorrectionCodewords(data)];
}

type MutableQrMatrix = Array<Array<boolean | null>>;

function makeBaseMatrix() {
  const matrix: MutableQrMatrix = Array.from({ length: QR_SIZE }, () =>
    Array<boolean | null>(QR_SIZE).fill(null),
  );
  const reserved = Array.from({ length: QR_SIZE }, () =>
    Array<boolean>(QR_SIZE).fill(false),
  );

  function setReserved(row: number, column: number, value: boolean) {
    if (row < 0 || row >= QR_SIZE || column < 0 || column >= QR_SIZE) return;
    matrix[row][column] = value;
    reserved[row][column] = true;
  }

  function placeFinder(top: number, left: number) {
    for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 7; columnOffset += 1) {
        const row = top + rowOffset;
        const column = left + columnOffset;
        if (row < 0 || row >= QR_SIZE || column < 0 || column >= QR_SIZE)
          continue;
        const inside =
          rowOffset >= 0 &&
          rowOffset <= 6 &&
          columnOffset >= 0 &&
          columnOffset <= 6;
        const value = inside
          ? rowOffset === 0 ||
            rowOffset === 6 ||
            columnOffset === 0 ||
            columnOffset === 6 ||
            (rowOffset >= 2 &&
              rowOffset <= 4 &&
              columnOffset >= 2 &&
              columnOffset <= 4)
          : false;
        setReserved(row, column, value);
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, QR_SIZE - 7);
  placeFinder(QR_SIZE - 7, 0);

  for (let index = 8; index < QR_SIZE - 8; index += 1) {
    const dark = index % 2 === 0;
    setReserved(6, index, dark);
    setReserved(index, 6, dark);
  }

  ALIGNMENT_CENTERS.forEach((rowCenter) => {
    ALIGNMENT_CENTERS.forEach((columnCenter) => {
      const overlapsFinder =
        (rowCenter < 9 && columnCenter < 9) ||
        (rowCenter < 9 && columnCenter > QR_SIZE - 9) ||
        (rowCenter > QR_SIZE - 9 && columnCenter < 9);
      if (overlapsFinder) return;
      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
          setReserved(
            rowCenter + rowOffset,
            columnCenter + columnOffset,
            Math.max(Math.abs(rowOffset), Math.abs(columnOffset)) !== 1,
          );
        }
      }
    });
  });

  for (let index = 0; index < 9; index += 1) {
    if (index === 6) continue;
    reserved[8][index] = true;
    reserved[index][8] = true;
  }
  for (let index = 0; index < 8; index += 1) {
    reserved[8][QR_SIZE - 1 - index] = true;
    reserved[QR_SIZE - 1 - index][8] = true;
  }

  setReserved(4 * QR_VERSION + 9, 8, true);
  return { matrix, reserved };
}

function formatBits(mask: number) {
  const formatData = (0b01 << 3) | mask;
  let remainder = formatData << 10;
  const generator = 0x537;
  const bitLength = (value: number) => 32 - Math.clz32(value);
  while (bitLength(remainder) >= bitLength(generator)) {
    remainder ^= generator << (bitLength(remainder) - bitLength(generator));
  }
  return (((formatData << 10) | remainder) ^ 0x5412) & 0x7fff;
}

function maskApplies(mask: number, row: number, column: number) {
  const product = row * column;
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return column % 3 === 0;
    case 3:
      return (row + column) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    case 5:
      return (product % 2) + (product % 3) === 0;
    case 6:
      return ((product % 2) + (product % 3)) % 2 === 0;
    default:
      return ((row + column) % 2 + (product % 3)) % 2 === 0;
  }
}

function writeFormatBits(matrix: MutableQrMatrix, mask: number) {
  const bits = formatBits(mask);
  const valueAt = (bit: number) => ((bits >>> bit) & 1) === 1;

  for (let index = 0; index < 6; index += 1) matrix[index][8] = valueAt(index);
  matrix[7][8] = valueAt(6);
  matrix[8][8] = valueAt(7);
  matrix[8][7] = valueAt(8);
  for (let index = 9; index < 15; index += 1) {
    matrix[8][14 - index] = valueAt(index);
  }

  for (let index = 0; index < 8; index += 1) {
    matrix[8][QR_SIZE - 1 - index] = valueAt(index);
  }
  for (let index = 8; index < 15; index += 1) {
    matrix[QR_SIZE - 15 + index][8] = valueAt(index);
  }
  matrix[QR_SIZE - 8][8] = true;
}

function buildMatrixForMask(codewords: number[], mask: number) {
  const { matrix, reserved } = makeBaseMatrix();
  const dataBits: number[] = [];
  codewords.forEach((codeword) => appendBits(dataBits, codeword, 8));

  let bitIndex = 0;
  let right = QR_SIZE - 1;
  let upwards = true;
  while (right >= 1) {
    if (right === 6) right -= 1;
    for (let step = 0; step < QR_SIZE; step += 1) {
      const row = upwards ? QR_SIZE - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (reserved[row][column]) continue;
        const bit = bitIndex < dataBits.length ? dataBits[bitIndex] : 0;
        bitIndex += 1;
        matrix[row][column] = Boolean(
          bit ^ Number(maskApplies(mask, row, column)),
        );
      }
    }
    upwards = !upwards;
    right -= 2;
  }

  writeFormatBits(matrix, mask);
  return matrix.map((row) => row.map(Boolean));
}

function penaltyScore(matrix: boolean[][]) {
  let score = 0;

  function scoreRuns(values: boolean[]) {
    let localScore = 0;
    let runColour = values[0];
    let runLength = 1;
    for (let index = 1; index <= values.length; index += 1) {
      const value = values[index];
      if (index < values.length && value === runColour) {
        runLength += 1;
        continue;
      }
      if (runLength >= 5) localScore += 3 + (runLength - 5);
      runColour = value;
      runLength = 1;
    }
    return localScore;
  }

  for (let row = 0; row < QR_SIZE; row += 1) {
    score += scoreRuns(matrix[row]);
    score += scoreRuns(matrix.map((line) => line[row]));
  }

  for (let row = 0; row < QR_SIZE - 1; row += 1) {
    for (let column = 0; column < QR_SIZE - 1; column += 1) {
      const colour = matrix[row][column];
      if (
        matrix[row][column + 1] === colour &&
        matrix[row + 1][column] === colour &&
        matrix[row + 1][column + 1] === colour
      ) {
        score += 3;
      }
    }
  }

  const finderLikeA = "00001011101";
  const finderLikeB = "10111010000";
  const scoreFinderLike = (values: boolean[]) => {
    const row = values.map((value) => (value ? "1" : "0")).join("");
    let matches = 0;
    for (let index = 0; index <= row.length - 11; index += 1) {
      const pattern = row.slice(index, index + 11);
      if (pattern === finderLikeA || pattern === finderLikeB) matches += 1;
    }
    return matches * 40;
  };
  for (let row = 0; row < QR_SIZE; row += 1) {
    score += scoreFinderLike(matrix[row]);
    score += scoreFinderLike(matrix.map((line) => line[row]));
  }

  const darkModules = matrix.reduce(
    (total, row) => total + row.filter(Boolean).length,
    0,
  );
  const totalModules = QR_SIZE * QR_SIZE;
  score +=
    Math.floor(Math.abs(darkModules * 20 - totalModules * 10) / totalModules) *
    10;

  return score;
}

export function buildProfileQrMatrix(value: string) {
  const codewords = encodeCodewords(value);
  let bestMatrix = buildMatrixForMask(codewords, 0);
  let bestScore = penaltyScore(bestMatrix);
  for (let mask = 1; mask < 8; mask += 1) {
    const candidate = buildMatrixForMask(codewords, mask);
    const candidateScore = penaltyScore(candidate);
    if (candidateScore < bestScore) {
      bestMatrix = candidate;
      bestScore = candidateScore;
    }
  }
  return bestMatrix;
}

export function profileQrPath(matrix: boolean[][], quietZone = 4) {
  const segments: string[] = [];
  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      if (!dark) return;
      segments.push(
        `M${columnIndex + quietZone} ${rowIndex + quietZone}h1v1h-1z`,
      );
    });
  });
  return segments.join("");
}

export const PROFILE_QR_MODULES = QR_SIZE;
export const PROFILE_QR_QUIET_ZONE = 4;
export const PROFILE_QR_MAX_BYTES = MAX_DATA_BYTES;
