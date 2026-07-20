(() => {
  "use strict";
  const K="baekji_city_mvp_state_v3", U="baekji_city_mvp_current_user_v034", TTL=600000;
  const USERS={test_a:{name:"테스트 캐릭터 A",aliases:["캐릭터A","테스트 캐릭터 A","A"]},test_b:{name:"테스트 캐릭터 B",aliases:["캐릭터B","테스트 캐릭터 B","B"]},test_c:{name:"테스트 캐릭터 C",aliases:["캐릭터C","테스트 캐릭터 C","C"]}};
  const PREFIX={CONTAMINATED:"오염된",DISCHARGED:"방전된",EMPTY:"빈",USED:"사용한",DAMAGED:"파손된",BROKEN:"고장 난",WET:"젖은",CLEAN:""};
  const LABEL={CONTAMINATED:"오염됨",DISCHARGED:"방전됨",EMPTY:"비어 있음",USED:"사용됨",DAMAGED:"파손됨",BROKEN:"고장",WET:"젖음",CLEAN:"정상"};
  const parse=v=>{try{const x=typeof v==="string"?JSON.parse(v):v;return x?.version===3?x:null}catch{return null}};
  const clean=v=>String(v||"").normalize("NFKC").trim().replace(/^\/+\s*/,"").replace(/\s+/g," ");
  const norm=v=>clean(v).toLowerCase().replace(/[^0-9a-z가-힣]+/g,"");
  const uniq=a=>[...new Set((a||[]).filter(Boolean))];
  const uid=()=>{try{return sessionStorage.getItem(U)||""}catch{return""}};
  const uname=id=>USERS[id]?.name||id||"다른 조사자";
  const base=(key,item={})=>String(item.catalogItemId||item.baseItemId||item.originalItemId||item.itemId||key||"").split("::")[0];
  const fields=item=>({name:String(item?.name||""),state:String(item?.state||"CLEAN"),condition:String(item?.condition||""),charge:item?.charge??null,remaining:item?.remaining??item?.remainingUses??null,content:item?.content??item?.contents??null,empty:!!item?.empty,consumed:!!item?.consumed,durability:item?.durability??null,customState:String(item?.customState||item?.statusText||"")});
  const sig=item=>JSON.stringify(fields(item));
  const label=item=>LABEL[String(item?.state||"CLEAN")]||item?.customState||item?.statusText||String(item?.state||"정상");
  const display=item=>{const n=String(item?.name||"알 수 없는 물품"),p=PREFIX[String(item?.state||"CLEAN")]||"";return !p||norm(n).includes(norm(p))?n:`${p} ${n}`};
  const scope=s=>!s?"":s.movement?`route:${s.movement.fromNode}:${s.movement.targetNode}`:s.activeEncounter?`route:${s.activeEncounter.fromNode}:${s.activeEncounter.targetNode}`:s.currentDetailId?`detail:${s.currentNode}:${s.currentDetailId}`:`node:${s.currentNode}`;
  const sessionOf=(state,id)=>{const sid=state?.characters?.[id]?.currentSessionId;return sid?state.sessions?.[sid]||null:null};
  const fieldSessions=(state,source)=>Object.values(state?.sessions||{}).filter(s=>s?.status==="ACTIVE"&&s.variant===source?.variant&&scope(s)===scope(source));
  const visible=(state,source,actor)=>uniq(fieldSessions(state,source).flatMap(s=>s.memberIds||[])).filter(id=>id!==actor);
  const entries=char=>Object.entries(char?.inventory||{}).filter(([,i])=>Number(i?.quantity)>0).map(([inventoryKey,i])=>({inventoryKey,...i,baseItemId:base(inventoryKey,i)}));
  const resolution=(state,id)=>(state?.itemTransferResolutions||[]).find(r=>r?.transferId===id)||null;
  const pending=(state,receiver)=>(state?.itemTransferOffers||[]).filter(o=>o?.receiverId===receiver&&!resolution(state,o.id)&&Date.now()<=Number(o.expiresAt||0)).sort((a,b)=>Number(a.createdAt)-Number(b.createdAt));
  const available=(state,giver,key)=>{const item=state?.characters?.[giver]?.inventory?.[key];if(!item)return 0;const reserved=(state.itemTransferOffers||[]).reduce((n,o)=>o?.giverId===giver&&o?.sourceInventoryKey===key&&!resolution(state,o.id)&&Date.now()<=Number(o.expiresAt||0)?n+Number(o.quantity||0):n,0);return Math.max(0,Number(item.quantity||0)-reserved)};
  const id=p=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const addLog=(s,type,text,actorId=null,extra={})=>{if(!s)return;if(!Array.isArray(s.logs))s.logs=[];s.logs.push({id:id(type),type,text,actorId,at:Date.now(),...extra})};
  const broadcast=(state,source,type,text,extra={})=>fieldSessions(state,source).forEach(s=>addLog(s,type,text,null,{scopeKey:scope(source),...extra}));
  const aliasCatalog=(key,item)=>{const d=globalThis.DAY1_DATA||globalThis.window?.DAY1_DATA,b=base(key,item);if(d?.itemCatalog&&key&&!d.itemCatalog[key]&&d.itemCatalog[b])d.itemCatalog[key]={...d.itemCatalog[b],id:key,baseItemId:b}};
  const aliasAll=state=>Object.values(state?.characters||{}).forEach(c=>Object.entries(c.inventory||{}).forEach(([k,i])=>aliasCatalog(k,i)));
  const hash=v=>{let h=2166136261;for(const c of String(v)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  function createOffer(state,{giverId,receiverId,inventoryKey,quantity=1,actionText="",source="free-action"}){
    const giver=state?.characters?.[giverId],ss=sessionOf(state,giverId),rs=sessionOf(state,receiverId);
    if(!giver||!ss||!rs||ss.status!=="ACTIVE"||rs.status!=="ACTIVE")return{ok:false,error:"ACTIVE_SESSION_REQUIRED"};
    if(ss.variant!==rs.variant||scope(ss)!==scope(rs))return{ok:false,error:"NOT_COLOCATED"};
    const item=giver.inventory?.[inventoryKey],qty=Math.max(1,Number(quantity||1));
    if(!item||available(state,giverId,inventoryKey)<qty)return{ok:false,error:"ITEM_NOT_AVAILABLE"};
    const now=Date.now(),transferId=id("item_transfer"),snapshot={...item,quantity:qty,inventoryKey,baseItemId:base(inventoryKey,item),catalogItemId:base(inventoryKey,item),stateLabel:label(item),displayName:display(item)};
    const offer={id:transferId,giverId,receiverId,sourceSessionId:ss.id,receiverSessionId:rs.id,sourceScopeKey:scope(ss),sourceInventoryKey:inventoryKey,baseItemId:snapshot.baseItemId,itemSnapshot:snapshot,itemVariantSignature:sig(item),quantity:qty,actionText:clean(actionText),source,createdAt:now,expiresAt:now+TTL,version:1};
    (state.itemTransferOffers||(state.itemTransferOffers=[])).push(offer);
    if(actionText)addLog(ss,"action-input",actionText,giverId,{itemTransferOfferId:transferId});
    broadcast(state,ss,"item-transfer-offer",`${uname(giverId)}가 ${uname(receiverId)}에게 ${snapshot.displayName} ×${qty}을 내밀었다. 상대의 응답을 기다리고 있다.`,{itemTransferOfferId:transferId,giverId,receiverId});
    return{ok:true,offer};
  }
  const destinationKey=(inv,offer)=>{const found=Object.entries(inv).find(([,i])=>base("",i)===offer.baseItemId&&sig(i)===offer.itemVariantSignature);if(found)return found[0];if(!inv[offer.baseItemId])return offer.baseItemId;let k=`${offer.baseItemId}::variant_${hash(offer.itemVariantSignature)}`,n=2;while(inv[k]){if(sig(inv[k])===offer.itemVariantSignature)return k;k=`${offer.baseItemId}::variant_${hash(offer.itemVariantSignature)}_${n++}`}return k};
  function resolveOffer(state,transferId,receiverId,decision){
    const offer=(state?.itemTransferOffers||[]).find(o=>o?.id===transferId);if(!offer||offer.receiverId!==receiverId)return{ok:false,error:"OFFER_NOT_FOUND"};
    if(resolution(state,transferId))return{ok:false,error:"ALREADY_RESOLVED"};
    const gs=sessionOf(state,offer.giverId)||state.sessions?.[offer.sourceSessionId],rs=sessionOf(state,receiverId)||state.sessions?.[offer.receiverSessionId];
    let final=decision==="ACCEPT"?"ACCEPT":"REJECT",reason="";const now=Date.now(),giverInv=state.characters?.[offer.giverId]?.inventory||{},item=giverInv[offer.sourceInventoryKey];
    if(now>Number(offer.expiresAt)){final="EXPIRED";reason="응답 시간이 지나 제안이 만료됐다."}
    if(final==="ACCEPT"&&(!gs||!rs||gs.variant!==rs.variant||scope(gs)!==scope(rs))){final="EXPIRED";reason="두 캐릭터가 더 이상 같은 현장에 있지 않다."}
    if(final==="ACCEPT"&&(!item||Number(item.quantity)<offer.quantity||sig(item)!==offer.itemVariantSignature)){final="EXPIRED";reason="건네려던 물품의 수량이나 상태가 달라졌다."}
    if(final==="ACCEPT"){
      const inv=state.characters[receiverId].inventory||(state.characters[receiverId].inventory={}),key=destinationKey(inv,offer);
      if(inv[key])inv[key].quantity=Number(inv[key].quantity||0)+offer.quantity;else{const x={...offer.itemSnapshot};delete x.inventoryKey;delete x.displayName;delete x.stateLabel;x.quantity=offer.quantity;x.itemId=key;x.catalogItemId=offer.baseItemId;x.baseItemId=offer.baseItemId;inv[key]=x;aliasCatalog(key,x)}
      item.quantity=Number(item.quantity)-offer.quantity;if(item.quantity<=0)delete giverInv[offer.sourceInventoryKey];
    }
    const r={id:`item_transfer_resolution_${transferId}`,transferId,decision:final,receiverId,resolvedAt:now,reason,version:1};(state.itemTransferResolutions||(state.itemTransferResolutions=[])).push(r);
    const s=gs||rs,name=offer.itemSnapshot?.displayName||display(offer.itemSnapshot),text=final==="ACCEPT"?`${uname(receiverId)}가 ${uname(offer.giverId)}에게서 ${name} ×${offer.quantity}을 받아 소지품에 넣었다.`:final==="REJECT"?`${uname(receiverId)}는 ${uname(offer.giverId)}가 내민 ${name}을 받지 않았다. 물품은 원래 소유자에게 그대로 남았다.`:`${uname(offer.giverId)}가 내민 ${name}의 전달은 이루어지지 않았다. ${reason}`;
    if(s)broadcast(state,s,`item-transfer-${final.toLowerCase()}`,text,{itemTransferOfferId:transferId,itemTransferDecision:final});return{ok:true,offer,resolution:r};
  }
  const aliases=c=>uniq([c.id,c.name,...(c.aliases||[]),c.initial]).map(String);
  function localInterpret(text,ctx){
    const c=clean(text),flat=norm(c),verb=/(건네|건넨|건넬|전달|넘겨|내밀|주려고|준다|주겠|맡긴|쥐여)/.test(c);if(!verb)return{mode:"NONE",targetCharacterId:"",inventoryKey:"",quantity:0,confidence:0};
    const target=(ctx.visibleCharacters||[]).find(x=>aliases(x).some(a=>a&&flat.includes(norm(a)))),item=[...(ctx.inventory||[])].sort((a,b)=>String(b.displayName||b.name).length-String(a.displayName||a.name).length).find(x=>[x.name,x.displayName,`${x.name}${x.stateLabel}`].map(norm).some(n=>n&&flat.includes(n)));
    const q=Math.max(1,Math.min(Number(c.match(/(\d+)\s*(?:개|병|장|권|점|묶음)?/)?.[1]||1),Number(item?.quantity||1)));return target&&item?{mode:"OFFER",targetCharacterId:target.id,inventoryKey:item.inventoryKey,quantity:q,confidence:.88}:{mode:"NONE",targetCharacterId:target?.id||"",inventoryKey:item?.inventoryKey||"",quantity:0,confidence:.2};
  }
  function context(state,actorId){const s=sessionOf(state,actorId);return{actorId,visibleCharacters:(s?visible(state,s,actorId):[]).map(i=>({id:i,name:uname(i),aliases:USERS[i]?.aliases||[]})),inventory:entries(state.characters?.[actorId]).map(i=>({inventoryKey:i.inventoryKey,name:i.name,displayName:display(i),state:i.state||"CLEAN",stateLabel:label(i),category:i.category||"일반",quantity:available(state,actorId,i.inventoryKey)})).filter(i=>i.quantity>0)}};
  window.BAEKJI_ITEM_TRANSFER=Object.freeze({STATE_KEY:K,USER_KEY:U,parse,uid,uname,scope,sessionOf,visible,entries,label,display,sig,pending,resolution,aliasAll,createOffer,resolveOffer,localInterpret,context});
  window.__BAEKJI_ITEM_TRANSFER_TEST__=window.BAEKJI_ITEM_TRANSFER;
})();
