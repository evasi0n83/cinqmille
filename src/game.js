export const COLORS = ['#79e4ff','#f396d8','#bda3ff','#ffd188','#8ae0b2','#ff9c97','#9fb8ff','#efe697','#d79fff','#95dfd9','#d5c0a0','#ffaed7'];
export const TARGET = 5000;
export const MIN_ENTRY = 400;
const clone = value => structuredClone(value);
const uid = () => crypto.randomUUID();

export function currentStep(player) {
  return player.steps.findLast(step => !step.barred && step.lives > 0) || null;
}
export const scoreOf = player => currentStep(player)?.score || 0;
export const livesOf = player => currentStep(player)?.lives || 0;
export function fallbackOf(player) {
  const valid = player.steps.filter(step => !step.barred && step.lives > 0);
  return valid.length > 1 ? valid.at(-2) : null;
}
export function ranking(game) {
  return [...game.players].sort((a,b) => scoreOf(b)-scoreOf(a)).map(player=>({player,rank:1+game.players.filter(p=>scoreOf(p)>scoreOf(player)).length}));
}
export function createGame(names, {id=uid(), at=new Date().toISOString()}={}) {
  if (!Array.isArray(names) || names.length<2 || names.length>12) throw new Error('Prévois entre 2 et 12 joueurs.');
  names=names.map(name=>String(name).trim());
  if(names.some(name=>!name || name.length>24))throw new Error('Chaque prénom doit contenir entre 1 et 24 caractères.');
  if(new Set(names.map(name=>name.toLocaleLowerCase('fr'))).size!==names.length)throw new Error('Choisis un prénom différent pour chaque joueur.');
  return {version:1,id,createdAt:at,revision:0,turn:0,round:1,winner:null,players:names.map((name,i)=>({id:`p${i+1}`,name,color:COLORS[i],steps:[]})),actions:[],lastEvent:null};
}
export function previewTurn(game, amount) {
  const p=game.players[game.turn], from=scoreOf(p), to=from+amount;
  if(game.winner!==null)return {valid:false,message:'La partie est terminée.'};
  if(!Number.isSafeInteger(amount) || amount<=0 || amount>999999)return {valid:false,message:'Saisis un nombre entier de points entre 1 et 999 999.'};
  if(from===0 && amount<MIN_ENTRY)return {valid:false,message:'Au moins 400 points pour quitter 0.'};
  if(to>TARGET)return {valid:true,overflow:true,to,from,message:'Plus de 5 000 : ce tour comptera comme un fail.'};
  const victims=game.players.filter(q=>q.id!==p.id && q.steps.some(s=>!s.barred && s.lives>0 && s.score===to));
  return {valid:true,overflow:false,to,from,victims:victims.map(q=>q.name),win:to===TARGET};
}
function execute(game, action) {
  const p=game.players[game.turn], before=scoreOf(p), effects=[];
  let type=action.type, amount=action.amount || 0;
  if(type==='score' && before+amount>TARGET)type='overflow';
  if(type==='score') {
    const total=before+amount;
    p.steps.push({id:action.id,score:total,lives:3,barred:false,reason:null});
    for(const other of game.players) {
      if(other.id===p.id)continue;
      const previous=scoreOf(other);
      for(const step of other.steps){
        if(!step.barred && step.lives>0 && step.score===total){step.barred=true;step.reason=`Atteint par ${p.name}`;effects.push({playerId:other.id,name:other.name,palier:total,from:previous,to:null});}
      }
      effects.filter(effect=>effect.playerId===other.id).forEach(effect=>effect.to=scoreOf(other));
    }
    if(total===TARGET)game.winner=p.id;
  } else {
    const loss=type==='bigfail'?2:1, step=currentStep(p);
    if(step){step.lives=Math.max(0,step.lives-loss);if(!step.lives){step.barred=true;step.reason='Plus de vies';}}
  }
  game.lastEvent={id:action.id,at:action.at,type,playerId:p.id,name:p.name,amount:type==='score'?amount:0,from:before,to:scoreOf(p),lives:livesOf(p),effects,winner:game.winner};
  if(game.winner===null){game.turn=(game.turn+1)%game.players.length;if(game.turn===0)game.round++;}
  game.actions.push(action);
  return game;
}
export function applyTurn(game, type, amount=0, metadata={}) {
  if(game.winner!==null)throw new Error('La partie est terminée.');
  if(!['score','fail','bigfail'].includes(type))throw new Error('Action inconnue.');
  if(type==='score'){const preview=previewTurn(game,amount);if(!preview.valid)throw new Error(preview.message);}
  const next=clone(game);
  execute(next,{id:metadata.id || uid(),at:metadata.at || new Date().toISOString(),type,amount:type==='score'?amount:0});
  next.revision=game.revision+1;
  return next;
}
export function undoTurn(game) {
  if(!game.actions.length)throw new Error('Aucun tour à annuler.');
  const removed=game.lastEvent;
  const next=createGame(game.players.map(p=>p.name),{id:game.id,at:game.createdAt});
  for(const action of game.actions.slice(0,-1))execute(next,clone(action));
  next.revision=game.revision+1;
  next.lastEvent={id:uid(),at:new Date().toISOString(),type:'undo',name:removed?.name || '',playerId:next.players[next.turn].id,from:0,to:scoreOf(next.players[next.turn]),effects:[],winner:null};
  return next;
}
export function validateSavedGame(value) {
  if(!value || value.version!==1 || typeof value.id!=='string' || !Array.isArray(value.players) || !Array.isArray(value.actions) || value.actions.length>20000 || !Number.isSafeInteger(value.revision) || value.revision<0)throw new Error('Sauvegarde illisible.');
  const rebuilt=createGame(value.players.map(p=>p.name),{id:value.id,at:value.createdAt});
  for(const action of value.actions){
    if(!action || typeof action.id!=='string' || !['score','fail','bigfail'].includes(action.type) || rebuilt.winner!==null)throw new Error('Historique invalide.');
    if(action.type==='score' && !previewTurn(rebuilt,action.amount).valid)throw new Error('Score invalide dans la sauvegarde.');
    execute(rebuilt,clone(action));
  }
  rebuilt.revision=value.revision;
  if(value.lastEvent?.type==='undo')rebuilt.lastEvent={...rebuilt.lastEvent,...value.lastEvent};
  return rebuilt;
}
