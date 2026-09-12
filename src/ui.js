import {scoreOf,livesOf,fallbackOf,ranking} from './game.js';

const fmt=n=>Number(n).toLocaleString('fr-FR');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hearts=lives=>`<span class="hearts" aria-label="${lives} vie${lives>1?'s':''} sur 3"><span aria-hidden="true">${'♥'.repeat(lives)}<span class="empty-heart">${'♡'.repeat(3-lives)}</span></span></span>`;

export function renderGame(game,{spectator,busy,draft,liveStatus,message}) {
  const player=game.players[game.turn];
  const next=game.players[(game.turn+1)%game.players.length];
  const winner=game.players.find(p=>p.id===game.winner);
  const density=game.players.length>8?'triple':game.players.length>4?'pair':'rows';
  const turnHeading=`<div class="active-player"><span class="eyebrow">${spectator?'AU TOUR DE':'À TOI DE JOUER'}</span><h1>${escape(player.name)}</h1><span class="next-player">Ensuite : <b>${escape(next.name)}</b></span></div>`;
  const scoreEntry=`<div class="entry-heading">${turnHeading}<div class="draft-field"><label for="turn-score">Score du tour</label><div class="score-input"><span aria-hidden="true">+</span><input id="turn-score" type="number" inputmode="numeric" min="0" max="999999" step="1" value="${draft}" aria-label="Score personnalisé du tour"><button class="clear-score" data-action="clear" aria-label="Effacer le score du tour">×</button></div></div></div>
    <div class="entry-context"><span id="score-projection"></span><span>Repli <b>${fmt(fallbackOf(player)?.score||0)}</b></span></div>
    <div class="score-buttons">${[100,200,500,1000].map(n=>`<button class="score-button" data-add="${n}" ${busy?'disabled':''}>+${fmt(n)}</button>`).join('')}</div>
    <div class="turn-actions"><button class="primary validate" id="validate-score" data-action="score" ${busy?'disabled':''}>Valider</button><button class="fail-action" data-action="fail" ${busy?'disabled':''}>Fail<small>−1 vie</small></button><button class="bigfail-action" data-action="bigfail" ${busy?'disabled':''}>Big fail<small>−2 vies</small></button></div>`;
  const finished=`<div class="compact-victory"><span class="eyebrow">VICTOIRE</span><h1>${escape(winner?.name)}</h1><strong>5 000</strong><button class="primary" data-action="victory">Revoir la victoire</button></div>`;
  const watching=`<div class="entry-heading">${turnHeading}<div class="watching-score"><strong>${fmt(scoreOf(player))}</strong>${hearts(livesOf(player))}</div></div><div class="entry-context"><span>Repli ${fmt(fallbackOf(player)?.score||0)}</span><span id="live-state">${escape(liveStatus||'Lecture seule')}</span></div>`;
  return `<div class="game-grid">
    <section class="control-zone" aria-label="${spectator?'Tour en cours':'Saisie des scores'}">
      <div class="score-console">${winner?finished:spectator?watching:scoreEntry}</div>
      <button id="turn-event" class="turn-event" data-action="event-details" aria-haspopup="dialog"><span id="turn-message" role="status" aria-live="polite">${escape(message)}</span><span class="event-more" aria-hidden="true">›</span></button>
    </section>
    <section class="leaderboard" data-density="${density}" aria-label="Classement">
      <div class="section-heading"><h2>Classement</h2><span>${winner?'PARTIE TERMINÉE':'OBJECTIF 5 000'}</span></div>
      <div class="player-list">${ranking(game).map(({player:p,rank})=>`<button type="button" class="player-row ${p.id===player.id&&!winner?'active':''} ${rank===1&&scoreOf(p)>0?'leader':''}" data-player="${p.id}" aria-label="${escape(p.name)}, ${fmt(scoreOf(p))} points, ${livesOf(p)} vies, voir les paliers">
        <span class="rank">${rank}<small>${rank===1?'er':'e'}</small></span>
        <span class="avatar" style="--player:${p.color}" aria-hidden="true">${escape(p.name[0].toLocaleUpperCase('fr'))}</span>
        <span class="player-info"><span class="player-name">${escape(p.name)}${p.id===player.id&&!winner?'<small>À TOI</small>':''}</span><span class="meter"><span style="width:${scoreOf(p)/50}%;background:${p.color}"></span></span></span>
        <span class="player-points"><strong>${fmt(scoreOf(p))}</strong>${hearts(livesOf(p))}</span>
      </button>`).join('')}</div>
    </section>
  </div>`;
}
