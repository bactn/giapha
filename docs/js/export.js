// export.js - High-Resolution Canvas 2D & SVG Engine supporting Tree/Branch Selection, PDF, PNG, Print & JSON
// Supports A4-optimized vertical export templates for proper printing
import { lifeDates, spouseRole, avatarSVG, drawAvatar } from './member-presentation.js';
function spouseCaption(member,store) {
  const partner=store?.getSpouseMember(member.id); const name=partner?.full_name || member.spouse;
  return name ? `${spouseRole(member,partner)}: ${name}` : '';
}
export class Exporter {

  // A4 dimensions in points (72pt = 1 inch): 595 x 842 (portrait), 842 x 595 (landscape)
  static A4 = {
    portrait: { w: 595, h: 842 },
    landscape: { w: 842, h: 595 }
  };

  // A4 layout config: margins and node sizing for A4 landscape - Compact Card
  static A4_CONFIG_CARD = {
    marginTop: 40,
    marginBottom: 30,
    marginLeft: 20,
    marginRight: 20,
    nodeWidth: 110,
    nodeHeight: 36,
    siblingGap: 4,
    generationGap: 46
  };

  // A4 layout config: Table-style rendering (no tree, just data rows) - Portrait
  static A4_CONFIG_TABLE = {
    marginTop: 35,
    marginBottom: 25,
    marginLeft: 20,
    marginRight: 20,
    rowHeight: 16,
    headerHeight: 18,
    fontSize: 8
  };

  static getExportLayout(treeCanvas, scope = 'ALL', maxDepth = 0) {
    const dataStore = treeCanvas.dataStore;
    const layoutEngine = treeCanvas.layout;

    if (scope === 'CURRENT_VIEW') {
      return treeCanvas.layoutData;
    }
    return layoutEngine.calculateLayout(dataStore, scope, maxDepth);
  }

  // Create a vertical (top-to-bottom) layout optimized for A4 portrait
  static getA4VerticalLayout(treeCanvas, scope = 'ALL', maxDepth = 0) {
    const dataStore = treeCanvas.dataStore;
    const cfg = this.A4_CONFIG_CARD;

    // Create a vertical layout engine with A4-optimized spacing
    const layoutEngine = new (treeCanvas.layout.constructor)({
      nodeWidth: cfg.nodeWidth,
      nodeHeight: cfg.nodeHeight,
      siblingGap: cfg.siblingGap,
      generationGap: cfg.generationGap,
      orientation: 'VERTICAL'
    });

    return layoutEngine.calculateLayout(dataStore, scope, maxDepth);
  }

  // Paginate layout positions for A4 landscape pages (Card layout)
  // Uses landscape to accommodate wide generations, splits by height
  static paginateForA4(layout, cfg = this.A4_CONFIG_CARD) {
    if (!layout || !layout.bounds || layout.positions.size === 0) return [];

    // Use landscape for card layout to fit wide generations
    const pageW = this.A4.landscape.w - cfg.marginLeft - cfg.marginRight;
    const pageH = this.A4.landscape.h - cfg.marginTop - cfg.marginBottom;

    // Group members by generation
    const genGroups = new Map();
    for (const [id, pos] of layout.positions.entries()) {
      const gen = pos.member.generation;
      if (!genGroups.has(gen)) genGroups.set(gen, []);
      genGroups.get(gen).push({ id, pos, member: pos.member });
    }

    // Sort generations
    const sortedGens = Array.from(genGroups.keys()).sort((a, b) => parseInt(a) - parseInt(b));

    const pages = [];
    let currentPage = { members: [], links: [], maxY: cfg.marginTop };
    let currentGenIdx = 0;

    while (currentGenIdx < sortedGens.length) {
      const gen = sortedGens[currentGenIdx];
      const members = genGroups.get(gen);

      // Calculate height needed for this generation
      const genHeight = cfg.nodeHeight;

      // Check if this generation fits on current page (by height)
      if (currentPage.members.length > 0 && currentPage.maxY + cfg.generationGap + genHeight > pageH + cfg.marginTop) {
        // Start new page
        pages.push(currentPage);
        currentPage = { members: [], links: [], maxY: cfg.marginTop };
      }

      // Add members of this generation
      for (const m of members) {
        currentPage.members.push(m);
      }

      // Add links from previous generation to this generation
      if (currentPage.members.length > 0 && currentGenIdx > 0) {
        const prevGen = sortedGens[currentGenIdx - 1];
        const prevMembers = genGroups.get(prevGen);
        for (const link of layout.links) {
          const parentInPrev = prevMembers.some(pm => pm.id === link.parent_id);
          const childInCurr = members.some(cm => cm.id === link.child_id);
          if (parentInPrev && childInCurr) {
            currentPage.links.push(link);
          }
        }
      }

      currentPage.maxY += cfg.generationGap + genHeight;
      currentGenIdx++;
    }

    if (currentPage.members.length > 0) {
      pages.push(currentPage);
    }

    return pages;
  }

