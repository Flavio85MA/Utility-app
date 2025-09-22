// script.js — PDF · Immagini · Video (ffmpeg.wasm)
// Richiede nel <head> di index.html:
// <script src="https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js"></script>

document.addEventListener('DOMContentLoaded', () => {
  // =======================
  // NAV A TAB (bulletproof)
  // =======================
  const ids = ['pdf','images','video'];

  function setActiveTab(which){
    ids.forEach(name => {
      const btn = document.getElementById(`btn-${name}`);
      const sec = document.getElementById(`section-${name}`);
      if (btn) btn.classList.toggle('active', name === which);
      if (sec) sec.classList.toggle('active', name === which);
    });
    // sincronizza hash (utile per GitHub Pages)
    if (ids.includes(which)) {
      history.replaceState(null, '', `#${which}`);
    }
  }

  // inizializza (da hash se presente, altrimenti pdf)
  const fromHash = (location.hash || '').replace('#','');
  setActiveTab(ids.includes(fromHash) ? fromHash : 'pdf');

  // listener diretti
  document.getElementById('btn-pdf')?.addEventListener('click', () => setActiveTab('pdf'));
  document.getElementById('btn-images')?.addEventListener('click', () => setActiveTab('images'));
  document.getElementById('btn-video')?.addEventListener('click', () => setActiveTab('video'));

  // accessibilità tastiera
  ['btn-pdf','btn-images','btn-video'].forEach(id=>{
    const el = document.getElementById(id);
    el?.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  });

  // =======================
  // MODALE IMPOSTAZIONI
  // =======================
  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('open-settings')?.addEventListener('click', () => settingsModal?.showModal());
  document.getElementById('save-settings')?.addEventListener('click', () => {});
  document.getElementById('close-settings')?.addEventListener('click', () => settingsModal?.close());
  document.getElementById('clear-settings')?.addEventListener('click', () => localStorage.clear());

  // =======================
  // LIBS & HELPERS GENERALI
  // =======================
  const { jsPDF } = window.jspdf || {};
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const readAsArrayBuffer = (file) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file);
  });
  const readAsDataURL = (file) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
  const saveBlob = (blob, name) => saveAs(blob, name);
  const downloadDataUrl = (filename, dataUrl) => {
    const a = document.createElement('a'); a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  };
  function loadImage(src){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=rej; img.src=src; }); }
  function dataURLtoBlob(dataurl){
    const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n);
    while(n--){u8arr[n] = bstr.charCodeAt(n);} return new Blob([u8arr], {type:mime});
  }
  function suggestName(original, newExt){
    const base = (original||'file').replace(/\.[^.]+$/,''); return `${base}.${newExt}`;
  }
  function mimeExt(mime){
    if(mime==='image/jpeg')return 'jpg';
    if(mime==='image/png') return 'png';
    if(mime==='image/webp')return 'webp';
    return 'bin';
  }
  function canvasPos(evt, canvas){
    const r = canvas.getBoundingClientRect();
    return { x: Math.round(evt.clientX - r.left), y: Math.round(evt.clientY - r.top) };
  }
  function dedupFiles(arr){ const map = new Map(); for(const f of arr){ map.set(`${f.name}_${f.size}`, f); } return [...map.values()]; }

  // =======================
  // SEZIONE PDF
  // =======================
  async function renderPdfSelectable(file, previewEl, state){
    previewEl.innerHTML = ""; state.selected = new Set(); state.canvases = [];
    const bytes = new Uint8Array(await readAsArrayBuffer(file));
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    state.pdf = pdf; state.count = pdf.numPages;
    for(let p=1; p<=state.count; p++){
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 0.8 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;

      const wrap = document.createElement('div'); wrap.className = 'thumb';
      const tag = document.createElement('div'); tag.className='tag'; tag.textContent = `#${p}`;
      const img = document.createElement('img'); img.src = canvas.toDataURL('image/png'); img.alt = `Page ${p}`;
      wrap.appendChild(img); wrap.appendChild(tag);
      wrap.addEventListener('click', () => {
        if(state.selected.has(p-1)){ state.selected.delete(p-1); wrap.classList.remove('selected'); }
        else { state.selected.add(p-1); wrap.classList.add('selected'); }
      });
      previewEl.appendChild(wrap); state.canvases.push(canvas);
    }
  }

  // Split PDF
  (function(){
    const splitFile = document.getElementById('split-file'); if(!splitFile || !pdfjsLib) return;
    const splitPreview = document.getElementById('split-preview');
    const splitSelectAll = document.getElementById('split-select-all');
    const splitClearSel = document.getElementById('split-clear-sel');
    const splitRun = document.getElementById('split-run');
    const splitStatus = document.getElementById('split-status');
    const splitState = { pdf:null, count:0, selected:new Set(), canvases:[] };

    splitFile.addEventListener('change', async () => {
      const f = splitFile.files?.[0]; if(!f){splitPreview.innerHTML=""; splitStatus.textContent=""; return;}
      splitStatus.textContent="Carico anteprime...";
      try { await renderPdfSelectable(f, splitPreview, splitState); splitStatus.textContent="Anteprime pronte. Seleziona pagine e crea il PDF."; }
      catch(e){ console.error(e); splitStatus.textContent="Errore nel rendering del PDF."; }
    });
    splitSelectAll?.addEventListener('click', () => {
      if(splitState.count===0) return;
      splitState.selected = new Set(Array.from({length:splitState.count},(_,i)=>i));
      Array.from(splitPreview.children).forEach(ch => ch.classList.add('selected'));
    });
    splitClearSel?.addEventListener('click', () => {
      splitState.selected.clear();
      Array.from(splitPreview.children).forEach(ch => ch.classList.remove('selected'));
    });
    splitRun?.addEventListener('click', async () => {
      try{
        const f = splitFile.files?.[0]; if(!f){splitStatus.textContent="Seleziona un PDF."; return;}
        if(!splitState.selected.size){splitStatus.textContent="Seleziona almeno una pagina."; return;}
        splitStatus.textContent="Creo PDF con pagine selezionate...";
        const PDFLib = window.PDFLib;
        const srcBytes = new Uint8Array(await readAsArrayBuffer(f));
        const srcDoc = await PDFLib.PDFDocument.load(srcBytes);
        const outDoc = await PDFLib.PDFDocument.create();
        const indices = Array.from(splitState.selected).sort((a,b)=>a-b);
        const copied = await outDoc.copyPages(srcDoc, indices);
        copied.forEach(p=>outDoc.addPage(p));
        const out = await outDoc.save();
        saveBlob(new Blob([out],{type:"application/pdf"}), 'extracted_pages.pdf');
        splitStatus.textContent="Fatto! Scaricato extracted_pages.pdf";
      }catch(e){ console.error(e); splitStatus.textContent="Errore nella creazione del PDF estratto."; }
    });
  })();

  // Delete pages
  (function(){
    const deleteFile = document.getElementById('delete-file'); if(!deleteFile || !pdfjsLib) return;
    const deletePreview = document.getElementById('delete-preview');
    const deleteSelectAll = document.getElementById('delete-select-all');
    const deleteClearSel = document.getElementById('delete-clear-sel');
    const deleteRun = document.getElementById('delete-run');
    const deleteStatus = document.getElementById('delete-status');
    const deleteState = { pdf:null, count:0, selected:new Set(), canvases:[] };

    deleteFile.addEventListener('change', async () => {
      const f = deleteFile.files?.[0]; if(!f){deletePreview.innerHTML=""; deleteStatus.textContent=""; return;}
      deleteStatus.textContent="Carico anteprime...";
      try { await renderPdfSelectable(f, deletePreview, deleteState); deleteStatus.textContent="Anteprime pronte. Seleziona pagine da rimuovere."; }
      catch(e){ console.error(e); deleteStatus.textContent="Errore nel rendering del PDF."; }
    });
    deleteSelectAll?.addEventListener('click', () => {
      if(deleteState.count===0) return;
      deleteState.selected = new Set(Array.from({length:deleteState.count},(_,i)=>i));
      Array.from(deletePreview.children).forEach(ch => ch.classList.add('selected'));
    });
    deleteClearSel?.addEventListener('click', () => {
      deleteState.selected.clear();
      Array.from(deletePreview.children).forEach(ch => ch.classList.remove('selected'));
    });
    deleteRun?.addEventListener('click', async () => {
      try{
        const f = deleteFile.files?.[0]; if(!f){deleteStatus.textContent="Seleziona un PDF."; return;}
        const PDFLib = window.PDFLib;
        const bytes = new Uint8Array(await readAsArrayBuffer(f));
        const doc = await PDFLib.PDFDocument.load(bytes);
        const total = doc.getPageCount();
        const keep = [];
        for(let i=0;i<total;i++){ if(!deleteState.selected.has(i)) keep.push(i); }
        if(keep.length===total){ deleteStatus.textContent="Non hai selezionato pagine da rimuovere."; return; }
        if(keep.length===0){ deleteStatus.textContent="Selezionate tutte le pagine: non posso creare un PDF vuoto."; return; }
        deleteStatus.textContent="Creo PDF senza pagine selezionate...";
        const newDoc = await PDFLib.PDFDocument.create();
        const copied = await newDoc.copyPages(doc, keep); copied.forEach(p=>newDoc.addPage(p));
        const out = await newDoc.save();
        saveBlob(new Blob([out],{type:"application/pdf"}), 'deleted-pages.pdf');
        deleteStatus.textContent="Fatto! Scaricato deleted-pages.pdf";
      }catch(e){ console.error(e); deleteStatus.textContent="Errore nell'eliminazione pagine."; }
    });
  })();

  // PDF -> Images
  (function(){
    const pdfInput = document.getElementById('pdf-input'); if(!pdfInput || !pdfjsLib) return;
    const pdf2imgBtn = document.getElementById('pdf2img-run');
    const pdf2imgFormat = document.getElementById('pdf2img-format');
    const pdfStatus = document.getElementById('pdf2img-status');
    const pdfPreview = document.getElementById('pdf2img-preview');
    const pdfDownloadAllBtn = document.getElementById('pdf2img-download-all');
    const pdfClearBtn = document.getElementById('pdf2img-clear');
    let generatedImages = [];

    pdf2imgBtn?.addEventListener('click', async () => {
      const file = pdfInput.files?.[0];
      if (!file) { pdfStatus.textContent = "Seleziona un PDF."; return; }
      pdfStatus.textContent = "Carico PDF...";
      try {
        generatedImages = [];
        pdfPreview.innerHTML = "";
        pdfDownloadAllBtn.disabled = true;

        const ab = await (new Response(file)).arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;

        const scaleVal = 2;
        pdfStatus.textContent = `Pagine: ${pdf.numPages}. Rendering...`;
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: scaleVal });

          const maxCanvasPixels = 4096 * 4096;
          let width = viewport.width, height = viewport.height;
          if (width * height > maxCanvasPixels) {
            const ratio = Math.sqrt(maxCanvasPixels / (width * height));
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');

          const renderViewport = page.getViewport({ scale: (width / viewport.width) * scaleVal });
          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

          const type = (pdf2imgFormat.value === 'jpeg') ? 'image/jpeg' : 'image/png';
          const dataUrl = canvas.toDataURL(type, pdf2imgFormat.value === 'jpeg' ? 0.92 : undefined);
          const name = `page_${String(p).padStart(3, '0')}.${pdf2imgFormat.value}`;
          generatedImages.push({ name, dataUrl });

          const wrap = document.createElement('div');
          wrap.className = 'thumb';
          const tag = document.createElement('div'); tag.className='tag'; tag.textContent = `#${p}`;
          const img = document.createElement('img'); img.src = dataUrl; img.alt = name;
          const a = document.createElement('a'); a.href = dataUrl; a.download = name; a.textContent = `Scarica ${name}`;
          a.style.display = 'block'; a.style.marginTop = '6px';
          wrap.appendChild(img); wrap.appendChild(tag); wrap.appendChild(a);
          pdfPreview.appendChild(wrap);

          pdfStatus.textContent = `Render pagina ${p}/${pdf.numPages}`;
          canvas.width = 0; canvas.height = 0;
        }

        pdfStatus.textContent = `Fatto. ${generatedImages.length} immagini.`;
        pdfDownloadAllBtn.disabled = generatedImages.length === 0;
      } catch (err) {
        console.error(err);
        pdfStatus.textContent = "Errore nel rendering. Prova con un altro PDF.";
      }
    });
    pdfDownloadAllBtn?.addEventListener('click', () => {
      generatedImages.forEach(({name, dataUrl}) => downloadDataUrl(name, dataUrl));
    });
    pdfClearBtn?.addEventListener('click', () => {
      generatedImages = []; pdfPreview.innerHTML = ""; pdfDownloadAllBtn.disabled = true;
      pdfStatus.textContent = ""; pdfInput.value = "";
    });
  })();

  // Immagini -> PDF
  (function(){
    const img2pdfInput = document.getElementById('img2pdf-input'); if(!img2pdfInput || !jsPDF) return;
    const img2pdfBtn = document.getElementById('img2pdf-run');
    const pdfOrientation = document.getElementById('pdf-orientation');
    const fitPage = document.getElementById('fit-page');
    const img2pdfStatus = document.getElementById('img2pdf-status');

    img2pdfBtn?.addEventListener('click', async () => {
      const files = Array.from(img2pdfInput.files || []);
      if(!files.length){img2pdfStatus.textContent="Seleziona 1 o più immagini."; return;}
      img2pdfStatus.textContent="Creo il PDF...";
      let doc=null;
      try{
        for(const file of files){
          const dataUrl = await readAsDataURL(file);
          const img = await loadImage(dataUrl);
          const w=img.naturalWidth, h=img.naturalHeight;
          const orient = (pdfOrientation.value==='auto') ? (w>=h?'l':'p') : pdfOrientation.value;

          if(!doc){
            doc = fitPage.checked ? new jsPDF({orientation:orient,unit:'px',format:[w,h]})
                                  : new jsPDF({orientation:orient,unit:'px',format:'a4'});
          } else {
            fitPage.checked ? doc.addPage([w,h], orient) : doc.addPage('a4', orient);
          }

          const ps = doc.internal.pageSize; let pw=ps.getWidth(), ph=ps.getHeight(), dw, dh;
          if(fitPage.checked){const sc=Math.min(pw/w, ph/h); dw=w*sc; dh=h*sc;}
          else{dw=pw; dh=(h/w)*pw; if(dh>ph){const sc=ph/dh; dw*=sc; dh*=sc;}}
          doc.addImage(dataUrl, (file.type==='image/png'?'PNG':'JPEG'), (pw-dw)/2, (ph-dh)/2, dw, dh);
        }
        const out = doc.output('blob'); saveBlob(out,'images.pdf'); img2pdfStatus.textContent="Fatto! Scaricato images.pdf";
      }catch(e){console.error(e); img2pdfStatus.textContent="Errore nella creazione del PDF.";}
    });
  })();

  // Conversioni PDF/Office (lite)
  (function(){
    const pdfAdvFile = document.getElementById('pdf-adv-file'); if(!pdfAdvFile || !pdfjsLib) return;
    const pdf2word = document.getElementById('pdf2word-run');
    const pdf2excelBtn = document.getElementById('pdf2excel-run');
    const pdf2csvBtn = document.getElementById('pdf2csv-run');
    const wordFile = document.getElementById('word-file');
    const word2pdf = document.getElementById('word2pdf-run');
    const excelFile = document.getElementById('excel-file');
    const excel2pdf = document.getElementById('excel2pdf-run');
    const advStatus = document.getElementById('advconv-status');

    const pdf2wordDl  = document.getElementById('pdf2word-dl');
    const pdf2excelDl = document.getElementById('pdf2excel-dl');
    const pdf2csvDl   = document.getElementById('pdf2csv-dl');
    const word2pdfDl  = document.getElementById('word2pdf-dl');
    const excel2pdfDl = document.getElementById('excel2pdf-dl');

    let lastDocxBlob=null, lastXlsxBlob=null, lastCsvBlob=null, lastWordPdfBlob=null, lastExcelPdfBlob=null;

    pdf2word?.addEventListener('click', async () => {
      try {
        const f = pdfAdvFile.files?.[0];
        if (!f) { advStatus.textContent = "Seleziona un PDF."; return; }
        advStatus.textContent = "Estraggo testo dal PDF...";

        const ab = await (new Response(f)).arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;

        let paragraphs = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const txt = await page.getTextContent();
          const line = txt.items.map(i => i.str).join(" ");
          paragraphs.push(`--- Pagina ${p} ---\n` + line);
          advStatus.textContent = `Elaboro pagina ${p}/${pdf.numPages}...`;
        }

        const { Document, Packer, Paragraph } = window.docx;
        const doc = new Document({ sections: [{ properties: {}, children: paragraphs.map(t => new Paragraph(t)) }] });
        lastDocxBlob = await Packer.toBlob(doc);
        saveBlob(lastDocxBlob, "converted.docx");
        pdf2wordDl.disabled = false;
        advStatus.textContent = "Fatto! Scaricato converted.docx (lite).";
      } catch (e) { console.error(e); advStatus.textContent = "Errore PDF→DOCX."; }
    });
    pdf2wordDl?.addEventListener('click', ()=> lastDocxBlob ? saveBlob(lastDocxBlob, "converted.docx") : advStatus.textContent="Nessun DOCX in memoria.");

    word2pdf?.addEventListener('click', async () => {
      try {
        const f = wordFile.files?.[0]; if(!f){advStatus.textContent="Seleziona un file DOCX."; return;}
        advStatus.textContent="Converto DOCX in PDF...";
        const arrayBuffer = await f.arrayBuffer();
        const result = await window.mammoth.convertToHtml({ arrayBuffer });
        const html = result.value;

        const container = document.createElement('div');
        container.style.position='fixed'; container.style.left='-9999px'; container.style.top='0'; container.style.width='794px';
        container.innerHTML = html; document.body.appendChild(container);

        const doc = new jsPDF({ unit:'pt', format:'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const canvas = await html2canvas(container, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const imgW = pageWidth; const ratio = canvas.height / canvas.width; const imgH = imgW * ratio;

        if (imgH <= pageHeight) doc.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
        else{
          let y=0, sliceHeight=Math.floor((pageHeight/imgH)*canvas.height), idx=0;
          while(y<canvas.height){
            const slice=document.createElement('canvas'); slice.width=canvas.width; slice.height=Math.min(sliceHeight, canvas.height-y);
            slice.getContext('2d').drawImage(canvas,0,y,canvas.width,slice.height,0,0,slice.width,slice.height);
            const sliceData=slice.toDataURL('image/png');
            if(idx>0) doc.addPage();
            const sliceRatio = slice.height / slice.width;
            doc.addImage(sliceData,'PNG',0,0,pageWidth, pageWidth*sliceRatio);
            y+=sliceHeight; idx++;
          }
        }
        document.body.removeChild(container);
        lastWordPdfBlob = doc.output('blob'); saveBlob(lastWordPdfBlob, 'converted.pdf'); word2pdfDl.disabled=false;
        advStatus.textContent="Fatto! Scaricato converted.pdf";
      } catch(e){ console.error(e); advStatus.textContent="Errore DOCX→PDF."; }
    });
    word2pdfDl?.addEventListener('click', ()=> lastWordPdfBlob ? saveBlob(lastWordPdfBlob,'converted.pdf') : advStatus.textContent="Nessun PDF in memoria.");

    excel2pdf?.addEventListener('click', async () => {
      try{
        const f = excelFile.files?.[0]; if(!f){advStatus.textContent="Seleziona un file Excel (.xlsx)."; return;}
        advStatus.textContent="Leggo Excel...";
        const ab = await readAsArrayBuffer(f);
        const wb = XLSX.read(ab, {type:'array'});
        const sheetName = wb.SheetNames[0]; const ws = wb.Sheets[sheetName];
        if(!ws){advStatus.textContent="Nessun foglio trovato nel file."; return;}
        const html = XLSX.utils.sheet_to_html(ws, { header:"", footer:"" });

        const container = document.createElement('div');
        container.style.position='fixed'; container.style.left='-9999px'; container.style.top='0'; container.style.width='794px';
        container.innerHTML = html; const table = container.querySelector('table');
        if(table){ table.style.borderCollapse='collapse';
          table.querySelectorAll('td,th').forEach(el=>{el.style.border='1px solid #999'; el.style.padding='4px 6px'; el.style.fontSize='12px';}); }
        document.body.appendChild(container);

        const doc = new jsPDF({ unit:'pt', format:'a4' });
        const pageWidth = doc.internal.pageSize.getWidth(); const pageHeight = doc.internal.pageSize.getHeight();
        const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor:'#ffffff' });
        const imgData = canvas.toDataURL('image/png'); const imgW = pageWidth; const ratio = canvas.height / canvas.width; const imgH = imgW * ratio;

        if(imgH <= pageHeight) doc.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
        else{
          let y=0, sliceHeight=Math.floor((pageHeight/imgH)*canvas.height), idx=0;
          while(y<canvas.height){
            const slice=document.createElement('canvas'); slice.width=canvas.width; slice.height=Math.min(sliceHeight, canvas.height-y);
            slice.getContext('2d').drawImage(canvas,0,y,canvas.width,slice.height,0,0,slice.width,slice.height);
            const sliceData=slice.toDataURL('image/png');
            if(idx>0) doc.addPage();
            const sliceRatio=slice.height/slice.width;
            doc.addImage(sliceData,'PNG',0,0,pageWidth,pageWidth*sliceRatio);
            y+=sliceHeight; idx++;
          }
        }
        document.body.removeChild(container);
        lastExcelPdfBlob = doc.output('blob'); saveBlob(lastExcelPdfBlob, 'excel.pdf'); excel2pdfDl.disabled=false;
        advStatus.textContent="Fatto! Scaricato excel.pdf";
      }catch(e){ console.error(e); advStatus.textContent="Errore EXCEL→PDF."; }
    });
    excel2pdfDl?.addEventListener('click', ()=> lastExcelPdfBlob ? saveBlob(lastExcelPdfBlob,'excel.pdf') : advStatus.textContent="Nessun PDF in memoria.");

    pdf2csvBtn?.addEventListener('click', ()=>pdfToTableLite('csv'));
    pdf2excelBtn?.addEventListener('click', ()=>pdfToTableLite('xlsx'));

    async function pdfToTableLite(mode){
      try{
        const f = pdfAdvFile.files?.[0]; if(!f){advStatus.textContent="Seleziona un PDF."; return;}
        advStatus.textContent = `Analizzo il PDF per estrarre tabelle (${mode.toUpperCase()})...`;
        const ab = await (new Response(f)).arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
        const rowTol=3, colGap=12, minCols=2;
        let table = [];

        for(let p=1;p<=pdf.numPages;p++){
          const page = await pdf.getPage(p);
          const text = await page.getTextContent();
          const items = text.items.map(it => {
            const m=it.transform; return { str: it.str.trim(), x: m[4], y: m[5] };
          }).filter(o=>o.str);
          if(!items.length) continue;
          items.sort((a,b)=> b.y - a.y || a.x - b.x);

          const rows=[]; let current=[items[0]];
          for(let i=1;i<items.length;i++){
            const prev=current[current.length-1], it=items[i];
            if(Math.abs(it.y-prev.y)<=rowTol) current.push(it);
            else { rows.push(current); current=[it]; }
          }
          rows.push(current);

          for(const r of rows){
            r.sort((a,b)=> a.x - b.x);
            const cells=[]; let buf=r[0].str;
            for(let i=1;i<r.length;i++){
              const prev=r[i-1], it=r[i];
              const approxPrevW=prev.str.length*4;
              const gap = it.x - (prev.x + approxPrevW);
              if(gap>colGap){ cells.push(buf.trim()); buf=it.str; } else { buf+=(buf?' ':'')+it.str; }
            }
            cells.push(buf.trim());
            if(cells.filter(c=>c).length>=minCols) table.push(cells);
          }
          advStatus.textContent = `Estraggo pagina ${p}/${pdf.numPages}...`;
        }

        if(!table.length){ advStatus.textContent = "Nessuna tabella rilevata (per PDF complessi servono API)."; return; }

        if(mode==='csv'){
          const maxCols = table.reduce((m, r)=> Math.max(m, r.length), 0);
          const csv = table.map(r => {
            const row=[...r]; while(row.length<maxCols) row.push('');
            return row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',');
          }).join('\n');
          const blob = new Blob([csv], {type:'text/csv;charset=utf-8'}); saveBlob(blob, 'table.csv');
          pdf2csvDl.disabled=false; advStatus.textContent="Fatto! Scaricato table.csv (lite).";
        } else {
          const maxCols = table.reduce((m, r)=> Math.max(m, r.length), 0);
          const normalized = table.map(r => { const row=[...r]; while(row.length<maxCols) row.push(''); return row; });
          const ws = XLSX.utils.aoa_to_sheet(normalized); const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Estratto');
          const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([arr], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
          saveBlob(blob, 'table.xlsx'); pdf2excelDl.disabled=false; advStatus.textContent="Fatto! Scaricato table.xlsx (lite).";
        }
      }catch(e){ console.error(e); advStatus.textContent="Errore nell'estrazione tabelle (lite)."; }
    }
  })();

  // =======================
  // SEZIONE IMMAGINI
  // =======================

  // Comprimi (JPEG/PNG/WEBP)
  (function(){
    const cmpFile = document.getElementById('cmp-file'); if(!cmpFile) return;
    const cmpFormat = document.getElementById('cmp-format');
    const cmpQuality = document.getElementById('cmp-quality');
    const cmpRun = document.getElementById('cmp-run');
    const cmpDl = document.getElementById('cmp-dl');
    const cmpStatus = document.getElementById('cmp-status');
    const cmpPreview = document.getElementById('cmp-preview');
    let cmpBlob = null;

    cmpRun?.addEventListener('click', async () => {
      try{
        const f = cmpFile.files?.[0]; if(!f){cmpStatus.textContent="Seleziona un'immagine."; return;}
        cmpStatus.textContent="Comprimo...";
        const url = await readAsDataURL(f);
        const img = await loadImage(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img,0,0);
        const mime = (cmpFormat?.value)||'image/jpeg';
        const quality = parseFloat(cmpQuality?.value||"0.8");
        const dataUrl = canvas.toDataURL(mime, mime==='image/png' ? undefined : quality);
        cmpBlob = dataURLtoBlob(dataUrl);
        cmpDl.disabled = false;
        cmpPreview.innerHTML = "";
        const wrap = document.createElement('div'); wrap.className='thumb';
        const im = document.createElement('img'); im.src = dataUrl; wrap.appendChild(im);
        cmpPreview.appendChild(wrap);
        cmpStatus.textContent="Fatto. Usa Scarica per salvare.";
      }catch(e){ console.error(e); cmpStatus.textContent="Errore in compressione."; }
    });
    cmpDl?.addEventListener('click', ()=> { if(cmpBlob){ saveBlob(cmpBlob, suggestName(cmpFile.files[0].name, mimeExt((cmpFormat?.value)||'image/jpeg'))); } });
  })();

  // Ridimensiona (pica)
  (function(){
    const rszFile = document.getElementById('rsz-file'); if(!rszFile) return;
    const rszW = document.getElementById('rsz-w');
    const rszH = document.getElementById('rsz-h');
    const rszKeep = document.getElementById('rsz-keep');
    const rszFormat = document.getElementById('rsz-format');
    const rszQuality = document.getElementById('rsz-quality');
    const rszRun = document.getElementById('rsz-run');
    const rszDl = document.getElementById('rsz-dl');
    const rszStatus = document.getElementById('rsz-status');
    const rszPreview = document.getElementById('rsz-preview');
    let rszBlob=null;

    rszFile.addEventListener('change', async ()=>{
      const f = rszFile.files?.[0]; if(!f) return;
      const url = await readAsDataURL(f);
      const img = await loadImage(url);
      if(rszKeep.checked){
        const targetW = parseInt(rszW.value||"0",10)||img.naturalWidth;
        const ratio = img.naturalHeight/img.naturalWidth;
        rszH.value = Math.round(targetW * ratio);
      }
    });

    rszW?.addEventListener('input', ()=>{
      const f = rszFile.files?.[0]; if(!f) return;
      if(rszKeep.checked){
        readAsDataURL(f).then(loadImage).then(img=>{
          const targetW = parseInt(rszW.value||"0",10)||img.naturalWidth;
          const ratio = img.naturalHeight/img.naturalWidth;
          rszH.value = Math.round(targetW * ratio);
        });
      }
    });

    rszRun?.addEventListener('click', async ()=>{
      try{
        const f = rszFile.files?.[0]; if(!f){rszStatus.textContent="Seleziona un'immagine."; return;}
        const url = await readAsDataURL(f);
        const img = await loadImage(url);

        let tw = parseInt(rszW.value||"0",10) || img.naturalWidth;
        let th = parseInt(rszH.value||"0",10) || img.naturalHeight;
        if(rszKeep.checked){
          const ratio = img.naturalHeight/img.naturalWidth;
          th = Math.round(tw*ratio);
        }

        const src = document.createElement('canvas');
        src.width = img.naturalWidth; src.height = img.naturalHeight;
        src.getContext('2d').drawImage(img,0,0);

        const dst = document.createElement('canvas');
        dst.width = tw; dst.height = th;

        rszStatus.textContent="Ridimensiono...";
        await window.pica().resize(src, dst, { quality: 3 });

        const mime = rszFormat.value;
        const quality = parseFloat(rszQuality.value||"0.9");
        const dataUrl = dst.toDataURL(mime, (mime==='image/png') ? undefined : quality);
        rszBlob = dataURLtoBlob(dataUrl);

        rszPreview.innerHTML="";
        const wrap=document.createElement('div'); wrap.className='thumb';
        const im=document.createElement('img'); im.src=dataUrl; wrap.appendChild(im);
        rszPreview.appendChild(wrap);

        rszDl.disabled=false;
        rszStatus.textContent="Fatto. Usa Scarica per salvare.";
      }catch(e){ console.error(e); rszStatus.textContent="Errore nel ridimensionamento."; }
    });
    rszDl?.addEventListener('click', ()=> { if(rszBlob){ saveBlob(rszBlob, suggestName(rszFile.files[0].name, mimeExt(rszFormat.value))); } });
  })();

  // Dropzone helper (immagini)
  function setupDropzone(dropEl, inputEl, state, previewEl){
    const highlight = (on)=> dropEl.classList.toggle('highlight', !!on);
    ['dragenter','dragover'].forEach(ev => dropEl.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); highlight(true); }));
    ['dragleave','drop'].forEach(ev => dropEl.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); highlight(false); }));
    dropEl.addEventListener('drop', e=>{
      const files = Array.from(e.dataTransfer.files||[]).filter(f=>f.type.startsWith('image/'));
      if(files.length){ state.files = dedupFiles([...(state.files||[]), ...files]); updatePreview(); }
    });
    inputEl.addEventListener('change', ()=>{
      const files = Array.from(inputEl.files||[]).filter(f=>f.type.startsWith('image/'));
      state.files = dedupFiles([...(state.files||[]), ...files]); updatePreview();
    });
    function updatePreview(){
      previewEl.innerHTML = '';
      (state.files||[]).forEach((f,i)=>{
        const wrap = document.createElement('div'); wrap.className='thumb';
        const tag = document.createElement('div'); tag.className='tag'; tag.textContent = `#${i+1}`;
        const img = document.createElement('img');
        readAsDataURL(f).then(u => img.src = u);
        wrap.appendChild(img); wrap.appendChild(tag); previewEl.appendChild(wrap);
      });
    }
  }

  // Combina immagini
  (function(){
    const drop = document.getElementById('cmb-drop'); const input = document.getElementById('cmb-files'); if(!drop || !input) return;
    const preview = document.getElementById('cmb-preview');
    const layout = document.getElementById('cmb-layout');
    const gapEl = document.getElementById('cmb-gap');
    const bgEl = document.getElementById('cmb-bg');
    const run = document.getElementById('cmb-run');
    const dl = document.getElementById('cmb-dl');
    const status = document.getElementById('cmb-status');
    const canvas = document.getElementById('cmb-canvas');
    const ctx = canvas.getContext('2d');
    const state = { files: [] };
    setupDropzone(drop, input, state, preview);
    let outBlob = null;

    run.addEventListener('click', async ()=>{
      try{
        const files = state.files.length ? state.files : Array.from(input.files||[]);
        if(!files.length){ status.textContent="Seleziona 2 o più immagini."; return; }
        const imgs = await Promise.all(files.map(f => readAsDataURL(f).then(loadImage)));
        const gap = parseInt(gapEl.value||"0",10);
        const bg = bgEl.value;

        if(layout.value === 'horizontal'){
          const totalW = imgs.reduce((s,i)=>s+i.naturalWidth, 0) + gap*(imgs.length-1);
          const maxH = Math.max(...imgs.map(i=>i.naturalHeight));
          canvas.width = totalW; canvas.height = maxH;
          ctx.fillStyle=bg; ctx.fillRect(0,0,totalW,maxH);
          let x=0;
          for(const im of imgs){
            const y = (maxH - im.naturalHeight)/2;
            ctx.drawImage(im, x, y);
            x += im.naturalWidth + gap;
          }
        } else {
          const totalH = imgs.reduce((s,i)=>s+i.naturalHeight, 0) + gap*(imgs.length-1);
          const maxW = Math.max(...imgs.map(i=>i.naturalWidth));
          canvas.width = maxW; canvas.height = totalH;
          ctx.fillStyle=bg; ctx.fillRect(0,0,maxW,totalH);
          let y=0;
          for(const im of imgs){
            const x = (maxW - im.naturalWidth)/2;
            ctx.drawImage(im, x, y);
            y += im.naturalHeight + gap;
          }
        }
        const dataUrl = canvas.toDataURL('image/png');
        outBlob = dataURLtoBlob(dataUrl);
        dl.disabled=false;
        status.textContent="Fatto. Scarica per salvare.";
      }catch(e){ console.error(e); status.textContent="Errore nel combinare immagini."; }
    });
    dl.addEventListener('click', ()=>{ if(outBlob) saveBlob(outBlob, 'combined.png'); });
  })();

  // Collage
  (function(){
    const drop = document.getElementById('clg-drop'); const input = document.getElementById('clg-files'); if(!drop || !input) return;
    const preview = document.getElementById('clg-preview');
    const rowsEl = document.getElementById('clg-rows');
    const colsEl = document.getElementById('clg-cols');
    const gapEl  = document.getElementById('clg-gap');
    const wEl    = document.getElementById('clg-w');
    const hEl    = document.getElementById('clg-h');
    const bgEl   = document.getElementById('clg-bg');
    const fitEl  = document.getElementById('clg-fit');
    const run    = document.getElementById('clg-run');
    const dl     = document.getElementById('clg-dl');
    const status = document.getElementById('clg-status');
    const canvas = document.getElementById('clg-canvas');
    const ctx    = canvas.getContext('2d');
    const state  = { files: [] };
    setupDropzone(drop, input, state, preview);
    let outBlob=null;

    run.addEventListener('click', async ()=>{
      try{
        const files = state.files.length ? state.files : Array.from(input.files||[]);
        if(!files.length){status.textContent="Seleziona immagini."; return;}
        const rows = Math.max(1, parseInt(rowsEl.value||"2",10));
        const cols = Math.max(1, parseInt(colsEl.value||"2",10));
        const gap = Math.max(0, parseInt(gapEl.value||"8",10));
        const W = Math.max(100, parseInt(wEl.value||"1080",10));
        const H = Math.max(100, parseInt(hEl.value||"1080",10));
        const bg = bgEl.value; const fit = fitEl.value;

        const imgs = await Promise.all(files.map(f => readAsDataURL(f).then(loadImage)));
        canvas.width = W; canvas.height = H;
        ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

        const cellW = Math.floor((W - gap*(cols-1)) / cols);
        const cellH = Math.floor((H - gap*(rows-1)) / rows);

        for(let r=0; r<rows; r++){
          for(let c=0; c<cols; c++){
            const idx = r*cols + c;
            if(idx >= imgs.length) break;
            const img = imgs[idx];
            const x = c*(cellW+gap);
            const y = r*(cellH+gap);

            let dw=cellW, dh=cellH, sx=0, sy=0, sw=img.naturalWidth, sh=img.naturalHeight;
            const ir = img.naturalWidth / img.naturalHeight;
            const cr = cellW / cellH;

            if(fit === 'cover'){
              if(ir > cr){ sh = img.naturalHeight; sw = Math.round(sh * cr); sx = Math.round((img.naturalWidth - sw)/2); }
              else{ sw = img.naturalWidth; sh = Math.round(sw / cr); sy = Math.round((img.naturalHeight - sh)/2); }
              ctx.drawImage(img, sx, sy, sw, sh, x, y, dw, dh);
            } else {
              if(ir > cr){
                dh = Math.round(cellW / ir);
                const offset = Math.round((cellH - dh)/2);
                ctx.drawImage(img, 0,0,img.naturalWidth,img.naturalHeight, x, y+offset, cellW, dh);
              } else {
                dw = Math.round(cellH * ir);
                const offset = Math.round((cellW - dw)/2);
                ctx.drawImage(img, 0,0,img.naturalWidth,img.naturalHeight, x+offset, y, dw, cellH);
              }
            }
          }
        }
        const dataUrl = canvas.toDataURL('image/png');
        outBlob = dataURLtoBlob(dataUrl);
        dl.disabled=false;
        status.textContent="Collage pronto. Scarica per salvare.";
      }catch(e){ console.error(e); status.textContent="Errore nella creazione del collage."; }
    });
    dl.addEventListener('click', ()=>{ if(outBlob) saveBlob(outBlob, 'collage.png'); });
  })();

  // Conversioni formato immagine (pannelli orizzontali con anteprima)
  (function(){
    document.querySelectorAll('#section-images .tile').forEach(tile=>{
      const input  = tile.querySelector('input[type="file"][data-from]');
      const btnRun = tile.querySelector('[data-convert]');
      const btnDl  = tile.querySelector('[data-download]');
      const status = tile.querySelector('[data-status]');
      const inPrev = tile.querySelector('[data-input-preview]');
      const outPrev= tile.querySelector('[data-output-preview]');
      if(!input || !btnRun) return;

      let outBlob=null, outName='converted';

      // Anteprima originale
      input.addEventListener('change', async ()=>{
        const f = input.files?.[0];
        if(!f){ if(inPrev) inPrev.removeAttribute('src'); if(outPrev) outPrev.removeAttribute('src'); btnDl && (btnDl.disabled=true); status && (status.textContent=''); return; }
        const url = await readAsDataURL(f);
        if(inPrev){ inPrev.src = url; }
        // reset risultato
        outBlob=null; btnDl && (btnDl.disabled=true); status && (status.textContent='');
        if(outPrev) outPrev.removeAttribute('src');
      });

      btnRun.addEventListener('click', async ()=>{
        try{
          const f = input.files?.[0];
          if(!f){ status && (status.textContent="Seleziona un file."); return; }
          status && (status.textContent="Converto...");
          const url  = await readAsDataURL(f);
          const img  = await loadImage(url);
          const can  = document.createElement('canvas'); can.width=img.naturalWidth; can.height=img.naturalHeight;
          can.getContext('2d').drawImage(img,0,0);
          const mimeTo = input.dataset.to;
          const extTo  = mimeExt(mimeTo);
          const dataUrl = can.toDataURL(mimeTo, mimeTo==='image/png' ? undefined : 0.92);
          outBlob = dataURLtoBlob(dataUrl);
          outName = suggestName(f.name, extTo);
          if(outPrev){ outPrev.src = dataUrl; }
          btnDl && (btnDl.disabled=false);
          status && (status.textContent="Fatto. Scarica per salvare.");
        }catch(e){ console.error(e); status && (status.textContent="Errore nella conversione."); }
      });

      btnDl?.addEventListener('click', ()=>{ if(outBlob) saveBlob(outBlob, outName); });
    });
  })();

  // =======================
  // SEZIONE VIDEO (ffmpeg.wasm)
  // =======================

  // Avvisi utili
  if (location.protocol === 'file:') {
    console.warn('[ffmpeg] Stai aprendo la pagina via file:// — usa un piccolo server locale (es. VSCode Live Server o python -m http.server) per evitare problemi di CORS con il core WASM.');
  }

  // Individua namespace UMD (diversi bundle espongono nomi diversi)
  const FFClass =
    (window.FFmpegWASM && window.FFmpegWASM.FFmpeg) ||
    (window.FFmpeg && window.FFmpeg.FFmpeg) ||
    window.FFmpeg;

  // Util dalla UMD @ffmpeg/util (se presente); altrimenti fallback compatibili
  const UtilNS = window.FFmpegUtil || {};
  const fetchFileFF = UtilNS.fetchFile || (async (src) => {
    if (src instanceof Blob) return new Uint8Array(await src.arrayBuffer());
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${src} -> ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  });
  const toBlobURLFF = UtilNS.toBlobURL || (async (url, mime) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
    const buf = await res.arrayBuffer();
    return URL.createObjectURL(new Blob([buf], { type: mime || 'application/octet-stream' }));
  });

  // progress bar helper e Blob utility
  function makeProgressUpdater(container){
    if(!container) return ()=>{};
    const bar = container.querySelector('div') || container.appendChild(document.createElement('div'));
    return (ratio)=>{ bar.style.width = `${Math.min(100, Math.round((ratio||0)*100))}%`; };
  }
  const u8ToBlob = (u8, mime) => new Blob([u8], { type: mime || 'application/octet-stream' });

  // Loader FFmpeg robusto (usa sempre toBlobURL per evitare CORS)
  let ffmpeg = null, ffLoaded = false;
  // === PATCH: usa core single-thread (niente worker) con fallback multithread ===
