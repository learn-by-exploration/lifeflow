// ─── LifeFlow State Store ───
// Lightweight reactive store with settings cache and custom events
'use strict';

const Store=(()=>{
  const _state={};
  const _listeners={};

  function get(key){return _state[key]}
  function set(key,value){
    const old=_state[key];
    _state[key]=value;
    if(old!==value)emit('change:'+key,{key,value,old});
  }
  function getAll(){return{..._state}}

  // Event system
  function on(event,fn){
    if(!_listeners[event])_listeners[event]=[];
    _listeners[event].push(fn);
    return ()=>off(event,fn);
  }
  function off(event,fn){
    if(!_listeners[event])return;
    _listeners[event]=_listeners[event].filter(f=>f!==fn);
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

  return{get,set,getAll,on,off,emit,getSettings,getSetting,setSettings,getView,setView};
})();

if(typeof window!=='undefined')window.Store=Store;
