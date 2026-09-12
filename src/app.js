import {COLORS,createGame,currentStep,scoreOf,livesOf,fallbackOf,ranking,previewTurn,applyTurn,undoTurn,validateSavedGame} from './game.js';
import {liveConfigured,createRoom,publishRoom,invitationURL,watchRoom} from './live.js';
import QRCode from 'qrcode';

const app=document.querySelector('#app'),modal=document.querySelector('#modal'),saveState=document.querySelector('#save-state');
const STORAGE='5000-cockpit-v1',fmt=n=>Number(n).toLocaleString('fr-FR');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=null,draft=0,setupNames=['Nico','Léa'],screen='setup',busy=false,toastTimer,closeWatch=null,liveStatus='',retryTimer=null,retryCount=0,watchRun=0,modalVersion=0;
const params=new URLSearchParams(location.hash.slice(1));
const spectator=params.has('watch');
try {const saved=JSON.parse(localStorage.getItem(STORAGE));if(saved?.game){session={game:validateSavedGame(saved.game),room:saved.room || null,dirty:Boolean(saved.dirty),conflict:Boolean(saved.conflict)};draft=Number.isSafeInteger(saved.draft)?Math.max(0,saved.draft):0;screen='game';}}catch{toast('La sauvegarde est illisible. Tu peux commencer une nouvelle partie.');}
if(spectator){session=null;draft=0;screen='watch-loading';}

