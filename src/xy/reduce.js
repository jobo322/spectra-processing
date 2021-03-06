import { findClosestIndex } from '../x/findClosestIndex';

/**
 * Reduce the number of points while keeping the same noise. Practical to
 * display many spectra as SVG
 * @param {array} x
 * @param {array} y
 * @param {object} [options={}]
 * @param {number} [from=x[0]]
 * @param {number} [to=x[x.length-1]]
 * @param {number} [nbPoints=4001] Number of points
 */

export function reduce(x, y, options = {}) {
  let { from = x[0], to = x[x.length - 1], nbPoints = 4000 } = options;

  let fromIndex = findClosestIndex(x, from);
  let toIndex = findClosestIndex(x, to);

  if (fromIndex > 0 && x[fromIndex] > from) fromIndex--;
  if (toIndex < x.length - 1 && x[toIndex] < to) toIndex++;

  if (toIndex - fromIndex < nbPoints) {
    return {
      x: x.slice(fromIndex, toIndex + 1),
      y: y.slice(fromIndex, toIndex + 1),
    };
  }

  let newX = [x[fromIndex]];
  let newY = [y[fromIndex]];
  let minY = Number.MAX_VALUE;
  let maxY = Number.MIN_VALUE;
  if (nbPoints % 2 === 0) {
    nbPoints = nbPoints / 2 + 1;
  } else {
    nbPoints = (nbPoints - 1) / 2 + 1;
  }

  let slot = (x[toIndex] - x[fromIndex]) / (nbPoints - 1);
  let currentX = x[fromIndex] + slot;
  let first = true;
  for (let i = fromIndex + 1; i <= toIndex; i++) {
    if (first) {
      minY = y[i];
      maxY = y[i];
      first = false;
    } else {
      if (y[i] < minY) minY = y[i];
      if (y[i] > maxY) maxY = y[i];
    }

    if (x[i] >= currentX || i === toIndex) {
      newX.push(currentX - slot / 2);
      newY.push(minY);
      newX.push(currentX);
      newY.push(maxY);
      currentX += slot;
      first = true;
    }
  }

  // we will need to make some kind of min / max because there are too many points
  // we will always keep the first point and the last point

  return { x: newX, y: newY };
}
