const OPERATION_SLUGS = Object.freeze({
  Engrave: "engrave",
  Score: "score",
  Cut: "cut",
});

export function groupJobOperations(operations, splitByOperation) {
  const ops = Array.isArray(operations) ? operations : [];
  if (!splitByOperation) return ops.length ? [{ operation: null, ops: [...ops] }] : [];

  const groups = [];
  const byOperation = new Map();
  for (const op of ops) {
    let group = byOperation.get(op.op);
    if (!group) {
      group = { operation: op.op, ops: [] };
      byOperation.set(op.op, group);
      groups.push(group);
    }
    group.ops.push(op);
  }
  return groups;
}

export function jobFilename(base, extension, operation, index, total) {
  if (!operation) return `${base}${extension}`;
  const slug = OPERATION_SLUGS[operation] || String(operation).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "job";
  const order = total > 1 ? `-${String(index + 1).padStart(2, "0")}` : "";
  return `${base}${order}-${slug}${extension}`;
}
