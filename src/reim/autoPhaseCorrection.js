import { phaseCorrection } from './phaseCorrection';
import { absolute } from './absolute';
/**
 * Implementation of the algorithm for automatic phase correction: A robust, general automatic phase
 * correction algorithm for high-resolution NMR data. 10.1002/mrc.4586
 * @param {object} spectraData
 */
export function autoPhaseCorrection(data, options = {}) {
  const { minRegSize } = options;
  const { re, im } = data;
  const length = re.length;

  let magnitudeData = absolute(data);

  // TODO: It could be better to use the magnitud spectrum instead of the real data
  // for determining the peak regions
  //let magData = reData;//getMagnitudSpectrum(reData, imData);

  let ds = holoborodko(magnitudeData);
  let peaksDs = robustBaseLineRegionsDetection(ds, minRegSize);
  let peaksSp = robustBaseLineRegionsDetection(magnitudeData, minRegSize);
  let finalPeaks = new Array(length);
  for (let i = 0; i < length; i++) {
    finalPeaks[i] = peaksSp[i] & peaksDs[i];
  }
  // API.createData('mask', xy);

  // Once the regions are detected, we auto phase each of them separately.
  // TODO: This part can be put inside a function
  let i = -1;console.log
  let x0 = 0;
  let res = [];
  while (i < length) {
    //phase first region
    let reTmp = [];
    let imTmp = [];

    //Look for the first 1 in the array
    while (!finalPeaks[++i] && i < length) {
      x0 = i;
    }

    //TODO: Add some extra points(0.1 ppm) at rigth and left sides of the region.
    while (finalPeaks[i] && i < length) {
      reTmp.push(re[i]);
      imTmp.push(im[i]);
      i++
    } 
    // for (; finalPeaks[i] && i < length; i++) {
      
    // }
    if (reTmp.length > minRegSize) {
      res.push(autoPhaseRegion(reTmp, imTmp, x0));
    }
  }

  // TODO: Still some corrections needed. In the paper they remove the outlayers interatively
  // until they can perform a regression witout bad points. Can someone help here?
  let [ph1, ph0] = weightedLinearRegression(
    res.map((r) => r.x0 / length),
    res.map((r) => r.ph0),
    res.map((r) => r.area / 1e11),
  );

  let phased = phaseCorrection(
    { re, im },
    (ph0 * Math.PI) / 180,
    (ph1 * Math.PI) / 180,
  );

  return { data: phased, ph0, ph1 };
}

function autoPhaseRegion(re, im, x0) {
  let start = -180;
  let stop = 180;
  let nSteps = 20;
  let maxSteps = 3;
  let bestAng = 0;
  while (maxSteps > 0) {
    let dAng = (stop - start) / (nSteps + 1);
    let minArea = Number.MAX_SAFE_INTEGER;
    bestAng = start;
    for (let i = start; i <= stop; i += dAng) {
      let phased = phaseCorrection({re, im}, (Math.PI * i) / 180, 0);
      let negArea = 0;
      for (let j = 0; j < re.length; j++) {
        if (phased.re[j] < 0) {
          negArea += -phased.re[j];
        }
      }
      if (negArea < minArea) {
        minArea = negArea;
        bestAng = i;
      }
    }
    start = bestAng - dAng;
    stop = bestAng + dAng;
    maxSteps--;
  }

  // Calculate the area for the best angle
  let phased = phaseCorrection({re, im}, (Math.PI * bestAng) / 180, 0);
  let area = 0;
  let sumX = 0;
  for (let j = 0; j < re.length; j++) {
    area += phased.re[j];
    sumX += phased.re[j] * (j + x0);
  }

  return { ph0: bestAng, area, x0: sumX / area };
}

function holoborodko(s) {
  let dk = new Array(s.length);
  for (let i = 5; i < s.length - 5; i++) {
    dk[i] =
      (42 * (s[i + 1] - s[i - 1]) +
        48 * (s[i + 2] - s[i - 2]) +
        27 * (s[i + 3] + s[i - 3]) +
        8 * (s[i + 4] - s[i - 4]) +
        s[i + 5] -
        s[i - 5]) /
      512;
  }
  //Fill the borders
  for (let i = 0; i < 5; i++) {
    dk[i] = dk[5];
    dk[s.length - i - 1] = dk[s.length - 6];
  }

  return dk;
}

function robustBaseLineRegionsDetection(s, minRegSize) {
  let mask = new Array(s.length);
  for (let i = 0; i < s.length; i++) {
    mask[i] = false;
  }

  //Recursivelly check for points greater than 3 times the sdt
  let change = true;
  while (change) {
    let res = stats(s, mask);
    let noiseLevel = 3 * res.std;
    let mean = res.mean;
    change = false;
    for (let i = 0; i < s.length; i++) {
      if (Math.abs(s[i] - mean) > noiseLevel && !mask[i]) {
        change = true;
        mask[i] = true;
      }
    }
  }

  // Clean up mask by merging peaks blocks, separated by just a few points(4??).
  let count = 0;
  let prev = 0;
  const SMALL = minRegSize;
  for (let i = 0; i < s.length; i++) {
    if (!mask[i]) {
      count++;
    } else {
      if (count < SMALL) {
        for (let j = 0; j <= count; j++) {
          mask[prev + j] = true;
        }
      }
      while (mask[++i] && i < s.length);
      prev = i;
      count = 0;
    }
  }

  return mask;
}

function weightedLinearRegression(x, y, w) {
  let sxtw = 0;
  let swx = 0;
  let sw = 0;
  let sxtwy = 0;
  let swy = 0;
  for (let i = 0; i < x.length; i++) {
    sxtw += x[i] * x[i] * w[i];
    swx += x[i] * w[i];
    sw += w[i];
    sxtwy += x[i] * w[i] * y[i];
    swy += w[i] * y[i];
  }

  /* Just to know what is the matrix system that we solve
   let Mx = [[sxtw, swx], [swx, sw]];
   let My = [[sxtwy], [swy]];
  */

  //Mx inverse
  let detMx = sxtw * sw - swx * swx;
  let inMx = [
    [sw / detMx, -swx / detMx],
    [-swx / detMx, sxtw / detMx],
  ];

  return [
    inMx[0][0] * sxtwy + inMx[0][1] * swy,
    inMx[1][0] * sxtwy + inMx[1][1] * swy,
  ];
}

function stats(s, mask) {
  let m = 0;
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (!mask[i]) {
      m += s[i];
      count++;
    }
  }

  m /= count;
  let sum = 0;

  for (let i = 0; i < s.length; i++) {
    if (!mask[i]) {
      sum += Math.pow(s[i] - m, 2);
      count++;
    }
  }
  return { mean: m, std: Math.sqrt(sum / count) };
}
