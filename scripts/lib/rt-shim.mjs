// Plain Node (as `tsx` runs scripts) cannot see the named exports of gtfs-realtime-bindings, which the app's providers import
// by name (the bundler can). Scripts that load the providers preload this to give the package a named export.
import { register } from "node:module";

register("./rt-shim-hooks.mjs", import.meta.url);