function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4200);}
function persist(){if(spectator||!session)return;try{localStorage.setItem(STORAGE,JSON.stringify({...session,draft}));status();}catch{saveState.textContent='Sauvegarde indisponible';toast('Le stockage du téléphone est plein ou indisponible. Garde cet écran ouvert.');}}
function status(){saveState.textContent=spectator?(liveStatus||'Lecture seule'):session?.conflict?'Direct suspendu':session?.dirty?'Enregistré ici · Direct en attente':session?.room?'Sauvegardé · En direct':session?'Sauvegardé sur ce téléphone':'Sur ce téléphone';let retry=document.querySelector('#retry-live');if(!retry){retry=document.createElement('button');retry.id='retry-live';retry.className='text-button';retry.dataset.action='retry';saveState.after(retry);}retry.textContent='Réessayer';retry.hidden=spectator||!session?.dirty||session.conflict;retry.disabled=busy;}
function hearts(lives){return `<span class="hearts" aria-label="${lives} vie${lives>1?'s':''} sur 3"><span aria-hidden="true">${'♥'.repeat(lives)}<span class="empty-heart">${'♡'.repeat(3-lives)}</span></span></span>`;}
function avatar(player){return `<span class="avatar" style="--player:${player.color}" aria-hidden="true">${escape(player.name[0].toLocaleUpperCase('fr'))}</span>`;}
function eventText(game){const e=game.lastEvent;if(!e)return 'La partie commence. À '+game.players[game.turn].name+' !';if(e.type==='undo')return 'Dernier tour annulé. À '+game.players[game.turn].name+'.';if(e.winner)return e.name+' remporte la partie avec 5 000 pile !';if(e.type==='score')return `${e.name} +${fmt(e.amount)}${e.effects.length?' · '+e.effects.map(v=>`${v.name} : ${fmt(v.palier)} barré${v.to<v.from?' → '+fmt(v.to):''}`).join(' · '):' → '+fmt(e.to)}.`;return `${e.name} · ${e.type==='bigfail'?'Big fail':e.type==='overflow'?'Dépassement, fail':'Fail'}${e.to<e.from?' · Repli à '+fmt(e.to):e.to===0?' · Reste à 0':' · '+e.lives+' vie'+(e.lives>1?'s':'')+' restante'+(e.lives>1?'s':'')}.`;}
function render(){
  if(screen==='setup'){renderSetup();return;}
  if(screen==='watch-loading'){app.innerHTML='<section class="panel wait-panel"><span class="eyebrow">SPECTATEUR</span><h1>Connexion à la partie…</h1><p>Les scores vont apparaître ici.</p></section>';return;}
  if(screen==='watch-error'){return;}
  const game=session.game,p=game.players[game.turn],winner=game.players.find(q=>q.id===game.winner);
  app.innerHTML=`<div class="room-line"><span class="room-tag">${spectator?'SPECTATEUR':'TÉLÉPHONE HÔTE'}</span><span>Manche ${game.round} · ${game.players.length} joueurs</span></div><div class="game-grid"><section class="leaderboard" aria-label="Classement"><div class="section-heading"><h1>La course aux 5 000</h1><span>${winner?'TERMINÉE':'CLASSEMENT'}</span></div><div class="player-list">${ranking(game).map(({player,rank})=>`<button type="button" class="player-row ${player.id===p.id&&!winner?'active':''} ${rank===1&&scoreOf(player)>0?'leader':''}" data-player="${player.id}" aria-label="${escape(player.name)}, ${fmt(scoreOf(player))} points, ${livesOf(player)} vies, voir les paliers"><span class="rank">${rank}<small>${rank===1?'er':'e'}</small></span>${avatar(player)}<span class="player-info"><span class="player-name">${escape(player.name)}${player.id===p.id&&!winner?'<small>À TOI</small>':''}</span><span class="meter"><span style="width:${scoreOf(player)/50}%;background:${player.color}"></span></span></span><span class="player-points"><strong>${fmt(scoreOf(player))}</strong>${hearts(livesOf(player))}</span></button>`).join('')}</div><div class="leaderboard-foot"><span>Touche un joueur pour voir ses paliers</span>${!spectator?'<button class="text-button" data-action="share">Inviter des spectateurs</button>':''}</div></section><section class="control-zone" aria-label="${spectator?'Tour en cours':'Saisie des scores'}">${winner?`<section class="turn-panel finished"><span class="eyebrow">VICTOIRE</span><h2>${escape(winner.name)}</h2><strong class="winner-score">5 000</strong><button class="primary" data-action="victory">Revoir la victoire</button></section>`:`<section class="turn-panel"><div class="turn-top"><span class="eyebrow">${spectator?'AU TOUR DE':'À TOI DE JOUER'}</span>${hearts(livesOf(p))}</div><div class="turn-main"><h2>${escape(p.name)}</h2><strong>${fmt(scoreOf(p))}</strong></div><div class="turn-bottom"><span>Repli <b>${fmt(fallbackOf(p)?.score||0)}</b></span><span>Ensuite <b>${escape(game.players[(game.turn+1)%game.players.length].name)}</b></span></div></section>`}<div id="turn-event" class="turn-event" role="status" aria-live="polite">${escape(eventText(game))}</div>${!spectator&&!winner?`<section class="entry-panel"><div class="draft-line"><label for="turn-score">Score du tour<small id="score-projection"></small></label><div class="score-input"><span aria-hidden="true">+</span><input id="turn-score" type="number" inputmode="numeric" min="0" max="999999" step="1" value="${draft}" aria-label="Score personnalisé du tour"><button class="clear-score" data-action="clear" aria-label="Effacer le score du tour">×</button></div></div><div class="score-buttons">${[100,200,500,1000].map(n=>`<button class="score-button" data-add="${n}" ${busy?'disabled':''}>+${fmt(n)}</button>`).join('')}</div><button class="primary validate" id="validate-score" data-action="score" ${busy?'disabled':''}>Valider le score</button><p id="score-hint" class="score-hint" aria-live="polite"></p><div class="fail-buttons"><button data-action="fail" ${busy?'disabled':''}>Fail <small>−1 vie</small></button><button data-action="bigfail" ${busy?'disabled':''}>Big fail <small>−2 vies</small></button></div><button class="undo-button" data-action="undo" ${game.actions.length&&!busy?'':'disabled'}>↶ Annuler le dernier tour</button></section>`:spectator?'<div class="spectator-note"><span class="live-indicator"></span><span id="live-state">'+escape(liveStatus||'Lecture seule')+'</span></div>':'<button class="primary new-game" data-action="new">Nouvelle partie</button>'}</section></div>`;
  updateDraft();status();
}
function renderSetup(){
  app.innerHTML=`<section class="setup panel"><div class="setup-intro"><span class="eyebrow">À VOS CINQ DÉS</span><h1>Qui joue ce soir ?</h1><p>Ajoute les joueurs dans l’ordre des tours.</p></div><form id="setup-form"><div class="name-list">${setupNames.map((name,i)=>`<div class="name-row"><span class="avatar" style="--player:${COLORS[i]}" aria-hidden="true">${i+1}</span><label class="visually-hidden" for="name-${i}">Joueur ${i+1}</label><input id="name-${i}" data-name="${i}" type="text" maxlength="24" autocomplete="off" value="${escape(name)}" placeholder="Prénom du joueur ${i+1}" required><button type="button" class="remove-player" data-remove="${i}" aria-label="Retirer le joueur ${i+1}" ${setupNames.length<=2?'disabled':''}>×</button></div>`).join('')}</div><button type="button" class="secondary add-player" data-action="add-player" ${setupNames.length>=12?'disabled':''}>+ Ajouter un joueur</button><div class="rules-chip"><span>Entrée <b>400 min.</b></span><span>Palier <b>3 vies</b></span><span>Victoire <b>5 000 pile</b></span></div><p id="setup-error" class="form-error" role="alert"></p><button type="submit" class="primary start-game">Commencer la partie</button>${session?'<button type="button" class="text-button cancel-setup" data-action="resume">Reprendre la partie en cours</button>':''}</form></section>`;
  status();
}
function updateDraft(){
  const input=document.querySelector('#turn-score'),button=document.querySelector('#validate-score');if(!input||!button)return;
  const game=session.game,p=game.players[game.turn],preview=previewTurn(game,draft);
  button.disabled=!preview.valid||busy;
  input.disabled=busy;
  button.classList.toggle('overflow',Boolean(preview.overflow));
  button.textContent=busy?'Enregistrement…':preview.overflow?'Dépassement · Compter un fail':draft>0?`Valider +${fmt(draft)} →`:'Valider le score →';
  document.querySelector('#score-projection').textContent=scoreOf(p)===0&&draft<400?'Minimum 400 pour entrer':`${fmt(scoreOf(p))} → ${fmt(scoreOf(p)+draft)} points`;
  const hint=document.querySelector('#score-hint');
  hint.textContent=preview.overflow?preview.message:preview.win?'5 000 pile : la victoire est à toi !':preview.victims?.length?`${fmt(preview.to)} : palier de ${preview.victims.join(' et ')} en danger !`:draft>0&&!preview.valid?preview.message:'';
  hint.classList.toggle('warning',Boolean(preview.overflow||preview.victims?.length||!preview.valid&&draft>0));
}
function openModal(title,html,css=''){
  modalVersion++;
  modal.className=css;
  modal.innerHTML=`<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close" aria-label="Fermer">×</button></div>${html}`;
  if(!modal.open)modal.showModal();
}
function showHistory(id){
  const p=session.game.players.find(q=>q.id===id);if(!p)return;
  openModal(`Paliers de ${escape(p.name)}`,`<div class="history-head">${avatar(p)}<strong>${fmt(scoreOf(p))}<small>POINTS</small></strong>${hearts(livesOf(p))}</div><div class="history-list">${p.steps.length?[...p.steps].reverse().map(s=>`<div class="history-row ${s.barred?'barred':''}"><span><strong>${fmt(s.score)}</strong><small>${s.barred?escape(s.reason):s.id===currentStep(p)?.id?'Palier actuel':'Palier de repli'}</small></span>${s.barred?'<span class="barred-label">BARRÉ</span>':hearts(s.lives)}</div>`).join(''):'<p>Aucun palier pour le moment.<br>Il faut au moins 400 points pour entrer.</p>'}</div>`);
}
function showRules(){openModal('Vos règles du 5000',`<ol class="rules-list"><li>Les dés se jouent à la main. Saisis le score du tour, puis valide pour passer au suivant.</li><li>À <b>0</b>, il faut marquer au moins <b>400 points</b>.</li><li>Chaque score validé s’ajoute au total et crée un palier avec <b>3 vies</b>.</li><li>Atteindre exactement un palier adverse le barre, même s’il est ancien. Un palier actuel barré fait retomber son joueur au dernier palier valide.</li><li><b>Fail : −1 vie. Big fail : −2 vies.</b> Le tour se termine.</li><li>Un palier sans vie est barré. Les anciens paliers gardent leurs vies ; sans palier valide, retour à 0.</li><li><b>5 000 pile</b> pour gagner. Dépasser 5 000 compte comme un fail.</li></ol>`);}
function showMenu(){openModal('Le cockpit',`<div class="menu-list">${session&&!spectator?'<button class="secondary" data-action="share">Inviter des spectateurs</button><button class="secondary" data-action="new">Nouvelle partie</button>':''}${session?.game.actions.length&&!spectator?'<button class="secondary" data-action="undo">Annuler le dernier tour</button>':''}<button class="secondary" data-action="rules">Règles de la table</button><button class="secondary" data-action="install">Ajouter à l’écran d’accueil</button></div>`);}
function victory(){const winner=session?.game.players.find(p=>p.id===session.game.winner);if(!winner)return;openModal('Victoire !',`<div class="victory-content">${Array.from({length:28},(_,i)=>`<span class="confetti" aria-hidden="true" style="left:${i*37%100}%;--delay:${i%8*.12}s;background:${COLORS[i%4]}"></span>`).join('')}<span class="victory-emblem" aria-hidden="true">★</span><p class="eyebrow">AU SOMMET DU COCKPIT</p><h3>${escape(winner.name)}</h3><strong class="victory-points">5 000</strong><p>Pile. La partie est à toi.</p><button class="primary" data-action="close">Voir le classement</button></div>`,'victory-modal');}
function animateTurn(){const event=document.querySelector('#turn-event');event?.classList.add(session.game.lastEvent?.type==='score'?'score-flash':'fail-shake');const id=session.game.lastEvent?.playerId;document.querySelector(`[data-player="${id}"]`)?.classList.add('score-celebration');if(session.game.winner)victory();}
async function sync(){
  if(!session?.room||!session.dirty||busy||session.conflict||spectator)return;
  const target=session;
  clearTimeout(retryTimer);
  busy=true;render();
  try{const room=await publishRoom(target.room,target.game);if(target===session){target.room=room;target.dirty=false;retryCount=0;}}
  catch(e){if(target===session){target.conflict=e.code==='conflict';toast(e.message);if(!target.conflict&&retryCount<5){const delay=Math.min(30000,3000*2**retryCount++);retryTimer=setTimeout(()=>{if(target===session&&navigator.onLine)sync();},delay);}}}
  finally{busy=false;if(target===session){persist();render();}}
}
async function play(type){
  if(busy||spectator||!session)return;
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE));
    if(saved?.game.id===session.game.id&&saved.game.revision>session.game.revision){session={...saved,game:validateSavedGame(saved.game)};draft=0;render();toast('Les scores ont été actualisés depuis un autre onglet.');return;}
    if(saved?.game.id===session.game.id&&saved.game.revision===session.game.revision&&saved.room&&(!session.room||saved.room.revision>=session.room.revision)){session.room=saved.room;session.dirty=Boolean(saved.dirty);session.conflict=Boolean(saved.conflict);}
  }catch{}
  try{session.game=type==='undo'?undoTurn(session.game):applyTurn(session.game,type,draft);}catch(e){toast(e.message);return;}
  session.dirty=Boolean(session.room);draft=0;persist();render();animateTurn();
  if(type==='undo')toast('Dernier tour annulé.');
  if(session.room){await sync();animateTurn();}
}
async function share(){
  if(!session||spectator||busy)return;
  if(!liveConfigured){openModal('Inviter des spectateurs','<div class="modal-body"><p>Le mode spectateur n’est pas encore activé pour cette application.</p><p>Vous pouvez déjà jouer ensemble sur ce téléphone. La partie est sauvegardée automatiquement.</p><button class="primary" data-action="close">Retour à la partie</button></div>');return;}
  openModal('Inviter des spectateurs','<p class="modal-body">Ouverture du direct…</p>');
  const target=session,version=modalVersion;
  try{if(!target.room){busy=true;render();const room=await createRoom(target.game);if(target!==session)return;target.room=room;target.dirty=false;persist();}else if(target.dirty){await sync();if(target.dirty)throw new Error('Reconnecte ce téléphone pour actualiser les scores avant de partager.');}
    if(target!==session||!modal.open||modalVersion!==version)return;
    const url=invitationURL(target.room);
    openModal('La partie en direct',`<div class="share-panel"><canvas id="invite-qr" aria-label="QR code pour suivre cette partie"></canvas><p>Les autres téléphones voient les scores et les animations. <b>Tu gardes la main sur la saisie.</b></p><label for="invite-link">Lien spectateur</label><input id="invite-link" readonly value="${escape(url)}"><button class="primary" data-action="copy-link">Copier le lien</button></div>`);
    await QRCode.toCanvas(document.querySelector('#invite-qr'),url,{width:230,margin:2,color:{dark:'#1e1436',light:'#ffffff'}});
  }catch(e){if(target===session&&modal.open&&modalVersion===version)openModal('Direct indisponible',`<div class="modal-body"><p>${escape(e.message)}</p><button class="primary" data-action="close">Retour à la partie</button></div>`);else toast(e.message);}
  finally{busy=false;if(target===session)render();}
}
function newGame(){if(spectator)return;if(session){openModal('Commencer une autre partie ?',`<div class="modal-body"><p>La partie actuelle sera remplacée sur ce téléphone${session.room?' ; les spectateurs conserveront son dernier score':''}.</p><button class="primary" data-action="confirm-new">Choisir les joueurs</button><button class="secondary full" data-action="close">Garder cette partie</button></div>`);}else{screen='setup';render();}}
async function handleAction(action){
  if(action==='close'){modal.close();return;}
  if(action==='rules'){showRules();return;}
  if(action==='install'){openModal('Sur ton écran d’accueil','<div class="modal-body"><p><b>Sur iPhone :</b> ouvre cette page dans Safari, touche Partager, puis « Sur l’écran d’accueil ».</p><p><b>Sur Android :</b> dans le menu du navigateur, choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p><p>Une fois ouverte, la partie reste utilisable sans réseau sur le téléphone hôte.</p></div>');return;}
  if(action==='victory'){victory();return;}
  if(spectator)return;
  if(busy&&['new','confirm-new','add-player','resume'].includes(action)){toast('L’enregistrement est en cours. Patiente un instant.');return;}
  if(action==='retry'){retryCount=0;await sync();return;}
  if(action==='score'||action==='fail'||action==='bigfail'||action==='undo'){if(modal.open)modal.close();await play(action);return;}
  if(action==='clear'){draft=0;const input=document.querySelector('#turn-score');if(input)input.value=0;updateDraft();persist();return;}
  if(action==='share'){await share();return;}
  if(action==='copy-link'){const input=document.querySelector('#invite-link');try{await navigator.clipboard.writeText(input.value);toast('Lien copié.');}catch{input.select();toast('Sélectionne et copie le lien.');}return;}
  if(action==='new'){newGame();return;}
  if(action==='confirm-new'){modal.close();setupNames=session.game.players.map(p=>p.name);screen='setup';render();return;}
  if(action==='resume'){screen='game';render();return;}
  if(action==='add-player'){if(setupNames.length<12){setupNames.push('');renderSetup();document.querySelector(`[data-name="${setupNames.length-1}"]`).focus();}return;}
}
document.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button||button.disabled)return;
  if(button.id==='menu-button'){showMenu();return;}
  if(button.dataset.player){showHistory(button.dataset.player);return;}
  if(button.dataset.add&&!spectator&&!busy){draft=Math.min(999999,(Number.isSafeInteger(draft)?draft:0)+Number(button.dataset.add));document.querySelector('#turn-score').value=draft;updateDraft();persist();return;}
  if(button.dataset.remove!==undefined&&!spectator){setupNames.splice(Number(button.dataset.remove),1);renderSetup();return;}
  if(button.dataset.action)await handleAction(button.dataset.action);
});
document.addEventListener('input',e=>{if(e.target.dataset.name!==undefined)setupNames[Number(e.target.dataset.name)]=e.target.value;if(e.target.id==='turn-score'){draft=e.target.value===''?0:Number(e.target.value);updateDraft();persist();}});
document.addEventListener('submit',e=>{if(e.target.id!=='setup-form')return;e.preventDefault();try{session={game:createGame(setupNames),room:null,dirty:false,conflict:false};draft=0;screen='game';persist();render();}catch(error){document.querySelector('#setup-error').textContent=error.message;}});
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();if(spectator){showRules();return;}if(session){screen='game';render();}else{screen='setup';render();}});
modal.addEventListener('click',e=>{if(e.target===modal){const rect=modal.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)modal.close();}});
window.addEventListener('online',()=>{if(!spectator){retryCount=0;sync();}});
window.addEventListener('storage',e=>{if(e.key!==STORAGE||spectator||busy||!e.newValue)return;try{const updated=JSON.parse(e.newValue);if(session&&updated.game.id===session.game.id){if(updated.game.revision>session.game.revision){session={...updated,game:validateSavedGame(updated.game)};draft=0;render();}else if(updated.game.revision===session.game.revision&&updated.room&&(!session.room||updated.room.revision>=session.room.revision)){session.room=updated.room;session.dirty=Boolean(updated.dirty);session.conflict=Boolean(updated.conflict);status();}}}catch{}});
render();
function startWatching(){
  const run=++watchRun;closeWatch?.();closeWatch=null;
  watchRoom(params.get('watch'),params.get('key'),(game,animate)=>{if(run!==watchRun)return;try{session={game:validateSavedGame(game)};screen='game';render();if(animate)animateTurn();}catch{toast('Les données de la partie ne peuvent pas être lues.');}},message=>{if(run!==watchRun)return;liveStatus=message;status();const el=document.querySelector('#live-state');if(el)el.textContent=message;}).then(close=>{if(run===watchRun)closeWatch=close;else close();}).catch(e=>{if(run!==watchRun)return;screen='watch-error';app.innerHTML=`<section class="panel wait-panel"><h1>Partie indisponible</h1><p>${escape(e.message)}</p><a class="primary" href="./">Ouvrir le cockpit</a></section>`;});
}
if(spectator)startWatching();else if(session?.dirty)sync();
window.addEventListener('pagehide',()=>{watchRun++;closeWatch?.();closeWatch=null;clearTimeout(retryTimer);});
window.addEventListener('pageshow',e=>{if(e.persisted){if(spectator)startWatching();else sync();}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&spectator&&session)startWatching();});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
