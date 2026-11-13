// Runs an async function over a list a few items at a time (instead of all at
// once) and returns the results in the original order. Used so a Gmail import
// of 50-100 messages does not fire 50-100 simultaneous API calls and hit
// Google's per-user rate limit.
async function mapInBatches(items, batchSize, fn) {
  const results = [];
  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

module.exports = mapInBatches;
