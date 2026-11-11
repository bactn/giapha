// All exports use measured, complete card content and orthogonal connectors.
import { avatarSVG, lifespanAge } from './member-presentation.js';
import { AutoLayout } from './auto-layout.js';
import { A4, PAGE, scopedMembers, measureCard, planA4, planTable, wrapText, pdfMembers, pdfBranchSections, parentCaption } from './export-layout.js';

const FONT = 'Arial, Helvetica, sans-serif';
const xml = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const pathString = points => points.map(([x,y],i)=>`${i?'L':'M'} ${x} ${y}`).join(' ');
export class Exporter {
  static A4 = { landscape: A4, portrait: { w: A4.h, h: A4.w } };
  static async ready() {
    if (typeof document !== 'undefined' && document.fonts) {
      await Promise.all([document.fonts.load(`9px ${FONT}`),document.fonts.load(`bold 12px ${FONT}`)]);
      await document.fonts.ready;
    }
  }
  static measurer() {
    const ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    return (text, style) => {
      if (!ctx) return [...text].length * style.size * .62; // deterministic non-browser tests
      ctx.font = `${style.weight} ${style.size}px ${FONT}`;
      return ctx.measureText(text).width;
    };
  }
  static getScopeTitle(store, scope='ALL') {
    const labels={ALL:'Toàn bộ dòng họ',CURRENT_VIEW:'Các thành viên đang hiển thị','Chi 1':'Chi 1','Chi 2':'Chi 2',PATERNAL_ONLY:'Nhánh nội tộc',MATERNAL_ONLY:'Nhánh ngoại tộc'};
    return labels[scope] || (scope.startsWith('SUBTREE:') ? `Nhánh ${store.getMember(scope.slice(8))?.full_name || scope.slice(8)}` : 'Cây gia phả');
  }
  static getExportLayout(tree, scope='ALL', maxDepth=0, omitSpouses=false) {
    const members = omitSpouses ? pdfMembers(tree, scope, maxDepth) : scopedMembers(tree, scope, maxDepth);
    return this.layoutMembers(tree.dataStore, members);
  }
  static layoutMembers(store, members) {
    const measure=this.measurer();
    const width=280;
    const cards=new Map(members.map(m=>[m.id,measureCard(m,store,width,measure)]));
    const height=Math.max(100,...[...cards.values()].map(c=>c.height));
    const layout=new AutoLayout({nodeWidth:width,nodeHeight:height,generationGap:70,siblingGap:24,orientation:'VERTICAL'}).calculateLayout({getAllMembers:()=>members},'ALL');
    return {...layout,cards,nodeWidth:width,nodeHeight:height};
  }
  static a4Pages(tree,scope='ALL',template='card',maxDepth=0) {
    const members=pdfMembers(tree, scope, maxDepth);
    const measure=this.measurer();
    return pdfBranchSections(members).flatMap(section => {
      const pages = template === 'table'
        ? planTable(section.members, tree.dataStore, measure)
        : planA4(section.members, tree.dataStore, measure, section.context);
      return pages.map(page => ({ ...page, branch: section.label }));
    });
  }
  static cardSVG(card) {
    const {x=0,y=0,width,height,member,lines}=card;
    const text=lines.map(line=>{
      const fill=line.kind==='badge'||line.kind==='saint'?'#92400e':line.kind==='name'?'#292524':'#57534e';
      return `<text x="${x+line.x}" y="${y+line.y}" text-anchor="${line.anchor}" font-size="${line.size}" font-weight="${line.weight}" fill="${fill}">${xml(line.text)}</text>`;
    }).join('');
    const avatar=card.avatar;
    return `<g data-member-id="${xml(member.id)}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="#fff" stroke="${card.continued||card.repeated||member.role==='Đích Tôn'?'#d97706':'#a8a29e'}" stroke-width="${card.continued||card.repeated?1.5:.8}"/>${avatarSVG(member.gender).replace('<svg ',`<svg x="${x+avatar.x}" y="${y+avatar.y}" width="${avatar.size}" height="${avatar.size}" `)}${text}</g>`;
  }