  // Paginate for table-style A4 layout (simple row-based pagination) - Landscape
  static paginateForA4Table(dataStore, scope = 'ALL', maxDepth = 0) {
    const allMembers = dataStore.getAllMembers();
    let visibleMembers = allMembers;

    if (typeof scope === 'string' && scope.startsWith('SUBTREE:')) {
      const rootId = scope.split(':')[1];
      const rootMember = dataStore.getMember(rootId);
      if (rootMember) {
        const descendants = dataStore.getDescendants(rootId);
        descendants.add(rootId);
        visibleMembers = allMembers.filter(m => descendants.has(m.id));
      }
    } else if (scope === 'Chi 1') {
      visibleMembers = allMembers.filter(m => m.branch === 'Chi 1' || m.branch === 'Ngành II');
    } else if (scope === 'Chi 2') {
      visibleMembers = allMembers.filter(m => m.branch === 'Chi 2' || m.branch === 'Ngành II');
    } else if (scope === 'PATERNAL_ONLY') {
      visibleMembers = allMembers.filter(m => m.branch_type && m.branch_type.includes('Nội tộc'));
    } else if (scope === 'MATERNAL_ONLY') {
      visibleMembers = allMembers.filter(m => m.branch_type && m.branch_type.includes('Ngoại tộc'));
    }

    // Apply depth filter
    if (maxDepth > 0) {
      let minGen = Infinity;
      for (const m of visibleMembers) {
        const g = parseInt(m.generation, 10);
        if (!isNaN(g) && g < minGen) minGen = g;
      }
      if (minGen === Infinity) minGen = 1;
      visibleMembers = visibleMembers.filter(m => {
        const g = parseInt(m.generation, 10);
        return !isNaN(g) && (g - minGen + 1) <= maxDepth;
      });
    }

    // Sort by generation, then by ID
    visibleMembers.sort((a, b) => {
      const genDiff = (parseInt(a.generation, 10) || 1) - (parseInt(b.generation, 10) || 1);
      if (genDiff !== 0) return genDiff;
      return a.id.localeCompare(b.id);
    });

    const cfg = this.A4_CONFIG_TABLE;
    // Use landscape for table layout
    const pageH = this.A4.landscape.h - cfg.marginTop - cfg.marginBottom;
    const usableH = pageH - cfg.headerHeight;
    const rowsPerPage = Math.floor(usableH / cfg.rowHeight);

    const pages = [];
    for (let i = 0; i < visibleMembers.length; i += rowsPerPage) {
      pages.push(visibleMembers.slice(i, i + rowsPerPage));
    }

    return pages;
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
  static renderToCanvas2D(treeCanvas, scope = 'ALL', scale = 2, maxDepth = 0) {
    const layout = this.getExportLayout(treeCanvas, scope, maxDepth);
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

      drawAvatar(ctx,m.gender,avX,avY,14);

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
      const dates = lifeDates(m);
      if (dates) {
        ctx.fillStyle = '#64748b';
        ctx.font = '9.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(dates, x + 44, textY + 14,nw-52);
      }

      // Spouse
      if (spouseCaption(m,treeCanvas.dataStore)) {
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
        ctx.fillText(spouseCaption(m,treeCanvas.dataStore), x + 8, y + nh - 7);
      }
    }

    ctx.restore();

    return { canvas, width: canvas.width, height: canvas.height, scopeLabel };
  }

