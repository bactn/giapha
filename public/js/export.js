// export.js - High-Resolution Canvas 2D & SVG Engine supporting Tree/Branch Selection, PDF, PNG, Print & JSON
export class Exporter {

  static getExportLayout(treeCanvas, scope = 'ALL') {
    const dataStore = treeCanvas.dataStore;
    const layoutEngine = treeCanvas.layout;

    if (scope === 'CURRENT_VIEW') {
      return treeCanvas.layoutData;
    }
    return layoutEngine.calculateLayout(dataStore, scope);
  }

  static getScopeTitle(dataStore, scope = 'ALL') {
    if (scope === 'ALL') return 'Toàn Bộ Dòng Họ';
    if (scope === 'Chi 1') return 'Chi 1 (Thượng Chi - Nhánh Cụ Trần Ngọc Thanh)';
    if (scope === 'Chi 2') return 'Chi 2 (Hạ Chi - Nhánh Cụ Trần Ngọc Phúc)';
    if (scope === 'PATERNAL_ONLY') return 'Nhánh Nội Tộc (Họ Trần)';
    if (scope === 'MATERNAL_ONLY') return 'Nhánh Ngoại Tộc (Cháu Ngoại)';
    if (scope.startsWith('SUBTREE:')) {
      const id = scope.split(':')[1];
      const m = dataStore.getMember(id);
      return m ? `Nhánh Cụ ${m.full_name} (${m.id})` : 'Cành Nhánh Riêng';
    }
    return 'Bản Đồ Cây Gia Phả';
  }

