import erfcinv from 'compute-erfcinv';
import rayleighPdf from 'distributions-rayleigh-pdf';
import SplineInterpolator from 'spline-interpolator';

/**
 * Determine noise level by san plot metodology (https://doi.org/10.1002/mrc.4882)
 * @param {Array} data - real or magnitude spectra data.
 * @param {*} options
 */

export function getNoiseLevel(data, options = {}) {
  const {
    mask,
    cutOff,
    refine = true,
    magnitudeMode = false,
    scaleFactor = 1,
    factorStd = 5,
    fixOffset = true,
  } = options;

  let input;
  if (Array.isArray(mask) && mask.length === data.length) {
    input = data.filter((_e, i) => !mask[i]);
  } else {
    input = data.slice();
  }

  if (scaleFactor > 1) {
    for (let i = 0; i < input.length; i++) {
      input[i] *= scaleFactor;
    }
  }

  input.sort((a, b) => b - a);

  if (fixOffset && !magnitudeMode) {
    let medianIndex = Math.floor(input.length / 2);
    let median = 0.5 * (input[medianIndex] + input[medianIndex + 1]);
    for (let i = 0; i < input.length; i++) {
      input[i] -= median;
    }
  }

  let firstNegativeValueIndex = input.findIndex((e) => e < 0);
  let lastPositiveValueIndex = firstNegativeValueIndex - 1;
  for (let i = lastPositiveValueIndex; i >= 0; i--) {
    if (input[i] > 0) {
      lastPositiveValueIndex = i;
      break;
    }
  }

  let signPositive = new Float64Array(
    input.slice(0, lastPositiveValueIndex + 1),
  );
  let signNegative = new Float64Array(input.slice(firstNegativeValueIndex));

  let cutOffDist = cutOff
    ? cutOff
    : determineCutOff(signPositive, { magnitudeMode });

  let initialNoiseLevelPositive =
    signPositive[Math.round(signPositive.length * cutOffDist)];

  let skyPoint = signPositive[0];

  let initialNoiseLevelNegative;
  if (signNegative.length > 0) {
    initialNoiseLevelNegative =
      -1 * signNegative[Math.round(signNegative.length * (1 - cutOffDist))];
  } else {
    initialNoiseLevelNegative = 0;
  }

  let noiseLevelPositive = initialNoiseLevelPositive;
  let noiseLevelNegative = initialNoiseLevelNegative;
  let cloneSignPositive = signPositive.slice();
  let cloneSignNegative = signNegative.slice();

  let cutOffSignalsIndexPlus = 0;
  let cutOffSignalsIndexNeg = 2;
  if (refine) {
    let cutOffSignals = noiseLevelPositive * factorStd;
    cutOffSignalsIndexPlus = signPositive.findIndex((e) => e < cutOffSignals);

    if (cutOffSignalsIndexPlus > -1) {
      cloneSignPositive = signPositive.slice(cutOffSignalsIndexPlus);
      noiseLevelPositive =
        cloneSignPositive[Math.round(cloneSignPositive.length * cutOffDist)];
    }

    cutOffSignals = noiseLevelNegative * factorStd;
    cutOffSignalsIndexNeg = signNegative.findIndex((e) => e < cutOffSignals);
    if (cutOffSignalsIndexNeg > -1) {
      cloneSignNegative = signNegative.slice(cutOffSignalsIndexNeg);
      noiseLevelNegative =
        cloneSignPositive[
          Math.round(cloneSignNegative.length * (1 - cutOffDist))
        ];
    }
  }
  let correctionFactor = -simpleNormInv(cutOffDist / 2, { magnitudeMode });
  initialNoiseLevelPositive = initialNoiseLevelPositive / correctionFactor;
  initialNoiseLevelNegative = initialNoiseLevelNegative / correctionFactor;

  let effectiveCutOffDist, refinedCorrectionFactor;
  if (refine) {
    effectiveCutOffDist =
      (cutOffDist * cloneSignPositive.length + cutOffSignalsIndexPlus) /
      (cloneSignPositive.length + cutOffSignalsIndexPlus);
    refinedCorrectionFactor =
      -1 * simpleNormInv(effectiveCutOffDist / 2, { magnitudeMode });
    noiseLevelPositive /= refinedCorrectionFactor;

    effectiveCutOffDist =
      (cutOffDist * cloneSignNegative.length + cutOffSignalsIndexNeg) /
      (cloneSignNegative.length + cutOffSignalsIndexNeg);
    refinedCorrectionFactor =
      -1 * simpleNormInv(effectiveCutOffDist / 2, { magnitudeMode });
    if (noiseLevelNegative !== 0) {
      noiseLevelNegative /= refinedCorrectionFactor;
    }
  } else {
    noiseLevelPositive /= correctionFactor;
    noiseLevelNegative /= correctionFactor;
  }

  return {
    positive: noiseLevelPositive,
    negative: noiseLevelNegative,
    snr: skyPoint / noiseLevelPositive,
  };
}

