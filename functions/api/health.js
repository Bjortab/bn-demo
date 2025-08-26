import { json } from "./_utils";

export async function onRequestGet() {
  return json(200, { ok: true, ts: Date.now(), v: "v0.6.0" });
}
