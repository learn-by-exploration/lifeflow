// ─── LifeFlow State Store ───
// Lightweight reactive store with settings cache, custom events, and offline mutation queue
'use strict';

const Store=(()=>{
  const _state={};
  const _listeners={};
  const _mutationQueue=[];

  function get(key){return _state[key]}
  function set(key,value){
    const old=_state[key];
    _state[key]=value;
    if(old!==value)emit('change:'+key,{key,value,old});
  }
  function getAll(){
    try{return JSON.parse(JSON.stringify(_state))}catch(e){return{..._state}}
  }

  // Event system
  function on(event,fn){
    if(!_listeners[event])_listeners[event]=[];
    _listeners[event].push(fn);
    return ()=>off(event,fn);
  }
  function off(event,fn){
    if(!_listeners[event])return;
    _listeners[event]=_listeners[event].filter(f=>f!==fn);
    if(_listeners[event].length===0)delete _listeners[event];
  }
  function emit(event,data){
    if(_listeners[event])_listeners[event].forEach(fn=>fn(data));
    if(_listeners['*'])_listeners['*'].forEach(fn=>fn({event,...data}));
  }

  // Settings helpers
  function getSettings(){return get('settings')||{}}
  function getSetting(key){return(get('settings')||{})[key]}
  function setSettings(s){set('settings',s);emit('settings:changed',s)}

  // View state
  function getView(){return get('currentView')||'myday'}
  function setView(v){set('currentView',v);emit('view:changed',v)}

  // ─── Offline Mutation Queue ───
  function queueMutation(method,url,body){
    _mutationQueue.push({method,url,body,timestamp:Date.now()});
    emit('queue:changed',{size:_mutationQueue.length});
  }
  function getQueueSize(){return _mutationQueue.length}
  function getQueue(){return[..._mutationQueue]}
  async function syncQueue(){
    if(_mutationQueue.length===0)return{synced:0,failed:0};
    let synced=0,failed=0;
    while(_mutationQueue.length>0){
      const m=_mutationQueue[0];
      try{
        const opts={method:m.method,headers:{'Content-Type':'application/json'}};
        if(m.body&&m.method!=='GET')opts.body=JSON.stringify(m.body);
        const r=await fetch(m.url,opts);
        if(r.ok||r.status<500){_mutationQueue.shift();synced++}
        else{failed++;break}
      }catch(e){failed++;break}
    }
    emit('queue:changed',{size:_mutationQueue.length});
    return{synced,failed};
  }
  function clearQueue(){_mutationQueue.length=0;emit('queue:changed',{size:0})}

  return{get,set,getAll,on,off,emit,getSettings,getSetting,setSettings,getView,setView,queueMutation,getQueueSize,getQueue,syncQueue,clearQueue};
})();

if(typeof window!=='undefined')window.Store=Store;