function determineCutOff(signPositive, options = {}) {
  let {
    magnitudeMode = false,
    considerList = { from: 0.5, step: 0.1, to: 0.9 },
  } = options;
  //generate a list of values for
  let cutOff = [];
  let indexMax = signPositive.length - 1;
  for (let i = 0.01; i <= 0.99; i += 0.01) {
    let index = Math.round(indexMax * i);
    let value =
      -signPositive[index] / simpleNormInv([i / 2], { magnitudeMode });
    cutOff.push([i, value]);
  }

  let minKi = Number.MAX_SAFE_INTEGER;
  let { from, to, step } = considerList;
  let delta = step / 2;
  let whereToCutStat = 0.5;
  for (let i = from; i <= to; i += step) {
    let floor = i - delta;
    let top = i + delta;
    let elementsOfCutOff = cutOff.filter((e) => e[0] < top && e[0] > floor);
    let averageValue = elementsOfCutOff.reduce((a, b) => a + Math.abs(b[1]), 0);
    let kiSqrt = 0;
    for (let j = 0; j < elementsOfCutOff.length; j++) {
      kiSqrt += Math.pow(elementsOfCutOff[j][1] - averageValue, 2);
    }

    if (kiSqrt < minKi) {
      minKi = kiSqrt;
      whereToCutStat = i;
    }
  }

  return whereToCutStat;
}

function simpleNormInv(data, options = {}) {
  const { magnitudeMode = false } = options;

  if (!Array.isArray(data)) data = [data];

  let from = 0;
  let to = 2;
  let step = 0.01;
  let xTraining = createArray(from, to, step);

  let result = new Float64Array(data.length);
  let yTraining = new Float64Array(xTraining.length);
  if (magnitudeMode) {
    let factor = 1;
    let increment = 1e-3;
    for (let i = 0; i < yTraining.length; i++) {
      let finalInput = xTraining[i] * factor;
      let inputValues = createArray(0, finalInput, increment);
      yTraining[i] = 1 - increment * sum(rayleighPdf(inputValues));
    }
    let interp = new SplineInterpolator(xTraining, yTraining);
    for (let i = 0; i < result.length; i++) {
      let yValue = 2 * data[i];
      result[i] = -1 * interp.interpolate(yValue);
    }
  } else {
    for (let i = 0; i < result.length; i++) {
      result[i] = -1 * Math.SQRT2 * erfcinv(2 * data[i]);
    }
  }
  return result.length === 1 ? result[0] : result;
}

function sum(arr) {
  let result = 0;
  for (let i = 0; i < arr.length; i++) {
    result += arr[i];
  }
  return result;
}

function createArray(from, to, step) {
  let result = new Float32Array(Math.abs((from - to) / step + 1));
  for (let i = 0; i < result.length; i++) {
    result[i] = from + i * step;
  }
  return Array.from(result);
}
