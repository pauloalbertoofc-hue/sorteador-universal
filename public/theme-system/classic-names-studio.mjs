/* Isolated classic-mode names studio. Original remains on the existing page. */
const root=document.querySelector('main');
if(root&&!document.getElementById('su-classic-names')){
 const section=document.createElement('section');section.id='su-classic-names';
 section.innerHTML=`<div class="ns-intro"><h1>Sortear nomes</h1><p>Organize participantes, configure as regras e descubra os vencedores.</p></div>
 <div class="ns-tabs" role="tablist" aria-label="Etapas do sorteio">
 <button type="button" role="tab" data-tab="names" aria-selected="true">♙ Nomes</button>
 <button type="button" role="tab" data-tab="settings" aria-selected="false">☷ Configurar</button>
 <button type="button" role="tab" data-tab="result" aria-selected="false">♕ Resultado</button>
 <button type="button" role="tab" data-tab="history" aria-selected="false">◷ Histórico</button></div>
 <div class="ns-layout"><div class="ns-card">
 <section class="ns-pane" data-pane="names"><h2>Participantes <small id="ns-total">0 nomes</small></h2><p>Digite ou cole um nome por linha.</p><label for="ns-list">Lista de participantes</label><textarea id="ns-list" placeholder="Ana&#10;Bruno&#10;Carla"></textarea><div class="ns-actions"><button type="button" class="ns-secondary" id="ns-paste">Colar lista</button><label class="ns-secondary" for="ns-file" style="cursor:pointer">Importar .txt/.csv</label><input id="ns-file" type="file" accept=".txt,.csv,text/plain,text/csv" hidden></div><div class="ns-actions"><button class="ns-primary" data-next="settings">Continuar →</button></div></section>
 <section class="ns-pane" data-pane="settings" hidden><h2>Configurar sorteio</h2><p>Defina as regras antes de selecionar.</p><div class="ns-field"><label for="ns-count">Quantidade de vencedores</label><input id="ns-count" type="number" min="1" max="100" value="1"></div><label class="ns-check"><input id="ns-repeat" type="checkbox"> Permitir repetição de nomes no mesmo sorteio</label><label class="ns-check"><input id="ns-remove" type="checkbox" checked> Remover sorteados das próximas rodadas</label><div class="ns-actions"><button class="ns-secondary" data-next="names">← Voltar</button><button class="ns-primary" id="ns-draw">Sortear agora</button></div></section>
 <section class="ns-pane" data-pane="result" hidden><h2>Resultado do sorteio</h2><p>Os nomes selecionados aparecem aqui.</p><div class="ns-winner" aria-live="polite"><span>🏆 Vencedor(es)</span><strong id="ns-winners">Aguardando sorteio</strong></div><div class="ns-actions"><button class="ns-secondary" id="ns-copy">Copiar</button><button class="ns-secondary" id="ns-proof">Comprovante JSON</button><button class="ns-primary" data-next="settings">Nova rodada →</button></div></section>
 <section class="ns-pane" data-pane="history" hidden><h2>Histórico de sorteios</h2><p>Resultados armazenados neste navegador.</p><ul class="ns-history" id="ns-history"></ul><div class="ns-actions"><button class="ns-secondary" id="ns-export">Exportar histórico CSV</button><button class="ns-secondary" id="ns-clear">Limpar histórico</button></div></section>
 <p class="ns-status" id="ns-status" role="status"></p></div><aside class="ns-ad" aria-label="Área reservada para publicidade">Espaço publicitário responsivo<br>Integração AdSense pendente de validação</aside></div>`;
 root.append(section);
 const $=id=>section.querySelector('#'+id),panes=[...section.querySelectorAll('[data-pane]')],tabs=[...section.querySelectorAll('[data-tab]')];
 const key='su-classic-names-history-v1';let history=[];try{history=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(history))history=[]}catch{history=[]}
 let winners=[],remaining=null;
 const names=()=> $('ns-list').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const status=s=>$('ns-status').textContent=s;
 const go=id=>{panes.forEach(p=>p.hidden=p.dataset.pane!==id);tabs.forEach(t=>t.setAttribute('aria-selected',String(t.dataset.tab===id)));status('');};
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(history.slice(0,100)))}catch{status('Não foi possível salvar o histórico neste navegador.')}};
 const renderHistory=()=>{$('ns-history').replaceChildren();if(!history.length){const li=document.createElement('li');li.textContent='Nenhum sorteio registrado ainda.';$('ns-history').append(li)}history.forEach(h=>{const li=document.createElement('li');li.textContent=new Date(h.date).toLocaleString('pt-BR')+' — '+h.winners.join(', ');$('ns-history').append(li)})};
 const download=(name,body,type)=>{const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 const randomIndex=max=>{const limit=Math.floor(4294967296/max)*max;const a=new Uint32Array(1);do{crypto.getRandomValues(a)}while(a[0]>=limit);return a[0]%max};
 tabs.forEach(t=>t.addEventListener('click',()=>go(t.dataset.tab)));section.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.next)));
 $('ns-list').addEventListener('input',()=>{$('ns-total').textContent=names().length+' nomes';remaining=null});
 $('ns-paste').addEventListener('click',async()=>{try{$('ns-list').value=await navigator.clipboard.readText();$('ns-list').dispatchEvent(new Event('input'))}catch{status('Cole a lista manualmente no campo acima.')}});
 $('ns-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>1024*1024){status('Arquivo muito grande (limite 1 MB).');return}const txt=await f.text();$('ns-list').value=txt.replace(/\r/g,'').replace(/,/g,'\n');$('ns-list').dispatchEvent(new Event('input'))});
 $('ns-draw').addEventListener('click',()=>{const all=names(),count=Number($('ns-count').value),repeat=$('ns-repeat').checked,remove=$('ns-remove').checked;if(!all.length||!Number.isInteger(count)||count<1||count>100){status('Informe participantes e uma quantidade válida (1 a 100).');return}if(remaining===null)remaining=[...all];const pool=remove?remaining:[...all];if(!repeat&&count>pool.length){status('A quantidade excede os nomes disponíveis sem repetição.');return}if(!pool.length){status('Não há nomes disponíveis. Edite a lista para recomeçar.');return}const copy=[...pool];winners=[];for(let i=0;i<count;i++){const source=repeat?pool:copy;const index=randomIndex(source.length);winners.push(source[index]);if(!repeat)copy.splice(index,1)}if(remove){const removed=[...winners];remaining=pool.filter(n=>{const index=removed.indexOf(n);if(index===-1)return true;removed.splice(index,1);return false})}const entry={date:new Date().toISOString(),winners:[...winners],count,repeat,remove};history.unshift(entry);history=history.slice(0,100);save();renderHistory();$('ns-winners').textContent=winners.join(' • ');go('result')});
 $('ns-copy').addEventListener('click',async()=>{if(!winners.length)return;try{await navigator.clipboard.writeText(winners.join('\n'));status('Resultado copiado.')}catch{status('Não foi possível copiar automaticamente.')}});
 $('ns-proof').addEventListener('click',()=>{if(!history.length){status('Faça um sorteio primeiro.');return}download('resultado-sorteio.json',JSON.stringify(history[0],null,2),'application/json')});
 $('ns-export').addEventListener('click',()=>{const quote=s=>'"'+String(s).replace(/"/g,'""')+'"';download('historico-nomes.csv','data,vencedores\n'+history.map(h=>quote(h.date)+','+quote(h.winners.join('; '))).join('\n'),'text/csv;charset=utf-8')});
 $('ns-clear').addEventListener('click',()=>{if(!confirm('Apagar o histórico de sorteios deste navegador?'))return;history=[];save();renderHistory()});
 renderHistory();
 const sync=()=>{const classic=document.body.getAttribute('data-su-theme')==='classic';document.body.classList.toggle('su-names-studio',classic);section.hidden=!classic};
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-su-theme']});sync();
}