async function getFF(updateCb, statusEl){
  // 1) Prendi la classe FFmpeg esposta dalle UMD già incluse nel <head>
  const FFClass =
    (window.FFmpeg && window.FFmpeg.FFmpeg) ||
    window.FFmpeg ||
    (window.FFmpegWASM && window.FFmpegWASM.FFmpeg);

  if (!FFClass) {
    const msg = 'FFmpeg UMD non trovata: assicurati che @ffmpeg/ffmpeg e @ffmpeg/util siano PRIMA di script.js.';
    statusEl && (statusEl.textContent = msg);
    throw new Error(msg);
  }

  // 2) Reuse
  if (ffmpeg && ffLoaded) {
    try { ffmpeg.off?.('progress'); } catch {}
    ffmpeg.on?.('progress', ({ progress }) => updateCb && updateCb(progress || 0));
    return ffmpeg;
  }

  // 3) Istanza + eventi
  ffmpeg = new FFClass();
  ffmpeg.on?.('log', ({ message }) => console.log('[ffmpeg]', message));
  ffmpeg.on?.('progress', ({ progress }) => updateCb && updateCb(progress || 0));

  // 4) Helper toBlobURL (se @ffmpeg/util non c’è, fallback manuale)
  const UtilNS = window.FFmpegUtil || {};
  const toBlobURLFF = UtilNS.toBlobURL || (async (url, mime) => {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
    const buf = await res.arrayBuffer();
    return URL.createObjectURL(new Blob([buf], { type: mime || 'application/octet-stream' }));
  });

  // ---- Loader #1: SINGLE THREAD (niente worker) ----
  async function loadSingleThread() {
    const VER   = '0.12.6';
    const BASE  = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@${VER}/dist/umd`;
    const coreURL = await toBlobURLFF(`${BASE}/ffmpeg-core.js`,   'text/javascript');
    const wasmURL = await toBlobURLFF(`${BASE}/ffmpeg-core.wasm`, 'application/wasm');
    statusEl && (statusEl.textContent = 'Carico FFmpeg (single-thread)…');
    await ffmpeg.load({ coreURL, wasmURL }); // <<< Niente workerURL qui
    ffLoaded = true;
  }

  // ---- Loader #2: MULTITHREAD (con patch per il class worker) ----
  async function loadMultiThread() {
    const VER   = '0.12.6';
    const BASE  = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${VER}/dist/umd`;
    const coreURL   = await toBlobURLFF(`${BASE}/ffmpeg-core.js`,        'text/javascript');
    const wasmURL   = await toBlobURLFF(`${BASE}/ffmpeg-core.wasm`,      'application/wasm');
    const workerURL = await toBlobURLFF(`${BASE}/ffmpeg-core.worker.js`, 'text/javascript'); // questa versione lo espone

    // Worker ESM per sostituire l'814.ffmpeg.js classico (bloccato da CORS)
    const classWorkerURL = await toBlobURLFF(
      'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/worker.js',
      'text/javascript'
    );

    // Patch: se la UMD prova a creare 814.ffmpeg.js, usiamo il nostro ESM come module
    const NativeWorker = window.Worker;
    window.Worker = function(spec, opts){
      try{
        const href = (spec && spec.href) ? spec.href : String(spec || '');
        if (href.includes('@ffmpeg/ffmpeg') && href.endsWith('/814.ffmpeg.js')) {
          // forziamo module
          const o = Object.assign({}, opts, { type: 'module' });
          return new NativeWorker(classWorkerURL, o);
        }
      }catch(_){}
      return new NativeWorker(spec, opts);
    };

    try {
      statusEl && (statusEl.textContent = 'Carico FFmpeg (multithread)…');
      await ffmpeg.load({ coreURL, wasmURL, workerURL });
      ffLoaded = true;
    } finally {
      // sempre ripristinare
      window.Worker = NativeWorker;
    }
  }

  // 5) Prova ST; se fallisce, passa a MT
  try {
    await loadSingleThread();
  } catch (e1) {
    console.warn('[ffmpeg] single-thread fallito, provo multithread:', e1);
    await loadMultiThread();
  }

  return ffmpeg;
}
// === FINE PATCH ===
  // Esegue args con fallback (prova più varianti finché una passa)
  async function execWithFallback(ff, variants){
    let lastErr=null;
    for(const v of variants){
      try{ await ff.exec(v.args); return v; }
      catch(e){ lastErr = e; console.warn('[ffmpeg] variante fallita', v.args, e); }
    }
    throw lastErr || new Error('Tutte le varianti sono fallite');
  }

  // ====== COMPRIMI ======
  (function(){
    const inEl = document.getElementById('vid-comp-file'); if(!inEl) return;
    const crfEl = document.getElementById('vid-comp-crf');
    const presetEl = document.getElementById('vid-comp-preset');
    const audioEl = document.getElementById('vid-comp-audio');
    const runEl = document.getElementById('vid-comp-run');
    const dlEl = document.getElementById('vid-comp-dl');
    const status = document.getElementById('vid-comp-status');
    const progress = document.getElementById('vid-comp-progress');

    let outBlob=null, outName='compressed';

    runEl.addEventListener('click', async ()=>{
      try{
        const f = inEl.files?.[0]; if(!f){ status.textContent="Seleziona un video."; return; }
        const update = makeProgressUpdater(progress);
        status.textContent="Inizializzo FFmpeg...";
        const ff = await getFF(update, status);

        const extIn = (f.name.split('.').pop()||'mp4').toLowerCase();
        const inputName = `in.${extIn}`;
        await ff.writeFile(inputName, await fetchFileFF(f));

        const wantWebM = (audioEl?.value === 'opus');
        const outFS = wantWebM ? 'out.webm' : 'out.mp4';
        outName = f.name.replace(/\.[^.]+$/, wantWebM ? '.webm' : '.mp4');

        const crf    = Math.max(18, Math.min(40, parseInt(crfEl?.value||'26',10)));
        const preset = (presetEl?.value||'medium');

        status.textContent="Comprimo...";
        const variants = wantWebM
          ? [
              { args: ['-i', inputName, '-c:v','libvpx-vp9','-b:v','0','-crf', String(crf), '-row-mt','1', '-c:a','libopus','-b:a','128k', outFS] },
              { args: ['-i', inputName, '-c:v','libvpx',      '-q:v','6',                  '-c:a','libvorbis','-b:a','128k', outFS] },
              { args: ['-i', inputName, outFS] },
            ]
          : [
              { args: ['-i', inputName, '-c:v','libx264','-crf', String(crf), '-preset', preset, '-c:a','aac','-b:a','128k','-movflags','+faststart', outFS] },
              { args: ['-i', inputName, '-c:v','mpeg4','-q:v','5','-c:a','aac','-b:a','128k','-movflags','+faststart', outFS] },
              { args: ['-i', inputName, outFS] },
            ];

        await execWithFallback(ff, variants);
        status.textContent="Leggo output...";
        const data = await ff.readFile(outFS);
        outBlob = u8ToBlob(data, wantWebM? 'video/webm' : 'video/mp4');
        dlEl.disabled = false;
        status.textContent = "Fatto. Scarica per salvare.";
        update(1);
      }catch(e){
        console.error(e);
        status.textContent = `Errore: ${e?.message || e}. Apri la console per i dettagli.`;
      }
    });

    dlEl.addEventListener('click', ()=>{ if(outBlob) saveBlob(outBlob, outName); });
  })();

  // ====== RIDIMENSIONA ======
  (function(){
    const inEl = document.getElementById('vid-resize-file'); if(!inEl) return;
    const wEl = document.getElementById('vid-resize-w');
    const crfEl = document.getElementById('vid-resize-crf');
    const presetEl = document.getElementById('vid-resize-preset');
    const runEl = document.getElementById('vid-resize-run');
    const dlEl = document.getElementById('vid-resize-dl');
    const status = document.getElementById('vid-resize-status');
    const progress = document.getElementById('vid-resize-progress');

    let outBlob=null, outName='resized.mp4';

    runEl.addEventListener('click', async ()=>{
      try{
        const f = inEl.files?.[0]; if(!f){ status.textContent="Seleziona un video."; return; }
        const width = Math.max(160, parseInt(wEl?.value||'1280',10));
        const crf = Math.max(18, Math.min(40, parseInt(crfEl?.value||'26',10)));
        const update = makeProgressUpdater(progress);

        status.textContent="Inizializzo FFmpeg...";
        const ff = await getFF(update, status);

        const extIn = (f.name.split('.').pop()||'mp4').toLowerCase();
        const inFS = `in.${extIn}`;
        await ff.writeFile(inFS, await fetchFileFF(f));
        const outFS = 'out.mp4';
        outName = f.name.replace(/\.[^.]+$/, '.mp4');

        status.textContent="Ridimensiono...";
        const variants = [
          { args: ['-i', inFS, '-vf', `scale=${width}:-2`, '-c:v','libx264','-crf', String(crf), '-preset', (presetEl?.value||'medium'),
                   '-c:a','aac','-b:a','128k','-movflags','+faststart', outFS] },
          { args: ['-i', inFS, '-vf', `scale=${width}:-2`, '-c:v','mpeg4','-q:v','5','-c:a','aac','-b:a','128k','-movflags','+faststart', outFS] },
          { args: ['-i', inFS, '-vf', `scale=${width}:-2`, outFS] },
        ];
        await execWithFallback(ff, variants);

        status.textContent="Leggo output...";
        const data = await ff.readFile(outFS);
        outBlob = u8ToBlob(data, 'video/mp4');
        dlEl.disabled=false;
        status.textContent="Fatto. Scarica per salvare.";
        update(1);
      }catch(e){
        console.error(e);
        status.textContent = `Errore: ${e?.message || e}. Vedi console.`;
      }
    });

    dlEl.addEventListener('click', ()=>{ if(outBlob) saveBlob(outBlob, outName); });
  })();

  // ====== CONVERSIONI (MP4/MOV/WEBM/MP3) ======
  (function(){
    document.querySelectorAll('#section-video .tile').forEach(tile=>{
      const input = tile.querySelector('input[type="file"][data-vconv-from]');
      const btnRun = tile.querySelector('[data-vconv-run]');
      const btnDl  = tile.querySelector('[data-vconv-dl]');
      const prog   = tile.querySelector('[data-vconv-progress]');
      const status = tile.querySelector('[data-vconv-status]');
      const vIn    = tile.querySelector('[data-vin-preview]');
      const vOut   = tile.querySelector('[data-vout-video]');
      const aOut   = tile.querySelector('[data-vout-audio]');
      if(!input || !btnRun) return;

      const to = (input.dataset.vconvTo||'mp4').toLowerCase();
      let outBlob=null, outName='output', inURL=null, outURL=null;

      function setProgress(r){
        if(!prog) return; const bar = prog.querySelector('div') || prog.appendChild(document.createElement('div'));
        bar.style.width = `${Math.min(100, Math.round((r||0)*100))}%`;
      }

      input.addEventListener('change', ()=>{
        if(inURL){ URL.revokeObjectURL(inURL); inURL=null; }
        if(outURL){ URL.revokeObjectURL(outURL); outURL=null; }
        outBlob=null; btnDl && (btnDl.disabled=true); status && (status.textContent='');
        if(vOut) vOut.removeAttribute('src'); if(aOut) aOut.removeAttribute('src');
        const f = input.files?.[0]; if(!f || !vIn) return;
        inURL = URL.createObjectURL(f); vIn.src = inURL; vIn.load();
      });

      btnRun.addEventListener('click', async ()=>{
        try{
          const f = input.files?.[0]; if(!f){ status && (status.textContent="Seleziona un file."); return; }
          status && (status.textContent="Inizializzo FFmpeg...");
          setProgress(0);
          const ff = await getFF(setProgress, status);

          const extIn = (f.name.split('.').pop()||'mp4').toLowerCase();
          const inFS = `in.${extIn}`;
          await ff.writeFile(inFS, await fetchFileFF(f));

          let outFS = `out.${to}`;
          let mime = (to==='mp4') ? 'video/mp4'
                   : (to==='mov') ? 'video/quicktime'
                   : (to==='webm')? 'video/webm'
                   : (to==='mp3') ? 'audio/mpeg'
                   : 'application/octet-stream';
          let variants = [], displayAsAudio = false;

          if (to === 'mp3') {
            outFS = 'out.mp3'; outName = f.name.replace(/\.[^.]+$/, '.mp3'); displayAsAudio = true;
            variants = [
              { args: ['-i', inFS, '-vn', '-c:a','libmp3lame','-b:a','192k', outFS] },
              { args: ['-i', inFS, '-vn', '-c:a','aac','-b:a','192k', 'out.m4a'] }, // fallback
            ];
          } else if (to === 'webm') {
            outName = f.name.replace(/\.[^.]+$/, '.webm');
            variants = [
              { args: ['-i', inFS, '-c:v','libvpx-vp9','-b:v','0','-crf','28','-row-mt','1', '-c:a','libopus','-b:a','128k', outFS] },
              { args: ['-i', inFS, '-c:v','libvpx',      '-q:v','6',                 '-c:a','libvorbis','-b:a','128k', outFS] },
              { args: ['-i', inFS, outFS] },
            ];
          } else if (to === 'mov') {
            outName = f.name.replace(/\.[^.]+$/, '.mov');
            variants = [
              { args: ['-i', inFS, '-c:v','libx264','-crf','23','-preset','medium','-c:a','aac','-b:a','128k', outFS] },
              { args: ['-i', inFS, '-c:v','mpeg4','-q:v','5','-c:a','aac','-b:a','128k', outFS] },
              { args: ['-i', inFS, outFS] },
            ];
          } else { // mp4 (default)
            outName = f.name.replace(/\.[^.]+$/, '.mp4');
            variants = [
              { args: ['-i', inFS, '-c:v','libx264','-crf','23','-preset','medium','-c:a','aac','-b:a','128k','-movflags','+faststart', outFS] },
              { args: ['-i', inFS, '-c:v','mpeg4','-q:v','5','-c:a','aac','-b:a','128k','-movflags','+faststart', outFS] },
              { args: ['-i', inFS, outFS] },
            ];
          }

          status && (status.textContent="Converto...");
          let used=null;
          try{ used = await execWithFallback(ff, variants); }
          catch(e){ status && (status.textContent = `Conversione fallita: ${e?.message||e}`); console.error(e); return; }

          const lastOut = used?.args?.slice(-1)[0] || outFS;
          status && (status.textContent="Leggo output...");
          const data = await ff.readFile(lastOut);
          const outType = (lastOut==='out.m4a') ? 'audio/mp4' : mime;
          outBlob = new Blob([data], { type: outType });

          if(outURL){ URL.revokeObjectURL(outURL); outURL=null; }
          outURL = URL.createObjectURL(outBlob);

          if(displayAsAudio || lastOut==='out.m4a'){
            if(aOut){ aOut.src = outURL; aOut.load(); }
            if(vOut){ vOut.removeAttribute('src'); }
          } else {
            if(vOut){ vOut.src = outURL; vOut.load(); }
            if(aOut){ aOut.removeAttribute('src'); }
          }

          btnDl && (btnDl.disabled=false);
          status && (status.textContent="Fatto. Scarica per salvare.");
          setProgress(1);
        }catch(e){
          console.error(e);
          status && (status.textContent=`Errore: ${e?.message || e}. Vedi console.`);
        }
      });

      btnDl?.addEventListener('click', ()=>{ if(outBlob) saveBlob(outBlob, outName); });
    });
  })();

}); // DOMContentLoaded




