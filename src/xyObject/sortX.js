/**
 * Sorts an array of points
 * @param {ArrayPoints} [data] array of points {x,y}
 */

export function sortX(data) {
  return data.sort((a, b) => a.x - b.x);
}
