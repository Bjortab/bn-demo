import { json, options, notAllowed } from './_utils';

export async function onRequest(context){
  const { request } = context;
  if(request.method === 'OPTIONS') return options();
  if(request.method !== 'GET') return notAllowed(['GET','OPTIONS']);

  return json({ ok:true, ts: Date.now() });
}
