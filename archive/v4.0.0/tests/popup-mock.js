// Only served into the localhost visual preview. Never packaged in the extension.
window.chrome = {
  storage: {
    local: { get: async()=>({}), set:async()=>{} },
    onChanged: { addListener(){} }
  },
  tabs: { query: async()=>[{ id:1 }] },
  runtime: {
    getManifest:()=>({version:'4.0.0'}),
    sendMessage:async()=>({ ok:true,enabled:true,override:null,frame:{ok:true,acknowledged:true,status:{state:'typing',ready:true,stats:{presses:128,kpm:286,correctionRate:82}}} })
  }
};