  // 2. Export to PNG File
  static exportPNG(treeCanvas, scope = 'ALL', maxDepth = 0) {
    const rendered = this.renderToCanvas2D(treeCanvas, scope, 2, maxDepth);
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
  static exportPDF(treeCanvas, scope = 'ALL', paperSize = 'AUTO', maxDepth = 0) {
    const rendered = this.renderToCanvas2D(treeCanvas, scope, 1.8, maxDepth);
    if (!rendered) return;

    const jpegDataUrl = rendered.canvas.toDataURL('image/jpeg', 0.92);
    const pdfBlob = this.createPdfBlobFromJpeg(jpegDataUrl, rendered.width, rendered.height, paperSize);

    const cleanScope = scope.replace(/[^a-zA-Z0-9]/g, '_');
    this.downloadBlob(pdfBlob, `Cay_Gia_Pha_${cleanScope}_${this.getTimestamp()}.pdf`);
  }

  // 4. Print Tree directly or Save as PDF via Browser Dialog
  static printTree(treeCanvas, scope = 'ALL', maxDepth = 0) {
    const rendered = this.renderToCanvas2D(treeCanvas, scope, 1.5, maxDepth);
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
  static exportSVG(treeCanvas, scope = 'ALL', maxDepth = 0) {
    const layout = this.getExportLayout(treeCanvas, scope, maxDepth);
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
      
      ${avatarSVG(m.gender).replace('<svg ','<svg x="10" y="33" width="28" height="28" ')}
      ${m.christian_name ? `<text x="44" y="42" font-size="9.5" font-weight="bold" fill="#d97706">[${this.escapeXml(m.christian_name)}]</text>` : ''}
      <text x="44" y="${m.christian_name ? 58 : 48}" font-size="12.5" font-weight="bold" fill="#0f172a">${this.escapeXml(m.full_name)}</text>
      <text x="44" y="${m.christian_name ? 74 : 64}" font-size="9.5" fill="#64748b">${this.escapeXml(lifeDates(m))}</text>
      ${spouseCaption(m,treeCanvas.dataStore) ? `<text x="10" y="${nh - 10}" font-size="9.5" fill="#78716c">${this.escapeXml(spouseCaption(m,treeCanvas.dataStore))}</text>` : ''}
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
      // Auto fit proportional - use landscape A3 as default for wide genealogy trees
      const maxDimPt = 2200;
      if (imgWidth >= imgHeight) {
        widthPt = maxDimPt;
        heightPt = Math.round((imgHeight / imgWidth) * maxDimPt);
      } else {
        heightPt = maxDimPt;
        widthPt = Math.round((imgWidth / imgHeight) * maxDimPt);
      }
    }

    // Calculate scale to fit image within page while maintaining aspect ratio
    const scaleX = widthPt / imgWidth;
    const scaleY = heightPt / imgHeight;
    const fitScale = Math.min(scaleX, scaleY);
    const drawnW = Math.round(imgWidth * fitScale);
    const drawnH = Math.round(imgHeight * fitScale);
    // Center the image on the page
    const offsetX = Math.round((widthPt - drawnW) / 2);
    const offsetY = Math.round((heightPt - drawnH) / 2);

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

    // Obj 5: Page Content stream - fit image within page, centered, maintaining aspect ratio
    offsets.push(getPos());
    const content = `q\n${fitScale.toFixed(6)} 0 0 ${fitScale.toFixed(6)} ${offsetX} ${offsetY} cm\n/Im1 Do\nQ\n`;
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

  // ========== A4-Optimized Export Methods ==========

  // Draw A4 page header (shared by card and table templates)
  static drawA4Header(ctx, pageW, lineageName, scopeLabel, pageNum, totalPages) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px "Playfair Display", Georgia, serif';
    ctx.fillText(lineageName, pageW / 2, 22);

    ctx.fillStyle = '#b45309';
    ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`• ${scopeLabel} •`, pageW / 2, 36);

    ctx.fillStyle = '#64748b';
    ctx.font = '7.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Trang ${pageNum}/${totalPages} • ${new Date().toLocaleDateString('vi-VN')}`, pageW / 2, 48);

    // Separator line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(15, 54);
    ctx.lineTo(pageW - 15, 54);
    ctx.stroke();
  }

