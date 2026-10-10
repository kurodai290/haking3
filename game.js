(() => {
  const $ = (id) => document.getElementById(id);
  // Fictional lab-only Storage clues used by selected cases; no answers are stored here.
  try { if (!localStorage.getItem('bb_cache_key')) localStorage.setItem('bb_cache_key','K3'); if (!localStorage.getItem('bb_archive_tag')) localStorage.setItem('bb_archive_tag','TAG9'); } catch {}
  const message = $('message');
  const answer = $('answer');
  const verify = $('verify');
  const stage = Number(document.body.dataset.stage || 0);
  const detour = Number(document.body.dataset.detour || 0);
  const say = (text, type='') => { if (!message) return; message.textContent=text; message.className='message '+type; };
  async function request(url, body) {
    const response = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(body)});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'サーバーとの通信に失敗しました。');
    return data;
  }
  async function submit() {
    if (!answer || !verify) return;
    const value=answer.value.trim(); if (!value) { say('回答を入力してください。','error'); answer.focus(); return; }
    verify.disabled=true; say('サーバーで照合しています…');
    try {
      const data = detour ? await request('/api/verify-detour',{checkpoint:detour,answer:value}) : await request('/api/verify',{stage,answer:value});
      if (!data.ok) { say(data.message || '不正解です。','error'); answer.select(); return; }
      say(data.message || '認証成功','success');
      if (data.nextPath) { verify.textContent='移動中…'; window.location.assign(data.nextPath); }
    } catch (e) { say(e.message || 'サーバーとの接続に失敗しました。','error'); }
    finally { verify.disabled=false; }
  }
  if (verify) verify.addEventListener('click',submit);
  if (answer) answer.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
  const reset=$('reset'); if(reset) reset.addEventListener('click',async()=>{if(!confirm('このブラウザーの進行状況を最初からに戻しますか？'))return;reset.disabled=true;try{await request('/api/reset',{});window.location.assign('/index.html');}catch(e){say(e.message,'error');reset.disabled=false;}});
  async function loadProgress(){
    const grid=$('stageGrid'); if(!grid)return;
    try { const r=await fetch('/api/progress',{credentials:'same-origin',cache:'no-store'}); const p=await r.json(); const current=Number(p.stage||1); const done=Math.min(15,current-1); $('progressText').textContent=`${done} / 15`; $('progressBar').style.width=`${done/15*100}%`; for(let i=1;i<=15;i++){const d=document.createElement('div');d.className='stage-dot '+(i<current?'done':i===current?'current':'');d.textContent=String(i).padStart(2,'0');grid.appendChild(d);} }
    catch { grid.textContent='進行状況を読み込めません'; }
  }
  loadProgress();
})();