  static headerSVG(tree,scope,width,pair=null,branch='',parentage='') {
    const measure=this.measurer();
    const title=wrapText(tree.dataStore.lineageInfo.name||'Gia phả dòng họ',width-68,s=>measure(s,{size:18,weight:'bold'}));
    // A4 reserves two header lines. Oversized titles continue in the scope caption.
    const titleLines=title.slice(0,2);
    const titleText=titleLines.map((t,i)=>`<text x="${width/2}" y="${27+i*20}" text-anchor="middle" font-size="18" font-weight="bold" fill="#78350f">${xml(t)}</text>`).join('');
    const detail=pair ? pair[0]===pair[1]?`Đời ${pair[0]}`:`Đời ${pair[0]}–${pair[1]}` : '';
    const caption = [branch, detail].filter(Boolean).join(' · ') || this.getScopeTitle(tree.dataStore,scope);
    const parentageWidth = measure(parentage, { size: 10, weight: 'normal' });
    const fit = parentageWidth > width - 68 ? ` textLength="${width - 68}" lengthAdjust="spacingAndGlyphs"` : '';
    const ancestry = parentage
      ? `<text x="${width/2}" y="76" text-anchor="middle" font-size="10" fill="#57534e"${fit}>${xml(parentage)}</text>`
      : '';
    const ruleY = parentage ? 82 : 76;
    return `${titleText}<text x="${width/2}" y="${parentage ? 62 : 66}" text-anchor="middle" font-size="10" fill="#92400e">${xml(caption)}</text>${ancestry}<path d="M 34 ${ruleY} H ${width-34}" stroke="#d97706" stroke-width="1"/>`;
  }
  static a4PageSVG(tree,page,index,total,scope='ALL',template='card') {
    let body='';
    if(template==='table') {
      let x=PAGE.left;
      body+=`<rect x="${x}" y="${PAGE.top}" width="${A4.w-PAGE.left-PAGE.right}" height="28" fill="#fef3c7"/>`;
      page.headings.forEach((label,i)=>{body+=`<text x="${x+6}" y="${PAGE.top+17}" font-size="9" font-weight="bold">${xml(label)}</text>`;x+=page.widths[i];});
      page.rows.forEach((row,r)=>{
        body+=`<rect x="${PAGE.left}" y="${row.y}" width="${A4.w-PAGE.left-PAGE.right}" height="${row.height}" fill="${r%2?'#fff':'#fafaf9'}" stroke="#e7e5e4" stroke-width=".4"/>`;
        let cx=PAGE.left;
        row.cells.forEach((lines,i)=>{lines.forEach((line,j)=>{body+=`<text x="${cx+6}" y="${row.y+15+j*12}" font-size="9" fill="#292524">${xml(line)}</text>`;});cx+=page.widths[i];});
      });
    } else {
      body=page.paths.map(p=>`<path data-parent="${xml(p.parentId)}" data-child="${xml(p.childId)}" d="${pathString(p.points)}" fill="none" stroke="#44403c" stroke-width="1"/>`).join('');
      body+=page.nodes.map(card=>this.cardSVG(card)).join('');
    }
    const lead = template === 'card' ? page.blocks[0]?.parent?.member || page.nodes[0]?.member : null;
    const parentage = parentCaption(lead, tree.dataStore, page.branch);
    const continued=template==='card' && page.nodes.some(n=>n.continued || n.repeated);
    const footer=`Trang ${index}/${total}${page.pair?` · Đời ${page.pair.join('–')}`:''}${continued?' · Lặp lại cha/mẹ để nối tiếp cây':''}`;
    return this.svgDocument(A4.w,A4.h,`${this.headerSVG(tree,scope,A4.w,page.pair,page.branch,parentage)}${body}<path d="M 34 ${A4.h-27} H ${A4.w-34}" stroke="#d97706" stroke-width=".8"/><text x="${A4.w/2}" y="${A4.h-13}" text-anchor="middle" font-size="8" fill="#78716c">${xml(footer)}</text>`);
  }
  static svgDocument(width,height,body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:${FONT};}</style><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`;
  }
  static fullTreeSVG(tree,scope='ALL',maxDepth=0,omitSpouses=false) {
    if (omitSpouses) {
      const members = pdfMembers(tree, scope, maxDepth);
      const sections = pdfBranchSections(members);
      if (sections.length > 1) {
        const rendered = sections.map(section => {
          // External parents provide the link into this section as root cards.
          const context = section.context.map(parent => ({ ...parent, parent_id: '' }));
          const layout = this.layoutMembers(tree.dataStore, [...context, ...section.members]);
          return this.treeSectionSVG(tree, scope, layout, section.label);
        });
        const width = Math.max(...rendered.map(section => section.width));
        let height = 0;
        const content = rendered.map(section => {
          const x = (width - section.width) / 2;
          const svg = `<g transform="translate(${x} ${height})">${section.content}</g>`;
          height += section.height;
          return svg;
        }).join('');
        return { svg: this.svgDocument(width, height, content), width, height };
      }
    }
    const layout = this.getExportLayout(tree, scope, maxDepth, omitSpouses);
    const { content, width, height } = this.treeSectionSVG(tree, scope, layout);
    return { svg: this.svgDocument(width, height, content), width, height };
  }
  static treeSectionSVG(tree, scope, layout, branch = '') {
    if(!layout.positions.size) throw new Error('Không có thành viên trong phạm vi đã chọn.');
    const width=Math.max(1000,layout.bounds.width+68),height=layout.bounds.height+140;
    const dx=(width-layout.bounds.width)/2-layout.bounds.minX,dy=100-layout.bounds.minY;
    let content='';
    for(const link of layout.links) {
      const sx=link.source.x+layout.nodeWidth/2+dx, sy=link.source.y+layout.nodeHeight+dy;
      const tx=link.target.x+layout.nodeWidth/2+dx, ty=link.target.y+dy,mid=(sy+ty)/2;
      content+=`<path d="${pathString([[sx,sy],[sx,mid],[tx,mid],[tx,ty]])}" fill="none" stroke="#44403c" stroke-width="1.5"/>`;
    }
    for(const [id,pos] of layout.positions) content+=this.cardSVG({...layout.cards.get(id),height:layout.nodeHeight,x:pos.x+dx,y:pos.y+dy});
    return { content: this.headerSVG(tree,scope,width,null,branch)+content, width, height };
  }
  static async rasterize(svg,width,height,scale=300/72) {
    const image=new Image();
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
    try {
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Không thể dựng ảnh xuất. Vui lòng thử lại.'));image.src=url;});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      return {canvas,width:canvas.width,height:canvas.height};
    } finally {URL.revokeObjectURL(url);}
  }
  static async renderToCanvas2D(tree,scope='ALL',scale=2,maxDepth=0,omitSpouses=false) {
    await this.ready();
    const output=this.fullTreeSVG(tree,scope,maxDepth,omitSpouses);
    // Bound both axes and area on mobile; suggest A4 instead of a blank canvas.
    const renderScale=Math.min(scale,16000/output.width,16000/output.height,Math.sqrt(24000000/(output.width*output.height)));
    if(renderScale<.35) throw new Error('Cây quá lớn cho một ảnh. Hãy xuất PDF A4 nhiều trang hoặc SVG.');
    return {...await this.rasterize(output.svg,output.width,output.height,renderScale),scopeLabel:this.getScopeTitle(tree.dataStore,scope)};
  }
  static async exportPNG(tree,scope='ALL',maxDepth=0) {
    const rendered=await this.renderToCanvas2D(tree,scope,2,maxDepth);
    try {const blob=await new Promise(resolve=>rendered.canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Không thể tạo ảnh PNG.');this.downloadBlob(blob,this.filename('Cay',scope,'png'));}
    finally {rendered.canvas.width=rendered.canvas.height=0;}
  }
  static exportSVG(tree,scope='ALL',maxDepth=0) {
    const {svg}=this.fullTreeSVG(tree,scope,maxDepth);
    this.downloadBlob(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),this.filename('Cay',scope,'svg'));
  }
  static async exportPDF(tree,scope='ALL',paperSize='AUTO',maxDepth=0) {
    const rendered=await this.renderToCanvas2D(tree,scope,2,maxDepth,true);
    try {
      const largest=2200;
      const ratio=rendered.width/rendered.height;
      const page=paperSize==='A4'?A4:ratio>=1?{w:largest,h:largest/ratio}:{w:largest*ratio,h:largest};
      this.downloadBlob(this.createMultiPagePdfBlob([{dataUrl:rendered.canvas.toDataURL('image/jpeg',.95),width:rendered.width,height:rendered.height}],page),this.filename('Cay',scope,'pdf'));
    } finally {rendered.canvas.width=rendered.canvas.height=0;}
  }
  static async exportA4PDF(tree,scope='ALL',template='card',maxDepth=0) {
    await this.ready();
    const pages=this.a4Pages(tree,scope,template,maxDepth);
    if(!pages.length) throw new Error('Không có dữ liệu trong phạm vi đã chọn.');
    const images=[];
    for(let i=0;i<pages.length;i++) {
      const rendered=await this.rasterize(this.a4PageSVG(tree,pages[i],i+1,pages.length,scope,template),A4.w,A4.h);
      images.push({dataUrl:rendered.canvas.toDataURL('image/jpeg',.95),width:rendered.width,height:rendered.height});
      rendered.canvas.width=rendered.canvas.height=0;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const blob=this.createMultiPagePdfBlob(images,A4);
    this.downloadBlob(blob,this.filename(template==='table'?'A4_Bang':'A4_Cay',scope,'pdf'));
    return pages.length;
  }
  static printWindow() {
    const win=window.open('','_blank');
    if(!win) throw new Error('Vui lòng cho phép mở cửa sổ để in gia phả.');
    win.document.write('<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>In gia phả</title></head><body><p>Đang chuẩn bị bản in…</p></body></html>');win.document.close();
    return win;
  }
  static async printA4(tree,scope='ALL',template='card',maxDepth=0) {
    const win=this.printWindow(); // Open synchronously from the click to retain popup permission.
    try {
      await this.ready();
      const pages=this.a4Pages(tree,scope,template,maxDepth);
      if(!pages.length)throw new Error('Không có dữ liệu trong phạm vi đã chọn.');
      const body=pages.map((page,i)=>`<section class="a4-page">${this.a4PageSVG(tree,page,i+1,pages.length,scope,template)}</section>`).join('');
      await this.fillPrintWindow(win,tree.dataStore.lineageInfo.name,body,true);
      return pages.length;
    } catch(error) {win.close();throw error;}
  }
  static async printTree(tree,scope='ALL',maxDepth=0) {
    const win=this.printWindow();
    try {await this.ready();const output=this.fullTreeSVG(tree,scope,maxDepth,true);await this.fillPrintWindow(win,tree.dataStore.lineageInfo.name,`<section>${output.svg}</section>`,false);}
    catch(error){win.close();throw error;}
  }
  static async fillPrintWindow(win,title,body,a4) {
    win.document.title=title || 'Gia phả';
    const style=win.document.createElement('style');
    style.textContent=`@page{size:${a4?'A4 landscape':'landscape'};margin:0}*{box-sizing:border-box}body{margin:0;background:#e7e5e4}section{background:white;margin:12px auto}section svg{display:block;width:100%;height:100%}.a4-page{width:297mm;height:210mm;break-after:page;page-break-after:always}.a4-page:last-child{break-after:auto;page-break-after:auto}@media print{body{background:white}section{margin:0;break-inside:avoid}section:not(.a4-page){width:100%}}`;
    win.document.head.append(style); win.document.body.innerHTML=body;
    if(win.document.fonts){await win.document.fonts.load(`9px ${FONT}`);await win.document.fonts.ready;}
    win.focus();win.print();
  }
  static exportJSON(store) {
    this.downloadBlob(new Blob([JSON.stringify({lineageInfo:store.lineageInfo,members:store.getAllMembers()},null,2)],{type:'application/json'}),this.filename('Sao_Luu','ALL','json'));
  }
  static exportCSV(tree,scope='ALL',maxDepth=0) {
    const members=scopedMembers(tree,scope,maxDepth);
    // Raw fields remain separate; computed age is informational, not an override.
    const columns=[['Mã ID','id'],['Tên Thánh','christian_name'],['Họ và Tên','full_name'],['Giới Tính','gender'],['Thế Hệ','generation'],['Chi Ngành','branch'],['Nhánh Nội Ngoại','branch_type'],['Mã Cha Mẹ','parent_id'],['Vợ Chồng','spouse'],['Ngày Sinh','birth_date'],['Giỗ Âm Lịch','death_date'],['Ngày Mất Dương Lịch','death_date_solar'],['Hưởng Thọ Nhập Riêng','lifespan_override'],['Trạng Thái','status'],['Vai Trò','role'],['Ghi Chú','notes'],['Mã Vợ/Chồng','spouse_id'],['Thứ Tự Anh Em','sibling_order'],['Hưởng Thọ Tự Tính','computed_lifespan']];
    const cell=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
    const rows=[columns.map(c=>cell(c[0])).join(','),...members.map(m=>columns.map(c=>cell(c[1]==='computed_lifespan'?lifespanAge(m):m[c[1]])).join(','))];
    this.downloadBlob(new Blob(['\uFEFF'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}),this.filename('Du_Lieu',scope,'csv'));
  }
  static createMultiPagePdfBlob(images,page) {
    if(!images.length)throw new Error('PDF không có trang.');
    const parts=[],offsets=[0];let position=0;
    const append=value=>{const bytes=typeof value==='string'?new TextEncoder().encode(value):value;parts.push(bytes);position+=bytes.length;};
    const object=(id,body)=>{offsets[id]=position;append(`${id} 0 obj\n${body}\nendobj\n`);};
    append('%PDF-1.4\n');
    object(1,'<< /Type /Catalog /Pages 2 0 R >>');
    object(2,`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
    images.forEach((image,i)=>{
      const id=3+i*3, binary=atob(image.dataUrl.split(',')[1]);
      const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.w.toFixed(4)} ${page.h.toFixed(4)}] /Resources << /XObject << /Im ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
      offsets[id+1]=position;append(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);append(bytes);append('\nendstream\nendobj\n');
      const scale=Math.min(page.w/image.width,page.h/image.height),w=image.width*scale,h=image.height*scale;
      // PDF image space is a unit square: the transform uses drawn POINTS,
      // never the per-pixel scale (which previously shrank pages to a dot).
      const stream=`q\n${w.toFixed(4)} 0 0 ${h.toFixed(4)} ${((page.w-w)/2).toFixed(4)} ${((page.h-h)/2).toFixed(4)} cm\n/Im Do\nQ\n`;
      object(id+2,`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream`);
    });
    const xref=position,count=3+images.length*3;
    append(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for(let i=1;i<count;i++)append(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
    append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts,{type:'application/pdf'});
  }
  static escapeXml(value){return xml(value);}
  static getTimestamp(){const d=new Date();return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;}
  static filename(label,scope,extension){return `Gia_Pha_${label}_${scope.replace(/[^a-zA-Z0-9]/g,'_')}_${this.getTimestamp()}.${extension}`;}
  static downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
}