  // Render A4 page - Compact Card layout (landscape, auto-scaled for wide generations)
  static renderA4PageCard(treeCanvas, pageData, pageNum, totalPages, scope = 'ALL') {
    const cfg = this.A4_CONFIG_CARD;
    // Use landscape for card layout - more horizontal space for wide generations
    const pageW = this.A4.landscape.w;
    const pageH = this.A4.landscape.h;

    const members = pageData.members;
    const links = pageData.links;

    if (members.length === 0) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(pageW * 2);
      canvas.height = Math.round(pageH * 2);
      return { canvas, width: canvas.width, height: canvas.height, scopeLabel: '' };
    }

    // Group by generation
    const genGroups = new Map();
    for (const m of members) {
      const gen = m.member.generation;
      if (!genGroups.has(gen)) genGroups.set(gen, []);
      genGroups.get(gen).push(m);
    }
    const sortedGens = Array.from(genGroups.keys()).sort((a, b) => parseInt(a) - parseInt(b));

    // Calculate natural width needed (widest generation)
    const contentW = pageW - cfg.marginLeft - cfg.marginRight;
    let maxGenWidth = 0;
    for (const genMembers of genGroups.values()) {
      const totalW = genMembers.length * cfg.nodeWidth + (genMembers.length - 1) * cfg.siblingGap;
      if (totalW > maxGenWidth) maxGenWidth = totalW;
    }

    // Auto-scale if generation is wider than page
    let scaleX = 1;
    if (maxGenWidth > contentW) {
      scaleX = contentW / maxGenWidth;
    }

    // Calculate natural height
    const naturalHeight = cfg.marginTop + (sortedGens.length - 1) * cfg.generationGap + cfg.nodeHeight + cfg.marginBottom;
    let scaleY = 1;
    if (naturalHeight > pageH) {
      scaleY = pageH / naturalHeight;
    }

    // Use the smaller scale to fit both dimensions
    const fitScale = Math.min(scaleX, scaleY, 1);

    // Create canvas at landscape A4 size with 2x resolution
    const canvas = document.createElement('canvas');
    const renderScale = 2;
    canvas.width = Math.round(pageW * renderScale);
    canvas.height = Math.round(pageH * renderScale);

