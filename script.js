// script.js — Toolkit PDF & Immagini (tabs + drag&drop universale)

document.addEventListener('DOMContentLoaded', () => {
  // =======================
  // TABS (PDF / IMMAGINI)
  // =======================
  const TABS = ['pdf', 'images'];

  function setActiveTab(which) {
    TABS.forEach(name => {
      const btn = document.getElementById(`btn-${name}`);
      const sec = document.getElementById(`section-${name}`);
      if (btn) btn.classList.toggle('active', name === which);
      if (sec) sec.classList.toggle('active', name === which);
    });
    if (location.hash.replace('#','') !== which) {
      history.replaceState(null, '', `#${which}`);
    }
  }

  const initial = (location.hash || '').replace('#','');
  setActiveTab(TABS.includes(initial) ? initial : 'pdf');

  document.getElementById('btn-pdf')?.addEventListener('click', () => setActiveTab('pdf'));
  document.getElementById('btn-images')?.addEventListener('click', () => setActiveTab('images'));

  ['btn-pdf','btn-images'].forEach(id=>{
    const el = document.getElementById(id);
    el?.addEventListener('keydown', e=>{
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  });

  window.addEventListener('hashchange', () => {
    const h = (location.hash || '').replace('#','');
    if (TABS.includes(h)) setActiveTab(h);
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
  // LIBS & HELPERS
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

  function loadImage(src){
    return new Promise((res,rej)=>{
      const img=new Image();
      img.onload=()=>res(img);
      img.onerror=()=>rej(new Error('Immagine non valida o CORS'));
      img.src=src;
    });
  }
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

  // accetta anche per estensione se MIME mancante
  const isImageFile = (f) => {
    if (!f) return false;
    const t = (f.type || '').toLowerCase();
    if (t.startsWith('image/')) return true;
    const name = (f.name || '').toLowerCase();
    const ext = name.split('.').pop();
    return ['png','jpg','jpeg','webp','gif','bmp','tiff','tif','avif'].includes(ext);
  };

  // =======================
  // ======= PDF ===========
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
      generatedImages.forEach(({name, dataUrl}) => {
        const a = document.createElement('a');
        a.href = dataUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      });
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
          if (!isImageFile(file)) { img2pdfStatus.textContent="File non immagini ignorati."; continue; }
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

  // Conversioni (Word/Excel -> PDF)
  (function(){
    // WORD -> PDF
    const wordFile   = document.getElementById('word-file');
    const word2pdf   = document.getElementById('word2pdf-run');
    const word2pdfDl = document.getElementById('word2pdf-dl');
    const advStatus  = document.getElementById('advconv-status');
    const hasWord = (wordFile && word2pdf && word2pdfDl && advStatus);
    let lastWordPdfBlob=null;

    if (hasWord) {
      word2pdf.addEventListener('click', async () => {
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
          const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor:'#ffffff' });
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
      word2pdfDl.addEventListener('click', ()=> lastWordPdfBlob ? saveBlob(lastWordPdfBlob,'converted.pdf') : advStatus.textContent="Nessun PDF in memoria.");
    }

    // EXCEL -> PDF
    const excelFile   = document.getElementById('excel-file');
    const excel2pdf   = document.getElementById('excel2pdf-run');
    const excel2pdfDl = document.getElementById('excel2pdf-dl');
    const hasExcel = (excelFile && excel2pdf && excel2pdfDl && advStatus);
    let lastExcelPdfBlob=null;

    if (hasExcel) {
      excel2pdf.addEventListener('click', async () => {
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
      excel2pdfDl.addEventListener('click', ()=> lastExcelPdfBlob ? saveBlob(lastExcelPdfBlob,'excel.pdf') : advStatus.textContent="Nessun PDF in memoria.");
    }
  })();

  // =======================
  // ======= IMMAGINI ======
  // =======================

  // Comprimi
  (function(){
    const cmpFile = document.getElementById('cmp-file'); if(!cmpFile) return;
    const cmpQuality = document.getElementById('cmp-quality');
    const cmpQualityVal = document.getElementById('cmp-quality-val');
    const cmpRun = document.getElementById('cmp-run');
    const cmpDl = document.getElementById('cmp-dl');
    const cmpStatus = document.getElementById('cmp-status');
    const cmpPreview = document.getElementById('cmp-preview');
    let cmpBlob = null, outExt = 'png';

    const updateQ = () => { if(cmpQualityVal) cmpQualityVal.textContent = `${Math.round(parseFloat(cmpQuality.value||"0")*100)}%`; };
    cmpQuality?.addEventListener('input', updateQ); updateQ();

    function resetCmp(){
      cmpBlob=null; cmpDl.disabled=true; cmpPreview.innerHTML=''; cmpStatus.textContent='';
    }

    cmpFile.addEventListener('change', ()=> {
      const f = cmpFile.files?.[0];
      resetCmp();
      if(!f){ return; }
      if(!isImageFile(f)){
        cmpStatus.textContent = "Il file selezionato non è un'immagine. Seleziona PNG/JPEG/WEBP.";
        cmpFile.value = '';
        return;
      }
      cmpStatus.textContent = `File caricato: ${f.name}`;
    });

    cmpRun?.addEventListener('click', async () => {
      try{
        const f = cmpFile.files?.[0];
        if(!f){cmpStatus.textContent="Seleziona un'immagine."; return;}
        if(!isImageFile(f)){ cmpStatus.textContent="Il file non è un'immagine."; return; }

        cmpStatus.textContent="Comprimo...";
        const url = await readAsDataURL(f);
        const img = await loadImage(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img,0,0);

        const mimeIn = f.type || 'image/png';
        const lossy = (mimeIn === 'image/jpeg' || mimeIn === 'image/webp');
        const q = parseFloat(cmpQuality?.value||"0.8");
        const dataUrl = canvas.toDataURL(mimeIn, lossy ? q : undefined);

        cmpBlob = dataURLtoBlob(dataUrl);
        outExt = mimeExt(mimeIn);

        cmpDl.disabled = false;
        cmpPreview.innerHTML = "";
        const wrap = document.createElement('div'); wrap.className='thumb';
        const im = document.createElement('img'); im.src = dataUrl; wrap.appendChild(im);
        cmpPreview.appendChild(wrap);
        cmpStatus.textContent=`Fatto. Formato mantenuto.`;
      }catch(e){ console.error(e); cmpStatus.textContent="Errore in compressione."; }
    });

    cmpDl?.addEventListener('click', ()=> {
      const f = cmpFile.files?.[0]; if(!cmpBlob || !f) return;
      saveBlob(cmpBlob, suggestName(f.name, outExt));
    });
  })();

  // Ridimensiona
  (function(){
    const rszFile = document.getElementById('rsz-file'); if(!rszFile) return;
    const rszW = document.getElementById('rsz-w');
    const rszH = document.getElementById('rsz-h');
    const rszKeep = document.getElementById('rsz-keep');
    const rszRun = document.getElementById('rsz-run');
    const rszDl = document.getElementById('rsz-dl');
    const rszStatus = document.getElementById('rsz-status');
    const rszPreview = document.getElementById('rsz-preview');

    let rszBlob=null, outExt='png';
    let natW=null, natH=null;
    let syncing=false;

    function resetRsz(msg){
      rszBlob=null; rszDl.disabled=true; rszPreview.innerHTML=''; rszStatus.textContent = msg || '';
      natW = natH = null;
    }

    rszFile.addEventListener('change', async ()=>{
      const f = rszFile.files?.[0];
      resetRsz('');
      if(!f) return;
      if(!isImageFile(f)){
        rszStatus.textContent = "Il file selezionato non è un'immagine. Seleziona PNG/JPEG/WEBP.";
        rszFile.value='';
        return;
      }
      const url = await readAsDataURL(f);
      const img = await loadImage(url);
      natW = img.naturalWidth; natH = img.naturalHeight;

      if(!Number(rszW.value)) rszW.value = String(natW);
      if(!Number(rszH.value)) rszH.value = String(natH);

      rszStatus.textContent = `Immagine: ${natW}×${natH}px`;
    });

    rszW?.addEventListener('input', ()=>{
      if(!rszKeep.checked || !natW || !natH) return;
      if(syncing) return;
      syncing = true;
      const w = Math.max(1, parseInt(rszW.value||"0",10));
      const h = Math.round(w * (natH / natW));
      rszH.value = String(h);
      syncing = false;
    });
    rszH?.addEventListener('input', ()=>{
      if(!rszKeep.checked || !natW || !natH) return;
      if(syncing) return;
      syncing = true;
      const h = Math.max(1, parseInt(rszH.value||"0",10));
      const w = Math.round(h * (natW / natH));
      rszW.value = String(w);
      syncing = false;
    });

    rszRun?.addEventListener('click', async ()=>{
      try{
        const f = rszFile.files?.[0];
        if(!f){ rszStatus.textContent="Seleziona un'immagine."; return; }
        if(!isImageFile(f)){ rszStatus.textContent="Il file non è un'immagine."; return; }
        if(!natW || !natH){ rszStatus.textContent="Carica prima l'immagine."; return; }

        const url = await readAsDataURL(f);
        const img = await loadImage(url);

        let tw = Math.max(1, parseInt(rszW.value||"0",10));
        let th = Math.max(1, parseInt(rszH.value||"0",10));
        if(rszKeep.checked){
          const ratio = natH/natW;
          th = Math.max(1, Math.round(tw*ratio));
          rszH.value = String(th);
        }

        const src = document.createElement('canvas');
        src.width = img.naturalWidth; src.height = img.naturalHeight;
        src.getContext('2d').drawImage(img,0,0);

        const dst = document.createElement('canvas');
        dst.width = tw; dst.height = th;

        rszStatus.textContent="Ridimensiono...";
        await window.pica().resize(src, dst, { quality: 3 });

        const mimeIn = f.type || 'image/png';
        const dataUrl = dst.toDataURL(mimeIn);
        rszBlob = dataURLtoBlob(dataUrl);
        outExt = mimeExt(mimeIn);

        rszPreview.innerHTML="";
        const wrap=document.createElement('div'); wrap.className='thumb';
        const im=document.createElement('img'); im.src=dataUrl; wrap.appendChild(im);
        rszPreview.appendChild(wrap);

        rszDl.disabled=false;
        rszStatus.textContent=`Fatto. ${tw}×${th}px (formato mantenuto).`;
      }catch(e){ console.error(e); rszStatus.textContent="Errore nel ridimensionamento."; }
    });

    rszDl?.addEventListener('click', ()=>{
      const f = rszFile.files?.[0]; if(!rszBlob || !f) return;
      saveBlob(rszBlob, suggestName(f.name, outExt));
    });
  })();

  // Helper dropzone immagini (usato da "Combina" e "Collage")
  function setupDropzone(dropEl, inputEl, state, previewEl, statusEl, maxFiles=null){
    const highlight = (on)=> dropEl.classList.toggle('highlight', !!on);
    ['dragenter','dragover'].forEach(ev => dropEl.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); highlight(true); }));
    ['dragleave','drop'].forEach(ev => dropEl.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); highlight(false); }));
    dropEl.addEventListener('drop', e=>{
      const inc = Array.from(e.dataTransfer.files||[]);
      const valid = inc.filter(isImageFile);
      if(!valid.length){ statusEl && (statusEl.textContent="Trascina solo immagini."); return; }
      state.files = dedupFiles([...(state.files||[]), ...valid]);
      if(maxFiles && state.files.length > maxFiles){
        state.files = state.files.slice(0, maxFiles);
        statusEl && (statusEl.textContent=`Puoi usare al massimo ${maxFiles} immagini; tengo le prime ${maxFiles}.`);
      }
      updatePreview();
    });
    inputEl.addEventListener('change', ()=>{
      const inc = Array.from(inputEl.files||[]).filter(isImageFile);
      if(!inc.length){ statusEl && (statusEl.textContent="Seleziona immagini valide."); return; }
      state.files = dedupFiles([...(state.files||[]), ...inc]);
      if(maxFiles && state.files.length > maxFiles){
        state.files = state.files.slice(0, maxFiles);
        statusEl && (statusEl.textContent=`Puoi usare al massimo ${maxFiles} immagini; tengo le prime ${maxFiles}.`);
      } else { statusEl && (statusEl.textContent = `${state.files.length} immagine/i in coda`); }
      updatePreview();
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
    function dedupFiles(arr){ const map = new Map(); for(const f of arr){ map.set(`${f.name}_${f.size}`, f); } return [...map.values()]; }
    state._updatePreview = updatePreview;
  }

  // Combina immagini (max 2)
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
    setupDropzone(drop, input, state, preview, status, 2);
    let outBlob = null;

    run.addEventListener('click', async ()=>{
      try{
        const files = state.files.length ? state.files : Array.from(input.files||[]).filter(isImageFile).slice(0,2);
        if(files.length < 2){ status.textContent="Seleziona esattamente 2 immagini."; return; }
        if(files.length > 2){ status.textContent="Massimo 2 immagini."; return; }

        const imgs = await Promise.all(files.map(f => readAsDataURL(f).then(loadImage)));
        const gap = Math.max(0, parseInt(gapEl.value||"0",10));
        const bg = bgEl.value;

        if(layout.value === 'horizontal'){
          const totalW = imgs[0].naturalWidth + imgs[1].naturalWidth + gap;
          const maxH = Math.max(imgs[0].naturalHeight, imgs[1].naturalHeight);
          canvas.width = totalW; canvas.height = maxH;
          ctx.fillStyle=bg; ctx.fillRect(0,0,totalW,maxH);

          let x=0;
          for(const im of imgs){
            const y = (maxH - im.naturalHeight)/2;
            ctx.drawImage(im, x, y);
            x += im.naturalWidth + gap;
          }
        } else {
          const totalH = imgs[0].naturalHeight + imgs[1].naturalHeight + gap;
          const maxW = Math.max(imgs[0].naturalWidth, imgs[1].naturalWidth);
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
    setupDropzone(drop, input, state, preview, status);
    let outBlob=null;

    run.addEventListener('click', async ()=>{
      try{
        const files = state.files.length ? state.files : Array.from(input.files||[]).filter(isImageFile);
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

  // Conversioni formato (tiles) — input/anteprima + drag&drop
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

      input.addEventListener('change', async ()=>{
        const f = input.files?.[0];
        outBlob=null; if(btnDl) btnDl.disabled=true; if(status) status.textContent='';
        outPrev?.removeAttribute('src'); inPrev?.removeAttribute('src');
        if(!f){ return; }
        if(!isImageFile(f)){
          status && (status.textContent="Seleziona un file immagine valido.");
          input.value = '';
          return;
        }
        const url = await readAsDataURL(f);
        if(inPrev) inPrev.src = url;
      });

      btnRun.addEventListener('click', async ()=>{
        try{
          const f = input.files?.[0];
          if(!f){ status && (status.textContent="Seleziona un file."); return; }
          if(!isImageFile(f)){ status && (status.textContent="Il file non è un'immagine."); return; }
          status && (status.textContent="Converto...");

          const url = await readAsDataURL(f);
          const img = await loadImage(url);

          const can  = document.createElement('canvas'); can.width=img.naturalWidth; can.height=img.naturalHeight;
          can.getContext('2d').drawImage(img,0,0);

          const mimeTo = input.dataset.to;
          const extTo  = (mimeTo==='image/jpeg'?'jpg': mimeTo==='image/png'?'png': mimeTo==='image/webp'?'webp':'bin');
          const dataUrl = can.toDataURL(mimeTo, mimeTo==='image/png' ? undefined : 0.92);

          const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1];
          const bstr = atob(arr[1]); const u8 = new Uint8Array(bstr.length);
          for(let i=0;i<bstr.length;i++) u8[i]=bstr.charCodeAt(i);
          outBlob = new Blob([u8], { type:mime });

          outName = (f.name || 'file').replace(/\.[^.]+$/, `.${extTo}`);

          if(outPrev) outPrev.src = dataUrl;
          if(btnDl) btnDl.disabled = false;
          if(status) status.textContent="Fatto. Scarica per salvare.";
        }catch(e){
          console.error(e);
          if(status) status.textContent="Errore nella conversione.";
        }
      });

      btnDl?.addEventListener('click', ()=>{
        if(!outBlob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(outBlob);
        a.download = outName;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(a.href), 800);
      });
    });
  })();

  // Cambia formato (aspect ratio)
  (function(){
    const arFile   = document.getElementById('ar-file');
    if(!arFile) return;

    const arMode   = document.getElementById('ar-mode');
    const arRatio  = document.getElementById('ar-ratio');
    const arBG     = document.getElementById('ar-bg');
    const arRun    = document.getElementById('ar-run');
    const arDl     = document.getElementById('ar-dl');
    const arStatus = document.getElementById('ar-status');
    const arPrev   = document.getElementById('ar-preview');
    const arCanvas = document.getElementById('ar-canvas');
    const arCtx    = arCanvas?.getContext('2d');

    let outBlob=null, srcImg=null, natW=0, natH=0;

    arFile.addEventListener('change', async ()=>{
      outBlob=null;
      if (arDl) arDl.disabled=true;
      if (arPrev) arPrev.innerHTML='';
      if (arStatus) arStatus.textContent='';
      const f = arFile.files?.[0]; if(!f) return;
      if(!isImageFile(f)){ arStatus && (arStatus.textContent='Seleziona un file immagine.'); arFile.value=''; return; }
      const url = await readAsDataURL(f);
      srcImg = await loadImage(url);
      natW = srcImg.naturalWidth; natH = srcImg.naturalHeight;
      if(arPrev){
        const wrap = document.createElement('div'); wrap.className='thumb';
        const img = document.createElement('img'); img.src=url; wrap.appendChild(img);
        arPrev.appendChild(wrap);
      }
      arStatus && (arStatus.textContent=`Caricata: ${natW}×${natH}`);
    });

    function parseRatio(val){
      const m = String(val||'1:1').split(':').map(x=>parseFloat(x));
      let a = m[0]||1, b = m[1]||1;
      if(a<=0) a=1; if(b<=0) b=1;
      return a/b;
    }

    arRun?.addEventListener('click', ()=>{
      try{
        if(!srcImg){ arStatus && (arStatus.textContent='Carica prima un\'immagine.'); return; }
        const tr = parseRatio(arRatio?.value || '1:1');
        const ir = natW / natH;

        let targetW, targetH;
        if(tr >= 1){
          targetW = natW;
          targetH = Math.round(targetW / tr);
        } else {
          targetH = natH;
          targetW = Math.round(targetH * tr);
        }
        targetW = Math.max(16, targetW);
        targetH = Math.max(16, targetH);

        arCanvas.width = targetW; arCanvas.height = targetH;

        const mode = arMode?.value || 'crop';
        if(mode === 'crop'){
          let sx=0, sy=0, sw=natW, sh=natH;
          if(ir > tr){
            sh = natH;
            sw = Math.round(sh * tr);
            sx = Math.round((natW - sw)/2);
          } else {
            sw = natW;
            sh = Math.round(sw / tr);
            sy = Math.round((natH - sh)/2);
          }
          arCtx.clearRect(0,0,targetW,targetH);
          arCtx.drawImage(srcImg, sx, sy, sw, sh, 0, 0, targetW, targetH);
        } else {
          arCtx.fillStyle = arBG?.value || '#000000';
          arCtx.fillRect(0,0,targetW,targetH);
          let dw=targetW, dh=targetH;
          if(ir > tr){
            dh = Math.round(targetW / ir);
          } else {
            dw = Math.round(targetH * ir);
          }
          const dx = Math.round((targetW - dw)/2), dy = Math.round((targetH - dh)/2);
          arCtx.drawImage(srcImg, 0,0,natW,natH, dx, dy, dw, dh);
        }

        const dataUrl = arCanvas.toDataURL('image/png');
        outBlob = dataURLtoBlob(dataUrl);
        arDl && (arDl.disabled=false);
        arStatus && (arStatus.textContent=`Fatto. Output: ${targetW}×${targetH}`);
      }catch(e){
        console.error(e);
        arStatus && (arStatus.textContent='Errore nel cambio formato.');
      }
    });

    arDl?.addEventListener('click', ()=>{
      if(!outBlob) return;
      saveBlob(outBlob, 'reframed.png');
    });
  })();

  // ============================================================
  // DRAG & DROP UNIVERSALE — aggiunge la dropzone testuale a TUTTI i file input
  // ============================================================
  (function universalDropzones(){
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));

    // Evita che il browser apra i file fuori dalle zone
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop',     e => e.preventDefault());

    const parseAccept = (input) =>
      (input.getAttribute('accept') || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

    const matchesAccept = (file, acceptList) => {
      if (!acceptList.length) return true;
      const name = (file.name || '').toLowerCase();
      const type = (file.type || '').toLowerCase();
      return acceptList.some(rule => {
        if (rule === '*/*') return true;
        if (rule.endsWith('/*')) {
          const prefix = rule.slice(0, -2);
          return type.startsWith(prefix + '/');
        }
        if (rule.startsWith('.')) {
          return name.endsWith(rule);
        }
        return type === rule;
      });
    };

    const labelFromAccept = (acceptList) => {
      if (!acceptList.length) return 'file';
      if (acceptList.includes('image/*')) return 'immagini';
      if (acceptList.includes('application/pdf')) return 'PDF';
      return 'file supportati';
    };

    const setFilesOnInput = (input, files) => {
      const dt = new DataTransfer();
      const multiple = !!input.multiple;
      files.slice(0, multiple ? files.length : 1).forEach(f => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const findStatus = (input) => {
      const container = input.closest('.tile') || input.closest('.card') || input.parentElement;
      return container?.querySelector?.('.status') || null;
    };

    const makeDropzone = (input) => {
      // già gestito (Combina/Collage) → salta
      if (input.closest('.dropzone')) return;

      const container = input.closest('.tile') || input.closest('.card') || input.parentElement || input;
      if (!container || container.dataset.dzMade === '1') return;

      const dz = document.createElement('div');
      dz.className = 'dropzone';
      const accepts = parseAccept(input);
      const label = labelFromAccept(accepts);
      const multi = input.multiple ? ' (multipli)' : '';

      dz.innerHTML = `
        <strong>Trascina qui ${label}${multi}</strong><br>
        oppure
        <button type="button" class="btn" data-dz-pick>Scegli ${label}</button>
      `;

      input.before(dz);
      input.classList.add('visually-hidden');
      container.dataset.dzMade = '1';

      const statusEl = findStatus(input);
      const inPrev = container.matches('.tile') ? container.querySelector('[data-input-preview]') : null;

      const onEnter = (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add('highlight'); };
      const onLeave = (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('highlight'); };
      const onDrop  = (e) => {
        e.preventDefault(); e.stopPropagation(); dz.classList.remove('highlight');
        const files = Array.from(e.dataTransfer?.files || []);
        if (!files.length) return;

        // Filtra per accept; se type è vuoto passa per estensione (gestito da matchesAccept)
        const filtered = files.filter(f => matchesAccept(f, accepts));
        if (!filtered.length) {
          statusEl && (statusEl.textContent = 'Formato non supportato per questo blocco.');
          return;
        }

        setFilesOnInput(input, filtered);
        statusEl && (statusEl.textContent = `${filtered.length} file pronto/i`);

        // Anteprima immediata anche se manca il MIME (solo tiles conversione)
        if (inPrev && filtered[0]) {
          const fr = new FileReader();
          fr.onload = () => { inPrev.src = fr.result; };
          fr.readAsDataURL(filtered[0]);
        }
      };

      ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, onEnter));
      ['dragleave','dragend'].forEach(ev => dz.addEventListener(ev, onLeave));
      dz.addEventListener('drop', onDrop);

      dz.querySelector('[data-dz-pick]')?.addEventListener('click', () => input.click());
    };

    inputs.forEach(makeDropzone);
  })();

});
