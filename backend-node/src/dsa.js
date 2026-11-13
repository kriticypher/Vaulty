// dsa.js - DSA / ADA algorithms for Vaultly (ported from Member 1's products.py).
// Merge Sort for ordering and Linear Search for substring matching.
// These are hand-written (not library calls) so they can be demonstrated in the viva.

// ── DSA: MERGE SORT ──────────────────────────────────────────────────────────
// Time Complexity:  O(n log n) best/average/worst.
// Space Complexity: O(n) auxiliary memory for merged subarrays.
// Divide and Conquer: split into halves until length <= 1, sort each half,
// then merge the sorted halves in linear time.
export function mergeSort(arr, keyFn, reverse = false) {
  if (arr.length <= 1) {
    return arr;
  }

  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid), keyFn, reverse);
  const right = mergeSort(arr.slice(mid), keyFn, reverse);

  return merge(left, right, keyFn, reverse);
}

function merge(left, right, keyFn, reverse) {
  const result = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    let valLeft = keyFn(left[i]);
    let valRight = keyFn(right[j]);

    // Normalize null/undefined values to avoid comparison errors
    if (valLeft === null || valLeft === undefined) {
      valLeft = typeof valRight === 'string' ? '' : 0;
    }
    if (valRight === null || valRight === undefined) {
      valRight = typeof valLeft === 'string' ? '' : 0;
    }

    const condition = reverse ? valLeft >= valRight : valLeft <= valRight;

    if (condition) {
      result.push(left[i]);
      i += 1;
    } else {
      result.push(right[j]);
      j += 1;
    }
  }

  return result.concat(left.slice(i), right.slice(j));
}

// ── DSA: LINEAR SEARCH ───────────────────────────────────────────────────────
// Time Complexity:  O(n) — sequentially inspects each record, matching the
// query (case-insensitive) inside name or brand.
export function linearSearch(products, query) {
  if (!query) {
    return products;
  }

  const normalized = query.trim().toLowerCase();
  return products.filter((product) => {
    const name = (product.name || '').toLowerCase();
    const brand = (product.brand || '').toLowerCase();
    return name.includes(normalized) || brand.includes(normalized);
  });
}