    const ctx = canvas.getContext('2d');
    ctx.scale(renderScale, renderScale);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageW, pageH);

    const lineageName = treeCanvas.dataStore.lineageInfo.name || 'Gia Phả Dòng Họ';
    const scopeLabel = this.getScopeTitle(treeCanvas.dataStore, scope);
    this.drawA4Header(ctx, pageW, lineageName, scopeLabel, pageNum, totalPages);

    // Apply fit scale for content
    // Adjust translation so scaled content stays centered within the content area
    ctx.save();
    const translationX = cfg.marginLeft + contentW * (1 - fitScale) / 2;
    ctx.translate(translationX, cfg.marginTop);
    ctx.scale(fitScale, fitScale);

    // Calculate positions - center each generation row
    const positions = new Map();

    for (let gi = 0; gi < sortedGens.length; gi++) {
      const genMembers = genGroups.get(sortedGens[gi]);
      const totalW = genMembers.length * cfg.nodeWidth + (genMembers.length - 1) * cfg.siblingGap;
      const startX = (contentW - totalW) / 2;
      const y = gi * cfg.generationGap;

      for (let mi = 0; mi < genMembers.length; mi++) {
        const m = genMembers[mi];
        const x = startX + mi * (cfg.nodeWidth + cfg.siblingGap);
        positions.set(m.id, { x, y, member: m.member });
      }
    }

    // Draw Links (thin lines)
    for (const link of links) {
      const parentPos = positions.get(link.parent_id);
      const childPos = positions.get(link.child_id);
      if (!parentPos || !childPos) continue;

      const isChi1 = link.branch === 'Chi 1';
      const isChi2 = link.branch === 'Chi 2';

      ctx.lineWidth = 0.8;
      ctx.strokeStyle = isChi1 ? '#3b82f6' : (isChi2 ? '#10b981' : '#cbd5e1');

      const sx = parentPos.x + cfg.nodeWidth / 2;
      const sy = parentPos.y + cfg.nodeHeight;
      const ex = childPos.x + cfg.nodeWidth / 2;
      const ey = childPos.y;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      const midY = (sy + ey) / 2;
      ctx.bezierCurveTo(sx, midY, ex, midY, ex, ey);
      ctx.stroke();
    }

    // Draw Nodes - Compact cards
    for (const [id, pos] of positions.entries()) {
      const m = pos.member;
      const isMale = m.gender === 'Nam';
      const isDichTon = m.role === 'Đích Tôn';
      const x = pos.x;
      const y = pos.y;
      const nw = cfg.nodeWidth;
      const nh = cfg.nodeHeight;

      // Card background
      ctx.fillStyle = '#ffffff';
      this.fillRoundRect(ctx, x, y, nw, nh, 3);

      // Border - left colored bar
      ctx.fillStyle = isMale ? '#3b82f6' : '#e11d48';
      ctx.fillRect(x, y, 3, nh);

      // Outer border
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = isDichTon ? '#f59e0b' : '#e2e8f0';
      this.strokeRoundRect(ctx, x, y, nw, nh, 3);

      // Generation badge
      ctx.fillStyle = isMale ? '#dbeafe' : '#ffe4e6';
      ctx.fillRect(x + 4, y + 2, 18, 10);
      ctx.fillStyle = isMale ? '#1e40af' : '#9f1239';
      ctx.font = 'bold 6.5px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Đ${m.generation}`, x + 13, y + 10);

      // Name
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 8px "Plus Jakarta Sans", sans-serif';
      const nameX = x + 26;
      ctx.fillText(m.full_name, nameX, y + 10);

      // Dates
      const dates = lifeDates(m);
      if (dates) {
        ctx.fillStyle = '#64748b';
        ctx.font = '6.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(dates, nameX, y + 19);
      }

      // Spouse (if fits)
      if (spouseCaption(m,treeCanvas.dataStore)) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '6px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(spouseCaption(m,treeCanvas.dataStore), nameX, y + nh - 3);
      }

      // Đích Tôn badge
      if (isDichTon) {
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(x + nw - 32, y + 2, 28, 10);
        ctx.fillStyle = '#d97706';
        ctx.font = 'bold 6px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ĐT', x + nw - 18, y + 10);
      }
    }

    // Restore from fit scale
    ctx.restore();

    // Scale indicator if scaled down
    if (fitScale < 1) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '7px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Tỷ lệ: ${Math.round(fitScale * 100)}%`, pageW - 15, pageH - 10);
    }

    return { canvas, width: canvas.width, height: canvas.height, scopeLabel };
  }

  // Render A4 page - Table layout (maximum data density, no tree graphics) - Landscape
  static renderA4PageTable(treeCanvas, pageData, pageNum, totalPages, scope = 'ALL') {
    const cfg = this.A4_CONFIG_TABLE;
    // Use landscape for table to fit all columns
    const pageW = this.A4.landscape.w;
    const pageH = this.A4.landscape.h;

    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = Math.round(pageW * scale);
    canvas.height = Math.round(pageH * scale);

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageW, pageH);

    const lineageName = treeCanvas.dataStore.lineageInfo.name || 'Gia Phả Dòng Họ';
    const scopeLabel = this.getScopeTitle(treeCanvas.dataStore, scope);
    this.drawA4Header(ctx, pageW, lineageName, scopeLabel, pageNum, totalPages);

    const members = pageData; // already paginated array of members
    if (members.length === 0) return { canvas, width: canvas.width, height: canvas.height, scopeLabel };

    // Column widths - optimized for landscape A4
    const colGen = 22;
    const colGender = 16;
    const colName = 150;
    const colDates = 100;
    const colSpouse = 120;
    const colBranch = 80;
    const colRole = 50;
    const colPadding = 5;
    const totalColW = colGen + colGender + colName + colDates + colSpouse + colBranch + colRole + colPadding * 8;

    const startX = cfg.marginLeft;
    let y = cfg.marginTop;

    // Column headers
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(startX, y, totalColW, cfg.headerHeight);
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'left';

    let cx = startX + colPadding;
    ctx.fillText('Đời', cx, y + cfg.headerHeight - 5);
    cx += colGen;

    ctx.fillText('GĐ', cx, y + cfg.headerHeight - 5);
    cx += colGender;

    ctx.fillText('Họ và Tên', cx, y + cfg.headerHeight - 5);
    cx += colName;

    ctx.fillText('Sinh - Mất', cx, y + cfg.headerHeight - 5);
    cx += colDates;

    ctx.fillText('Vợ/Chồng', cx, y + cfg.headerHeight - 5);
    cx += colSpouse;

    ctx.fillText('Chi', cx, y + cfg.headerHeight - 5);
    cx += colBranch;

    ctx.fillText('Vai trò', cx, y + cfg.headerHeight - 5);

    // Header underline
    y += cfg.headerHeight;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + totalColW, y);
    ctx.stroke();

    // Data rows
    y += 2;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const isMale = m.gender === 'Nam';
      const isDichTon = m.role === 'Đích Tôn';

      // Alternate row background
      if (i % 2 === 0) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(startX, y, totalColW, cfg.rowHeight);
      }

      ctx.fillStyle = '#0f172a';
      ctx.font = `${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'left';

      cx = startX + colPadding;

      // Generation
      ctx.fillStyle = isMale ? '#1e40af' : '#9f1239';
      ctx.fillText(m.generation, cx, y + cfg.rowHeight - 4);
      cx += colGen;

      // Gender
      ctx.fillStyle = isMale ? '#3b82f6' : '#e11d48';
      ctx.fillText(isMale ? 'N' : 'Nữ', cx, y + cfg.rowHeight - 4);
      cx += colGender;

      // Name
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(m.full_name, cx, y + cfg.rowHeight - 4);
      ctx.font = `${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
      cx += colName;

      // Dates
      ctx.fillStyle = '#64748b';
      const dates = lifeDates(m);
      ctx.fillText(dates, cx, y + cfg.rowHeight - 4);
      cx += colDates;

      // Spouse
      ctx.fillStyle = '#64748b';
      ctx.fillText(spouseCaption(m,treeCanvas.dataStore), cx, y + cfg.rowHeight - 4);
      cx += colSpouse;

      // Branch
      ctx.fillStyle = '#475569';
      ctx.fillText(m.branch || '', cx, y + cfg.rowHeight - 4);
      cx += colBranch;

      // Role
      if (isDichTon) {
        ctx.fillStyle = '#d97706';
        ctx.font = `bold ${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillText('ĐT', cx, y + cfg.rowHeight - 4);
        ctx.font = `${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
      } else if (m.role) {
        ctx.fillStyle = '#475569';
        ctx.fillText(m.role, cx, y + cfg.rowHeight - 4);
      }

      y += cfg.rowHeight;
    }

    // Footer
    ctx.fillStyle = '#94a3b8';
    ctx.font = '6.5px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Tổng: ${members.length} thành viên trên trang này`, pageW / 2, pageH - 12);

    return { canvas, width: canvas.width, height: canvas.height, scopeLabel };
  }

  // Export A4 PDF - with template selection (both use landscape)
  static exportA4PDF(treeCanvas, scope = 'ALL', template = 'card', maxDepth = 0) {
    const lineageName = treeCanvas.dataStore.lineageInfo.name || 'Gia Phả';
    const scopeLabel = this.getScopeTitle(treeCanvas.dataStore, scope);
    let pages = [];
    let pageImages = [];

    if (template === 'table') {
      // Table layout
      pages = this.paginateForA4Table(treeCanvas.dataStore, scope, maxDepth);
      if (pages.length === 0) {
        alert('Không có dữ liệu để xuất.');
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const rendered = this.renderA4PageTable(treeCanvas, pages[i], i + 1, pages.length, scope);
        if (rendered) {
          const jpegDataUrl = rendered.canvas.toDataURL('image/jpeg', 0.92);
          pageImages.push({ dataUrl: jpegDataUrl, width: rendered.width, height: rendered.height });
        }
      }
    } else {
      // Card layout (default)
      const layout = this.getA4VerticalLayout(treeCanvas, scope, maxDepth);
      if (!layout || !layout.bounds || layout.positions.size === 0) {
        alert('Không có thành viên nào trong cành nhánh đã chọn để xuất.');
        return;
      }
      pages = this.paginateForA4(layout);
      if (pages.length === 0) {
        alert('Không có dữ liệu để xuất.');
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const rendered = this.renderA4PageCard(treeCanvas, pages[i], i + 1, pages.length, scope);
        if (rendered) {
          const jpegDataUrl = rendered.canvas.toDataURL('image/jpeg', 0.92);
          pageImages.push({ dataUrl: jpegDataUrl, width: rendered.width, height: rendered.height });
        }
      }
    }

    // Use landscape for both templates
    const pdfBlob = this.createMultiPagePdfBlob(pageImages, this.A4.landscape);
    const cleanScope = scope.replace(/[^a-zA-Z0-9]/g, '_');
    const templateLabel = template === 'table' ? 'Bang' : 'Cay';
    this.downloadBlob(pdfBlob, `Cay_Gia_Pha_A4_${templateLabel}_${cleanScope}_${this.getTimestamp()}.pdf`);
  }

  // Print A4 - with template selection (both use landscape)
  static printA4(treeCanvas, scope = 'ALL', template = 'card', maxDepth = 0) {
    const lineageName = treeCanvas.dataStore.lineageInfo.name || 'Gia Phả';
    const scopeLabel = this.getScopeTitle(treeCanvas.dataStore, scope);
    let pages = [];
    let pageImages = [];

    if (template === 'table') {
      pages = this.paginateForA4Table(treeCanvas.dataStore, scope, maxDepth);
      if (pages.length === 0) {
        alert('Không có dữ liệu để in.');
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const rendered = this.renderA4PageTable(treeCanvas, pages[i], i + 1, pages.length, scope);
        if (rendered) {
          const pngDataUrl = rendered.canvas.toDataURL('image/png');
          pageImages.push(pngDataUrl);
        }
      }
    } else {
      const layout = this.getA4VerticalLayout(treeCanvas, scope, maxDepth);
      if (!layout || !layout.bounds || layout.positions.size === 0) {
        alert('Không có thành viên nào trong cành nhánh đã chọn để in.');
        return;
      }
      pages = this.paginateForA4(layout);
      if (pages.length === 0) {
        alert('Không có dữ liệu để in.');
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const rendered = this.renderA4PageCard(treeCanvas, pages[i], i + 1, pages.length, scope);
        if (rendered) {
          const pngDataUrl = rendered.canvas.toDataURL('image/png');
          pageImages.push(pngDataUrl);
        }
      }
    }

    const title = `${treeCanvas.dataStore.lineageInfo.name} - ${scopeLabel}`;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Trình duyệt đang chặn cửa sổ pop-up. Vui lòng cho phép mở pop-up để in ấn.');
      return;
    }

    let imagesHtml = '';
    for (let i = 0; i < pageImages.length; i++) {
      imagesHtml += `<div class="a4-page"><img src="${pageImages[i]}" alt="Trang ${i + 1}" /></div>\n`;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: A4 landscape; margin: 0; }
          body { margin: 0; padding: 0; text-align: center; font-family: sans-serif; background: #fff; }
          .a4-page {
            width: 297mm;
            height: 210mm;
            page-break-after: always;
            display: flex;
            justify-content: center;
            align-items: flex-start;
          }
          .a4-page:last-child { page-break-after: auto; }
          .a4-page img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          @media print {
            body { padding: 0; background: none; }
            .a4-page { page-break-after: always; }
            .a4-page:last-child { page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        ${imagesHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  // Create multi-page PDF from JPEG images
  static createMultiPagePdfBlob(pageImages, pageSize) {
    const pdfParts = [];
    const offsets = [];

    const append = (strOrBytes) => {
      const bytes = (typeof strOrBytes === 'string') ? new TextEncoder().encode(strOrBytes) : strOrBytes;
      pdfParts.push(bytes);
    };

    const getPos = () => pdfParts.reduce((acc, p) => acc + p.length, 0);

    // Build image objects
    const imageObjs = [];

    for (let i = 0; i < pageImages.length; i++) {
      const base64 = pageImages[i].dataUrl.split(',')[1];
      const binaryStr = atob(base64);
      const jpegBytes = new Uint8Array(binaryStr.length);
      for (let j = 0; j < binaryStr.length; j++) {
        jpegBytes[j] = binaryStr.charCodeAt(j);
      }
      imageObjs.push({ bytes: jpegBytes, width: pageImages[i].width, height: pageImages[i].height });
    }

    append('%PDF-1.4\n');

    // Obj 1: Catalog
    offsets.push(getPos());
    append(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

    // Obj 2: Pages (will be patched later)
    const pagesObjOffset = getPos();
    offsets.push(pagesObjOffset);
    // Placeholder - we'll write the real content after calculating object indices
    append(`2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n`);

    // Obj 3: Resources (shared)
    offsets.push(getPos());
    const xObjectEntries = imageObjs.map((_, i) => `/Im${i} ${4 + i * 3} 0 R`).join(' ');
    append(`3 0 obj\n<< /XObject << ${xObjectEntries} >> >>\nendobj\n`);

    // Calculate object indices:
    // Obj 1 = Catalog
    // Obj 2 = Pages
    // Obj 3 = Resources
    // For each page i:
    //   Image XObject = 4 + i*3
    //   Content stream = 5 + i*3
    //   Page = 6 + i*3
    const kidsRefs = [];
    for (let i = 0; i < imageObjs.length; i++) {
      kidsRefs.push(`${6 + i * 3} 0 R`);
    }

    // Rewrite Pages object with correct kids
    const pagesContent = `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs.join(' ')}] /Count ${imageObjs.length} >>\nendobj\n`;

    // Image objects, content streams, and page objects
    for (let i = 0; i < imageObjs.length; i++) {
      const img = imageObjs[i];
      const imgObjNum = 4 + i * 3;
      const contentObjNum = 5 + i * 3;
      const pageObjNum = 6 + i * 3;

      // Image XObject
      offsets.push(getPos());
      append(`${imgObjNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
      append(img.bytes);
      append('\nendstream\nendobj\n');

      // Page Content stream - fit image within page, centered, maintaining aspect ratio
      offsets.push(getPos());
      const scaleX = pageSize.w / img.width;
      const scaleY = pageSize.h / img.height;
      const fitScale = Math.min(scaleX, scaleY);
      const drawnW = img.width * fitScale;
      const drawnH = img.height * fitScale;
      const offsetX = (pageSize.w - drawnW) / 2;
      const offsetY = (pageSize.h - drawnH) / 2;
      const content = `q\n${fitScale.toFixed(6)} 0 0 ${fitScale.toFixed(6)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm\n/Im${i} Do\nQ\n`;
      append(`${contentObjNum} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

      // Page object
      offsets.push(getPos());
      append(`${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSize.w} ${pageSize.h}] /Resources 3 0 R /Contents ${contentObjNum} 0 R >>\nendobj\n`);
    }

    // XRef
    const startXref = getPos();
    append(`xref\n0 ${6 + imageObjs.length * 3}\n0000000000 65535 f \n`);
    for (const off of offsets) {
      append(String(off).padStart(10, '0') + ' 00000 n \n');
    }

    // Trailer
    append(`trailer\n<< /Size ${6 + imageObjs.length * 3} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

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