  // 1. Direct Canvas 2D Drawing Engine (100% Reliable, never fails on XML/SVG parsing)
  static renderToCanvas2D(treeCanvas, scope = 'ALL', scale = 2) {
    const layout = this.getExportLayout(treeCanvas, scope);
    if (!layout || !layout.bounds || layout.positions.size === 0) {
      alert('Không có thành viên nào trong cành nhánh đã chọn để xuất.');
      return null;
    }

    const { minX, minY, width, height } = layout.bounds;
    const padding = 80;
    const headerHeight = 120;

    const baseWidth = Math.max(1000, width + padding * 2);
    const baseHeight = Math.max(700, height + padding * 2 + headerHeight);

    // Limit canvas width to 9000px for stability while keeping 2x crispness
    const targetScale = Math.min(scale, 9000 / baseWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(baseWidth * targetScale);
    canvas.height = Math.round(baseHeight * targetScale);

    const ctx = canvas.getContext('2d');
    ctx.scale(targetScale, targetScale);

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, baseWidth, baseHeight);

    // Draw Subtle Grid Dots
    ctx.fillStyle = '#cbd5e1';
    for (let x = 20; x < baseWidth; x += 26) {
      for (let y = 20; y < baseHeight; y += 26) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Title Banner
    const lineageName = treeCanvas.dataStore.lineageInfo.name || 'Gia Phả Dòng Họ';
    const scopeLabel = this.getScopeTitle(treeCanvas.dataStore, scope);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px "Playfair Display", Georgia, serif';
    ctx.fillText(lineageName, baseWidth / 2, 50);

    ctx.fillStyle = '#b45309';
    ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`• ${scopeLabel} •`, baseWidth / 2, 78);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Số lượng: ${layout.positions.size} thành viên • Bản vẽ xuất ngày ${new Date().toLocaleDateString('vi-VN')}`, baseWidth / 2, 102);

    // Coordinate shifts
    const shiftX = padding - minX;
    const shiftY = padding - minY + headerHeight;

    ctx.save();
    ctx.translate(shiftX, shiftY);

    const nw = treeCanvas.layout.nodeWidth;
    const nh = treeCanvas.layout.nodeHeight;

    // 1. Draw Links
    for (const link of layout.links) {
      const isChi1 = link.branch === 'Chi 1';
      const isChi2 = link.branch === 'Chi 2';

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isChi1 ? '#2563eb' : (isChi2 ? '#059669' : '#64748b');

      const pathData = treeCanvas.layout.generatePath(link);
      const s = pathData.startPoint;
      const e = pathData.endPoint;

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      if (treeCanvas.layout.orientation === 'VERTICAL') {
        const midY = (s.y + e.y) / 2;
        ctx.bezierCurveTo(s.x, midY, e.x, midY, e.x, e.y);
      } else {
        const midX = (s.x + e.x) / 2;
        ctx.bezierCurveTo(midX, s.y, midX, e.y, e.x, e.y);
      }
      ctx.stroke();

      // Connector port dots
      ctx.fillStyle = isChi1 ? '#2563eb' : (isChi2 ? '#059669' : '#475569');
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.arc(e.x, e.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Draw Nodes
    for (const [id, pos] of layout.positions.entries()) {
      const m = pos.member;
      const isMale = m.gender === 'Nam';
      const isDichTon = m.role === 'Đích Tôn';

      const x = pos.x;
      const y = pos.y;

      // Card Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      this.fillRoundRect(ctx, x + 2, y + 4, nw, nh, 12);

      // Card Background
      ctx.fillStyle = '#ffffff';
      this.fillRoundRect(ctx, x, y, nw, nh, 12);

      // Border
      ctx.lineWidth = isDichTon ? 3 : 1.5;
      ctx.strokeStyle = isDichTon ? '#f59e0b' : (isMale ? '#2563eb' : '#e11d48');
      this.strokeRoundRect(ctx, x, y, nw, nh, 12);

      // Top color banner
      ctx.fillStyle = isMale ? '#dbeafe' : '#ffe4e6';
      this.fillRoundRect(ctx, x + 1, y + 1, nw - 2, 24, [11, 11, 0, 0]);

      // Header text
      ctx.textAlign = 'left';
      ctx.fillStyle = isMale ? '#1e40af' : '#9f1239';
      ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`Đời ${m.generation} • ${m.branch || 'Ngành II'}`, x + 8, y + 16);

      if (isDichTon) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#d97706';
        ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('👑 ĐÍCH TÔN', x + nw - 8, y + 16);
      }

      // Avatar circle
      const avX = x + 22;
      const avY = y + 54;
      ctx.fillStyle = isMale ? '#eff6ff' : '#fff1f2';
      ctx.beginPath();
      ctx.arc(avX, avY, 14, 0, Math.PI * 2);
      ctx.fill();

      // Initials
      const initials = m.full_name.split(' ').map(w => w[0]).slice(-2).join('');
      ctx.textAlign = 'center';
      ctx.fillStyle = isMale ? '#1d4ed8' : '#be123c';
      ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(initials, avX, avY + 3.5);

      // Member text info
      ctx.textAlign = 'left';
      let textY = y + 44;

      if (m.christian_name) {
        ctx.fillStyle = '#d97706';
        ctx.font = 'bold 9.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`[${m.christian_name}]`, x + 44, textY);
        textY += 15;
      }

      // Full Name
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 12.5px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(m.full_name, x + 44, textY);

      // Birth - Death
      const dates = `${m.birth_date || ''} ${m.death_date ? '• ' + m.death_date : ''}`.trim();
      if (dates) {
        ctx.fillStyle = '#64748b';
        ctx.font = '10px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(dates, x + 44, textY + 14);
      }

      // Spouse
      if (m.spouse) {
        ctx.fillStyle = '#f8fafc';
        this.fillRoundRect(ctx, x + 1, y + nh - 20, nw - 2, 19, [0, 0, 11, 11]);
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + nh - 20);
        ctx.lineTo(x + nw - 1, y + nh - 20);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '9.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`⚭ ${m.spouse}`, x + 8, y + nh - 7);
      }
    }

    ctx.restore();

    return { canvas, width: canvas.width, height: canvas.height, scopeLabel };
  }

  // 2. Export to PNG File
  static exportPNG(treeCanvas, scope = 'ALL') {
    const rendered = this.renderToCanvas2D(treeCanvas, scope, 2);
    if (!rendered) return;

    rendered.canvas.toBlob((blob) => {
      if (blob) {
        const cleanScope = scope.replace(/[^a-zA-Z0-9]/g, '_');
        this.downloadBlob(blob, `Cay_Gia_Pha_${cleanScope}_${this.getTimestamp()}.png`);
      } else {
        alert('Lỗi tạo file ảnh PNG.');
      }
    }, 'image/png');
  }

  // 3. Export to Standalone PDF Document (.pdf)
  static exportPDF(treeCanvas, scope = 'ALL', paperSize = 'AUTO') {
    const rendered = this.renderToCanvas2D(treeCanvas, scope, 1.8);
    if (!rendered) return;

    const jpegDataUrl = rendered.canvas.toDataURL('image/jpeg', 0.92);
    const pdfBlob = this.createPdfBlobFromJpeg(jpegDataUrl, rendered.width, rendered.height, paperSize);

    const cleanScope = scope.replace(/[^a-zA-Z0-9]/g, '_');
    this.downloadBlob(pdfBlob, `Cay_Gia_Pha_${cleanScope}_${this.getTimestamp()}.pdf`);
  }

  // 4. Print Tree directly or Save as PDF via Browser Dialog
  static printTree(treeCanvas, scope = 'ALL') {
    const rendered = this.renderToCanvas2D(treeCanvas, scope, 1.5);
    if (!rendered) return;

    const imgDataUrl = rendered.canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Trình duyệt đang chặn cửa sổ pop-up. Vui lòng cho phép mở pop-up để in ấn.');
      return;
    }

    const title = `${treeCanvas.dataStore.lineageInfo.name} - ${rendered.scopeLabel}`;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: landscape; margin: 10mm; }
          body { margin: 0; padding: 12px; text-align: center; font-family: sans-serif; background: #fff; }
          img { max-width: 100%; height: auto; display: block; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          @media print {
            body { padding: 0; background: none; }
            img { box-shadow: none; max-width: 100%; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <img src="${imgDataUrl}" />
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  // 5. Export to Vector SVG (.svg)
  static exportSVG(treeCanvas, scope = 'ALL') {
    const layout = this.getExportLayout(treeCanvas, scope);
    if (!layout || !layout.bounds || layout.positions.size === 0) {
      alert('Không có thành viên nào trong cành nhánh đã chọn để xuất SVG.');
      return;
    }

    const { minX, minY, width, height } = layout.bounds;
    const padding = 100;
    const headerHeight = 120;

    const svgWidth = Math.max(1200, width + padding * 2);
    const svgHeight = Math.max(800, height + padding * 2 + headerHeight);
    const shiftX = padding - minX;
    const shiftY = padding - minY + headerHeight;

    const lineageName = this.escapeXml(treeCanvas.dataStore.lineageInfo.name || 'Gia Phả');
    const scopeLabel = this.escapeXml(this.getScopeTitle(treeCanvas.dataStore, scope));

    let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <style>
    text { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .tree-link { fill: none; stroke: #64748b; stroke-width: 2.5px; stroke-linecap: round; stroke-linejoin: round; }
    .tree-link-chi-1 { stroke: #2563eb; }
    .tree-link-chi-2 { stroke: #059669; }
    .tree-port { fill: #475569; stroke: #ffffff; stroke-width: 1.5px; }
    .node-rect { rx: 12; ry: 12; fill: #ffffff; stroke: #cbd5e1; stroke-width: 1.5px; }
    .rect-male { stroke: #2563eb; stroke-width: 2px; }
    .rect-female { stroke: #e11d48; stroke-width: 2px; }
    .rect-dich-ton { stroke: #f59e0b; stroke-width: 3px; }
  </style>
  <rect width="100%" height="100%" fill="#f8fafc" />

  <g transform="translate(${svgWidth / 2}, 45)">
    <text font-size="28" font-weight="bold" fill="#0f172a" text-anchor="middle" font-family="Playfair Display, Georgia, serif">
      ${lineageName}
    </text>
    <text y="28" font-size="16" font-weight="bold" fill="#b45309" text-anchor="middle">
      • ${scopeLabel} •
    </text>
    <text y="52" font-size="13" fill="#64748b" text-anchor="middle">
      Số lượng: ${layout.positions.size} thành viên • Bản vẽ xuất ngày ${new Date().toLocaleDateString('vi-VN')}
    </text>
  </g>

  <g transform="translate(${shiftX}, ${shiftY})">
`;

    // Links
    for (const link of layout.links) {
      const pathData = treeCanvas.layout.generatePath(link);
      const pathStr = (typeof pathData === 'string') ? pathData : pathData.path;
      let branchClass = 'tree-link';
      if (link.branch === 'Chi 1') branchClass += ' tree-link-chi-1';
      else if (link.branch === 'Chi 2') branchClass += ' tree-link-chi-2';

      svg += `    <path d="${pathStr}" class="${branchClass}" />\n`;
      if (pathData.startPoint && pathData.endPoint) {
        svg += `    <circle cx="${pathData.startPoint.x}" cy="${pathData.startPoint.y}" r="3.5" class="tree-port" />\n`;
        svg += `    <circle cx="${pathData.endPoint.x}" cy="${pathData.endPoint.y}" r="3.5" class="tree-port" />\n`;
      }
    }

    // Nodes
    const nw = treeCanvas.layout.nodeWidth;
    const nh = treeCanvas.layout.nodeHeight;

    for (const [id, pos] of layout.positions.entries()) {
      const m = pos.member;
      const isMale = m.gender === 'Nam';
      const isDichTon = m.role === 'Đích Tôn';
      let borderClass = isMale ? 'rect-male' : 'rect-female';
      if (isDichTon) borderClass = 'rect-dich-ton';

      const nx = pos.x;
      const ny = pos.y;
      const headerFill = isMale ? '#dbeafe' : '#ffe4e6';
      const headerTextFill = isMale ? '#1e40af' : '#9f1239';

      svg += `
    <g transform="translate(${nx}, ${ny})">
      <rect width="${nw}" height="${nh}" class="node-rect ${borderClass}" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.06))" />
      <rect width="${nw}" height="24" rx="12" ry="12" fill="${headerFill}" />
      <rect y="12" width="${nw}" height="12" fill="${headerFill}" />
      <text x="10" y="16" font-size="10" font-weight="bold" fill="${headerTextFill}">Đời ${m.generation} • ${this.escapeXml(m.branch || 'Ngành II')}</text>
      ${isDichTon ? `<text x="${nw - 10}" y="16" font-size="9" font-weight="bold" fill="#d97706" text-anchor="end">DICH TON</text>` : ''}
      
      ${m.christian_name ? `<text x="10" y="42" font-size="9.5" font-weight="bold" fill="#d97706">[${this.escapeXml(m.christian_name)}]</text>` : ''}
      <text x="10" y="${m.christian_name ? 58 : 48}" font-size="12.5" font-weight="bold" fill="#0f172a">${this.escapeXml(m.full_name)}</text>
      <text x="10" y="${m.christian_name ? 74 : 64}" font-size="10" fill="#64748b">${this.escapeXml(m.birth_date || '')} ${m.death_date ? '• ' + this.escapeXml(m.death_date) : ''}</text>
      ${m.spouse ? `<text x="10" y="${nh - 10}" font-size="9.5" fill="#78716c">⚭ ${this.escapeXml(m.spouse)}</text>` : ''}
    </g>
`;
    }

    svg += `  </g>\n</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const cleanScope = scope.replace(/[^a-zA-Z0-9]/g, '_');
    this.downloadBlob(blob, `Cay_Gia_Pha_${cleanScope}_${this.getTimestamp()}.svg`);
  }

  // 6. PDF 1.4 Binary Generator
  static createPdfBlobFromJpeg(jpegDataUrl, imgWidth, imgHeight, paperSize = 'AUTO') {
    const base64 = jpegDataUrl.split(',')[1];
    const binaryStr = atob(base64);
    const jpegBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      jpegBytes[i] = binaryStr.charCodeAt(i);
    }

    // Standard paper dimensions in points (72 points = 1 inch)
    const paperDims = {
      'A0': { w: 3370, h: 2384 },
      'A1': { w: 2384, h: 1684 },
      'A2': { w: 1684, h: 1191 },
      'A3': { w: 1191, h: 842 },
      'A4': { w: 842, h: 595 }
    };

    let widthPt, heightPt;

    if (paperSize && paperDims[paperSize]) {
      const dim = paperDims[paperSize];
      // Landscape orientation
      widthPt = Math.max(dim.w, dim.h);
      heightPt = Math.min(dim.w, dim.h);
    } else {
      // Auto fit proportional
      const maxDimPt = 2200;
      if (imgWidth >= imgHeight) {
        widthPt = maxDimPt;
        heightPt = Math.round((imgHeight / imgWidth) * maxDimPt);
      } else {
        heightPt = maxDimPt;
        widthPt = Math.round((imgWidth / imgHeight) * maxDimPt);
      }
    }

    const pdfParts = [];
    const offsets = [];

    const append = (strOrBytes) => {
      const bytes = (typeof strOrBytes === 'string') ? new TextEncoder().encode(strOrBytes) : strOrBytes;
      pdfParts.push(bytes);
    };

    const getPos = () => pdfParts.reduce((acc, p) => acc + p.length, 0);

    append('%PDF-1.4\n');

    // Obj 1: Catalog
    offsets.push(getPos());
    append('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // Obj 2: Pages
    offsets.push(getPos());
    append('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    // Obj 3: Page
    offsets.push(getPos());
    append(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);

    // Obj 4: Image XObject
    offsets.push(getPos());
    append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
    append(jpegBytes);
    append('\nendstream\nendobj\n');

    // Obj 5: Page Content stream
    offsets.push(getPos());
    const content = `q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im1 Do\nQ\n`;
    append(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

    // XRef
    const startXref = getPos();
    append('xref\n0 6\n0000000000 65535 f \n');
    for (const off of offsets) {
      append(String(off).padStart(10, '0') + ' 00000 n \n');
    }

    // Trailer
    append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

    return new Blob(pdfParts, { type: 'application/pdf' });
  }

  static fillRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.fill();
  }

  static strokeRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.stroke();
  }

  static escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  static getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  }

  static downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}
