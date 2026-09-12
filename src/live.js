import {createClient} from '@supabase/supabase-js';
export const liveConfigured=Boolean(__SUPABASE_URL__ && __SUPABASE_KEY__);
let client;
const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
async function connect(){
  if(!liveConfigured)throw new Error('Le mode spectateur n’est pas encore activé.');
  client ||= createClient(__SUPABASE_URL__,__SUPABASE_KEY__);
  const {data:{session}}=await client.auth.getSession();
  if(!session){const {error}=await client.auth.signInAnonymously();if(error)throw new Error('Connexion au direct impossible. Réessaie dans un instant.');}
  return client;
}
export async function createRoom(game){
  const api=await connect();
  const {data,error}=await api.rpc('cockpit_create_game',{p_state:game});
  if(error)throw new Error('Impossible d’ouvrir le direct pour le moment.');
  return {id:data.game.id,key:data.key,revision:data.game.revision};
}
export async function publishRoom(room,game){
  const api=await connect();
  const {data,error}=await api.rpc('cockpit_save_game',{p_game_id:room.id,p_state:game,p_expected_revision:room.revision});
  if(!error)return {...room,revision:data.revision};
  // A request may have committed even when its response was lost.
  const latest=await api.from('cockpit_games').select('state,revision').eq('id',room.id).single();
  if(!latest.error && canonical(latest.data.state)===canonical(game))return {...room,revision:latest.data.revision};
  if(!latest.error && latest.data.revision!==room.revision){const conflict=new Error('La partie a été modifiée sur un autre écran hôte. Le direct est suspendu pour préserver les scores.');conflict.code='conflict';throw conflict;}
  throw new Error('Connexion interrompue. Les scores restent sauvegardés sur ce téléphone.');
}
export function invitationURL(room){
  const url=new URL(location.href);url.hash=new URLSearchParams({watch:room.id,key:room.key}).toString();return url.href;
}
export async function watchRoom(id,key,onGame,onStatus){
  const api=await connect();
  const {data,error}=await api.rpc('cockpit_join_game',{p_game_id:id,p_key:key});
  if(error)throw new Error('Ce lien ne permet pas de rejoindre la partie. Vérifie le lien avec l’hôte.');
  let revision=data.revision,closed=false,refreshing=false;
  onGame(data.state,false);onStatus('Connexion au direct…');
  const accept=(row,animate=true)=>{if(!closed && row && row.revision>revision){revision=row.revision;onGame(row.state,animate && Date.now()-Date.parse(row.state.lastEvent?.at || '')<15000);}};
  const refresh=async()=>{if(closed||refreshing)return;refreshing=true;try{const current=await api.from('cockpit_games').select('state,revision').eq('id',id).single();if(!current.error)accept(current.data,false);}finally{refreshing=false;}};
  const channel=api.channel(`cockpit:${id}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'cockpit_games',filter:`id=eq.${id}`},payload=>accept(payload.new)).subscribe(status=>{if(closed)return;if(status==='SUBSCRIBED'){onStatus('En direct · Lecture seule');refresh();}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){onStatus('Reconnexion au direct…');}});
  const interval=setInterval(refresh,15000);
  const online=()=>refresh();window.addEventListener('online',online);
  return ()=>{closed=true;clearInterval(interval);window.removeEventListener('online',online);api.removeChannel(channel);};
}
