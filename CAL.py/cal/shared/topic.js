(function(){
  const $ = (sel, el=document) => el.querySelector(sel);
  const on = (el, evt, fn, opts) => el && el.addEventListener(evt, fn, opts);
  const debounce = (fn, wait=150) => { let t; return function(...args){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,args), wait); }; };

  // Detect backend API base
  const API_BASE = (()=>{
    try{
      const url = new URL(location.href);
      const q = url.searchParams.get('api');
      if(q){ localStorage.setItem('api-base', q); }
      const saved = localStorage.getItem('api-base');
      if(saved) return saved.replace(/\/$/, '');
      const host = location.host; const m = host.match(/^(.*)-(\d+)\.app\.github\.dev$/);
      if(m){ return `${location.protocol}//${m[1]}-8000.app.github.dev`; }
      return `${location.protocol}//${location.hostname}:8000`;
    }catch{ return 'http://127.0.0.1:8000'; }
  })();

  // 從查詢參數 id 取得題號，若無則回退以路徑推得，例如 /cal/topic/520001/
  const TOPIC_ID = (()=>{
    try{
      const u = new URL(location.href);
      const q = u.searchParams.get('id');
      if(q && /^\d+$/.test(q)) return q;
    }catch{}
    const m = location.pathname.match(/\/topic\/(\d+)/);
    return m? m[1] : 'unknown';
  })();

  const app = {
    leftWidth: parseFloat(localStorage.getItem(`leftWidth-${TOPIC_ID}`)) || 40,
    editorHeight: parseFloat(localStorage.getItem(`editorHeight-${TOPIC_ID}`)) || 60,
    readOnlyLines: new Set(),
    cfg: null,
    busy: false,
  };
  let readCode = ()=>''; let writeCode = (_)=>{};
  let setBusy = (_)=>{};

  document.addEventListener('DOMContentLoaded', init);

  async function init(){
    // URL 直入鎖題保護：未解鎖則導回列表
    enforceAccess();
    wireTopTabs();
    setupSplit();
    await loadCourse();
    await setupEditor();
    setupTerminal();
    // non-blocking health check (idle)
    scheduleHealthCheck();
  }

  function enforceAccess(){
    const id = parseInt(TOPIC_ID, 10);
    if(!isFinite(id)) return;
    // 第一題不需前置通關
    // 其餘題目需上一題通過
    const firstId = 520001;
    if(id <= firstId) return;
    const prev = (id - 1).toString();
    const ok = !!localStorage.getItem(`pass-${prev}`);
    if(!ok){ location.href='/cal/topiclist/'; }
  }

  function wireTopTabs(){
    const tabs = $('#topTabs');
    tabs.addEventListener('click', (e)=>{
      const t = e.target; if(!(t instanceof HTMLElement)) return;
      if(!t.classList.contains('capsule')) return;
      const action = t.getAttribute('data-action');
      if(action === 'logout'){
        try{ localStorage.removeItem('cal_token'); }catch{}
        location.href = '/users/login/?next=/cal/topiclist/';
        return;
      }
      if(action === 'leaderboard'){
        location.href = '/cal/leaderboard/';
        return;
      }
      tabs.querySelectorAll('.capsule').forEach(b=>b.classList.remove('active'));
      t.classList.add('active');
    });
  }

  function setupSplit(){
    const left = $('#leftPane'); const hv = $('#handleV'); const eh = $('#handleH');
    left.style.width = app.leftWidth + '%';
    $('#editorPane').style.height = app.editorHeight + '%';
    $('#termPane').style.height = (100 - app.editorHeight) + '%';
    drag(hv, 'col', (dx)=>{
      const total = window.innerWidth; let w = (left.getBoundingClientRect().width + dx) / total * 100;
      w = Math.max(20, Math.min(60, w)); left.style.width = w + '%';
    }, ()=>{ app.leftWidth = parseFloat(left.style.width); localStorage.setItem(`leftWidth-${TOPIC_ID}`, app.leftWidth); });
    drag(eh, 'row', (dy)=>{
      const rp = $('#rightPane').getBoundingClientRect();
      let h = ($('#editorPane').getBoundingClientRect().height + dy) / rp.height * 100;
      h = Math.max(30, Math.min(80, h));
      $('#editorPane').style.height = h + '%';
      $('#termPane').style.height = (100 - h) + '%';
    }, ()=>{ const h = parseFloat($('#editorPane').style.height); app.editorHeight = h; localStorage.setItem(`editorHeight-${TOPIC_ID}`, h); });
  }

  function drag(handle, mode, onMove, onUp){
    let dragging=false, sx=0, sy=0;
    handle.addEventListener('mousedown', (e)=>{ dragging=true; sx=e.clientX; sy=e.clientY; document.body.style.cursor= mode==='col'?'col-resize':'row-resize'; e.preventDefault(); });
    window.addEventListener('mousemove', (e)=>{ if(!dragging) return; const dx=e.clientX-sx, dy=e.clientY-sy; sx=e.clientX; sy=e.clientY; onMove(mode==='col'?dx:dy); });
    window.addEventListener('mouseup', ()=>{ if(!dragging) return; dragging=false; document.body.style.cursor=''; onUp&&onUp(); });
  }

  async function loadCourse(){
    async function fetchWithFallback(rel){
      try{
        const r = await fetch(rel);
        if(!r.ok) throw new Error('Not OK');
        const ct = (r.headers.get('content-type')||'').toLowerCase();
        return ct.includes('application/json') ? r.json() : r.text();
      }catch{
        // fallback to absolute path under /cal/topic/<ID>/
        try{
          const abs = `/cal/topic/${TOPIC_ID}/${rel}`;
          const r2 = await fetch(abs);
          if(!r2.ok) throw new Error('Not OK');
          const ct2 = (r2.headers.get('content-type')||'').toLowerCase();
          return ct2.includes('application/json') ? r2.json() : r2.text();
        }catch{
          return null;
        }
      }
    }

    // 並行抓取 markdown 與 config
    const [mdText, cfg] = await Promise.all([
      fetchWithFallback('instructions.md'),
      fetchWithFallback('config.json')
    ]);

    const md = typeof mdText === 'string' && mdText ? mdText : '## 無法載入說明';
    $('#md').innerHTML = renderMarkdown(md);

    app.cfg = cfg || {};
    (app.cfg.readonlyLines||[]).forEach(n=> app.readOnlyLines.add(Number(n)));
    // 若題目需要輸入，將輸入欄轉為 textarea 並預填 sampleInput
    if(app.cfg.requiresInput){
      const bar = document.querySelector('.stdin-bar');
      const old = $('#stdinInput');
      if(bar && old){
        const ta = document.createElement('textarea');
        ta.id = 'stdinInput';
        ta.placeholder = '請在此輸入測資（可多行）';
        ta.value = app.cfg.sampleInput || '';
        bar.replaceChild(ta, old);
      }
    }
  }

  async function setupEditor(){
    const host = $('#editor');
    const defaultCode = (app.cfg && typeof app.cfg.defaultCode === 'string')
      ? app.cfg.defaultCode
      : '# 在下方輸入：x = 5\nprint(x)\n';
    const saved = localStorage.getItem(`code-${TOPIC_ID}`);
    const initial = saved ?? defaultCode;
    const runBtn = $('#runBtn');
    const judgeBtn = $('#judgeBtn');

    setBusy = (mode)=>{
      const makeLabel = (btn, label)=>{
        if(!btn) return;
        if(btn.dataset.oriText==null){ btn.dataset.oriText = btn.textContent||''; }
        btn.textContent = label;
      };
      if(mode){
        app.busy = true;
        runBtn && (runBtn.disabled=true);
        judgeBtn && (judgeBtn.disabled=true);
        if(mode==='run') makeLabel(runBtn,'Running...');
        if(mode==='judge') makeLabel(judgeBtn,'Judging...');
      } else {
        app.busy = false;
        runBtn && (runBtn.disabled=false);
        judgeBtn && (judgeBtn.disabled=false);
        if(runBtn && runBtn.dataset.oriText!=null) runBtn.textContent = runBtn.dataset.oriText;
        if(judgeBtn && judgeBtn.dataset.oriText!=null) judgeBtn.textContent = judgeBtn.dataset.oriText;
      }
    };

    if(window.ace && typeof ace.edit==='function'){
      const editor = ace.edit('editor');
      editor.setTheme('ace/theme/tomorrow_night');
      editor.session.setMode('ace/mode/python');
      editor.session.setValue(initial);
      editor.setShowPrintMargin(false);
      editor.session.setUseWrapMode(false);
      const Range = ace.require('ace/range').Range;
      function applyReadonly(){
        (editor.__readonlyMarkers||[]).forEach(id=>editor.session.removeMarker(id));
        editor.__readonlyMarkers=[];
        app.readOnlyLines.forEach(n=>{
          const id = editor.session.addMarker(new Range(n-1,0,n-1,1), 'ace_readonly_bg', 'fullLine');
          editor.__readonlyMarkers.push(id);
        });
      }
      applyReadonly();
      const saveNow = ()=> localStorage.setItem(`code-${TOPIC_ID}`, editor.session.getValue());
      const saveDebounced = debounce(saveNow, 150);
      editor.session.on('change', (delta)=>{
        if(!delta||!delta.start||!delta.end) return;
        const s=delta.start.row+1, e=delta.end.row+1;
        for(let n=s;n<=e;n++) if(app.readOnlyLines.has(n)){ editor.session.getUndoManager().undo(true); flash(host); return; }
        saveDebounced();
      });
      readCode = ()=> editor.session.getValue();
      writeCode = (v)=> editor.session.setValue(v);
      let t=1, ml=editor.session.getLength(); while(app.readOnlyLines.has(t)&&t<=ml) t++; editor.gotoLine(t,0,true);
      on($('#resetBtn'), 'click', ()=>{ localStorage.removeItem(`code-${TOPIC_ID}`); editor.session.setValue(defaultCode); localStorage.setItem(`code-${TOPIC_ID}`, defaultCode); });

      // 鍵盤快捷鍵
      try{
        editor.commands.addCommand({
          name: 'run-code', bindKey: {win: 'Ctrl-Enter', mac: 'Command-Enter'}, exec: ()=>{ if(!app.busy) callRun(); }
        });
        editor.commands.addCommand({
          name: 'judge-code', bindKey: {win: 'Ctrl-Shift-Enter', mac: 'Command-Shift-Enter'}, exec: ()=>{ if(!app.busy) callJudge(); }
        });
      }catch{}
    } else {
      // fallback
      host.innerHTML=''; const ta = document.createElement('textarea'); ta.className='code-ta'; ta.value=initial; host.appendChild(ta);
      readCode = ()=> ta.value; writeCode = (v)=> ta.value=v;
      const saveDebounced = debounce(()=> localStorage.setItem(`code-${TOPIC_ID}`, ta.value), 150);
      on(ta, 'input', saveDebounced);
      on($('#resetBtn'), 'click', ()=>{ localStorage.removeItem(`code-${TOPIC_ID}`); ta.value=defaultCode; localStorage.setItem(`code-${TOPIC_ID}`, defaultCode); });
      writeTerm('Ace 無法載入，使用簡易編輯器。', 'info');

      // 嘗試延後啟用 Ace（若之後載入完成）
      setTimeout(()=>{
        try{
          if(window.ace && typeof ace.edit==='function'){
            // 重新初始化編輯器（保留當前內容）
            const cur = ta.value;
            host.innerHTML = '<div id="editor" style="width:100%;height:100%"></div>';
            const editor = ace.edit('editor');
            editor.setTheme('ace/theme/tomorrow_night');
            editor.session.setMode('ace/mode/python');
            editor.session.setValue(cur);
            editor.setShowPrintMargin(false);
            editor.session.setUseWrapMode(false);
            const Range = ace.require('ace/range').Range;
            function applyReadonly(){
              (editor.__readonlyMarkers||[]).forEach(id=>editor.session.removeMarker(id));
              editor.__readonlyMarkers=[];
              app.readOnlyLines.forEach(n=>{
                const id = editor.session.addMarker(new Range(n-1,0,n-1,1), 'ace_readonly_bg', 'fullLine');
                editor.__readonlyMarkers.push(id);
              });
            }
            applyReadonly();
            const saveNow = ()=> localStorage.setItem(`code-${TOPIC_ID}`, editor.session.getValue());
            const saveDebounced2 = debounce(saveNow, 150);
            editor.session.on('change', (delta)=>{
              if(!delta||!delta.start||!delta.end) return;
              const s=delta.start.row+1, e=delta.end.row+1;
              for(let n=s;n<=e;n++) if(app.readOnlyLines.has(n)){ editor.session.getUndoManager().undo(true); flash(host); return; }
              saveDebounced2();
            });
            readCode = ()=> editor.session.getValue();
            writeCode = (v)=> editor.session.setValue(v);
            try{
              editor.commands.addCommand({ name:'run-code', bindKey:{win:'Ctrl-Enter', mac:'Command-Enter'}, exec: ()=>{ if(!app.busy) callRun(); } });
              editor.commands.addCommand({ name:'judge-code', bindKey:{win:'Ctrl-Shift-Enter', mac:'Command-Shift-Enter'}, exec: ()=>{ if(!app.busy) callJudge(); } });
            }catch{}
          }
        }catch{}
      }, 500);
      // 全域快捷鍵（textarea 也可用）
      on(window, 'keydown', (e)=>{
        const isRun = (e.ctrlKey||e.metaKey) && e.key==='Enter' && !e.shiftKey;
        const isJudge = (e.ctrlKey||e.metaKey) && e.key==='Enter' && e.shiftKey;
        if(isRun){ e.preventDefault(); if(!app.busy) callRun(); }
        else if(isJudge){ e.preventDefault(); if(!app.busy) callJudge(); }
      });
    }

    // 綁定 Run / Judge
    on(runBtn, 'click', callRun);
    on(judgeBtn, 'click', callJudge);
  }

  function renderMarkdown(src){
    const esc=(s)=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    let html=''; const lines=src.split(/\r?\n/); let inCode=false,buf=[];
    for(const line of lines){
      if(line.trim().startsWith('```')){ inCode=!inCode; if(!inCode){ html+=`<pre><code>${esc(buf.join('\n'))}</code></pre>`; buf=[]; } continue; }
      if(inCode){ buf.push(line); continue; }
      const h=line.match(/^(#{1,3})\s+(.*)$/); if(h){ html += `<h${h[1].length}>${h[2]}</h${h[1].length}>`; continue; }
      const li=line.match(/^\s*[-*]\s+(.*)$/); if(li){ html+=`<li>${li[1]}</li>`; continue; }
      if(line.trim()===''){ html+='<p></p>'; continue; }
      html+=`<p>${line.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`(.+?)`/g,'<code>$1</code>')}</p>`;
    }
    if(/<li>/.test(html)) html = html.replace(/((?:<li>.*?<\/li>\s*)+)/gs, '<ul>$1</ul>');
    return html;
  }

  function setupTerminal(){ clearTerm(); }
  function getStdinValue(){
    if(!app.cfg || !app.cfg.requiresInput) return '';
    const el = $('#stdinInput');
    if(!el) return app.cfg.sampleInput || '';
    let v = (el.value || '').trim();
    if(!v){ return app.cfg.sampleInput || ''; }
    return v;
  }
  function writeTerm(text,type){ const box=$('#terminal'); const tpl=$('#tmpl-terminal-line'); const div=tpl.content.firstElementChild.cloneNode(true); div.textContent=text; if(type==='info') div.classList.add('tinfo'); box.appendChild(div); box.scrollTop=box.scrollHeight; }
  function clearTerm(){ $('#terminal').innerHTML=''; }
  function flash(el){ el.classList.add('editor-flash'); setTimeout(()=>el.classList.remove('editor-flash'), 250); }

  async function callRun(){
    if(app.busy) return; setBusy('run');
    clearTerm(); writeTerm('Running...', 'info');
    try{
      const stdin = getStdinValue();
      const resp = await fetch(`${API_BASE}/api/run`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({language:'python', code: readCode(), stdin})});
      const data = await resp.json();
      if(!resp.ok){ writeTerm('Error: '+(data.detail||resp.statusText)); return; }
      if(data.stdout) writeTerm('Your output:\n'+data.stdout.trimEnd());
      if(data.stderr) writeTerm('stderr:\n'+data.stderr.trimEnd());
      writeTerm(`exit=${data.exit_code} time=${data.time_ms}ms`, 'info');
    }catch(err){ writeTerm(String(err)); }
    finally{ setBusy(null); }
  }

  async function callJudge(){
    if(app.busy) return; setBusy('judge');
    clearTerm(); writeTerm(`Judging ${TOPIC_ID}...`, 'info');
    const code = readCode();
    try{
      // 若題目需要輸入，直接以 judge 驗證，並從回傳顯示 actual/expected
      if(app.cfg && app.cfg.requiresInput){
        const judgeResp = await fetch(`${API_BASE}/api/judge/${TOPIC_ID}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({language:'python', code})});
        const judgeData = await judgeResp.json();
        if(!judgeResp.ok){ writeTerm('Error: '+(judgeData.detail||judgeResp.statusText)); return; }
        const c = (judgeData.cases||[])[0] || {};
        const actual = ((c.actual||'')+ '').trimEnd();
        const expected = ((c.expected||'')+ '').trimEnd();
        writeTerm('Your output:\n'+actual);
        writeTerm('Expected:\n'+expected);
        const ok = actual===expected;
        if(ok){ localStorage.setItem(`pass-${TOPIC_ID}`,'1'); showCongrats(); } else { writeTerm('Not yet, try again!'); }
        return;
      }

      // 預設流程：並行執行 run 與 judge 以降低等待時間
      const [runResp, judgeResp] = await Promise.all([
        fetch(`${API_BASE}/api/run`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({language:'python', code, stdin:''})}),
        fetch(`${API_BASE}/api/judge/${TOPIC_ID}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({language:'python', code})})
      ]);
      const [runData, judgeData] = await Promise.all([runResp.json(), judgeResp.json()]);
      if(!runResp.ok){ writeTerm('Error: '+(runData.detail||runResp.statusText)); return; }
      if(!judgeResp.ok){ writeTerm('Error: '+(judgeData.detail||judgeResp.statusText)); return; }
      const actual = (runData.stdout||'').trimEnd();
      const expected = ((judgeData.cases||[])[0]?.expected||'').trimEnd();
      writeTerm('Your output:\n'+actual);
      writeTerm('Expected:\n'+expected);
      const ok = actual===expected;
      if(ok){
        localStorage.setItem(`pass-${TOPIC_ID}`,'1');
        showCongrats();
      } else {
        writeTerm('Not yet, try again!');
      }
    }catch(err){ writeTerm(String(err)); }
    finally{ setBusy(null); }
  }

  function showCongrats(){
    let modal = document.getElementById('congrats');
    if(!modal){
      modal = document.createElement('div'); modal.id='congrats'; modal.className='modal show';
      modal.innerHTML = `
        <div class="modal-card">
          <h3>Well done!</h3>
          <p id="congratsMsg">你已完成本題，將解鎖下一題。</p>
          <div class="actions">
            <button id="backList">返回題目列表</button>
            <button id="goNext">下一題</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e)=>{ if(e.target===modal) closeToList(); });
      $('#backList', modal).addEventListener('click', closeToList);
      $('#goNext', modal).addEventListener('click', gotoNext);
      // 根據是否有下一題決定按鈕呈現
      const id = parseInt(TOPIC_ID, 10);
      const nextId = isFinite(id) ? (id+1).toString() : null;
      if(nextId){
        fetch(`/cal/topic/${nextId}/index.html`, {method:'HEAD'})
          .then(r=>{
            if(!r.ok){ formatAsLast(modal); }
          })
          .catch(()=>{ formatAsLast(modal); });
      } else {
        formatAsLast(modal);
      }
      function formatAsLast(m){
        const actions = m.querySelector('.actions');
        const nextBtn = m.querySelector('#goNext');
        const msg = m.querySelector('#congratsMsg');
        if(nextBtn) nextBtn.style.display='none';
        if(actions) actions.classList.add('single-right');
        if(msg) msg.textContent = '你已完成本週作業';
      }
    }
    function closeToList(){ modal.classList.remove('show'); location.href='/cal/topiclist/'; }
    function gotoNext(){
      modal.classList.remove('show');
      const id = parseInt(TOPIC_ID, 10);
      if(!isFinite(id)){ location.href='/cal/topiclist/'; return; }
      const next = (id + 1).toString();
      // 簡易存在性檢查：嘗試抓取下一題的 index.html
      fetch(`/cal/topic/${next}/index.html`, {method:'HEAD'})
        .then(r=>{ if(r.ok) location.href = `/cal/topic/${next}/`; else location.href='/cal/topiclist/'; })
        .catch(()=> location.href='/cal/topiclist/');
    }
  }

  function scheduleHealthCheck(){
    const cb = async ()=>{
      try{
        const r = await fetch(`${API_BASE}/api/health`, {mode:'cors'});
        if(r.ok){ writeTerm(`Backend OK: ${API_BASE}`, 'info'); }
      }catch{}
    };
    if('requestIdleCallback' in window){
      requestIdleCallback(cb, {timeout: 2000});
    } else {
      setTimeout(cb, 350);
    }
  }
})();
