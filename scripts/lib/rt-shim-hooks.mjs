const shim = new URL("./gtfs-rt-named.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier === "gtfs-realtime-bindings" && context.parentURL !== shim) return { url: shim, shortCircuit: true };
  return next(specifier, context);
}
