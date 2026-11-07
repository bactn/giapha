// excel-parser.js - CSV and Excel Client-Side Parser with 15-Column Mapping & Validation
export class ExcelParser {
  static parseCSV(text) {
    const lines = [];
    let row = [];
    let inQuotes = false;
    let field = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(field.trim());
        field = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        row.push(field.trim());
        if (row.some(cell => cell.length > 0)) {
          lines.push(row);
        }
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field.trim());
      if (row.some(cell => cell.length > 0)) {
        lines.push(row);
      }
    }
    return lines;
  }

  static normalizeColumnName(name) {
    return name
      .toLowerCase()
      .replace(/[_\s\-\/]/g, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  static parseGenealogyData(csvText) {
    const rawRows = this.parseCSV(csvText);
    if (rawRows.length < 2) {
      return {
        success: false,
        errors: ['File không có dữ liệu hoặc thiếu dòng tiêu đề!']
      };
    }

    // Find header row (skip preamble if file has intro rows)
    let headerIndex = -1;
    for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
      const rowNorm = rawRows[i].map(c => this.normalizeColumnName(c));
      if (rowNorm.some(c => c.includes('maid') || c.includes('id') || c.includes('hovaten') || c.includes('ten'))) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      headerIndex = 0; // Default to first row
    }

    const headers = rawRows[headerIndex];
    const colMap = {};

    headers.forEach((h, idx) => {
      const norm = this.normalizeColumnName(h);
      if (norm.includes('maid') || norm === 'id') colMap.id = idx;
      else if (norm.includes('tenthanh') || norm.includes('phapdanh')) colMap.christian_name = idx;
      else if (norm.includes('hovaten') || norm === 'ten' || norm.includes('hoten')) colMap.full_name = idx;
      else if (norm.includes('gioitinh') || norm === 'gioi') colMap.gender = idx;
      else if (norm.includes('thehe') || norm.includes('doi')) colMap.generation = idx;
      else if (norm.includes('chinganh') || norm.includes('chi') || norm.includes('nganh')) colMap.branch = idx;
      else if (norm.includes('nhanh') || norm.includes('noingoai') || norm.includes('chau')) colMap.branch_type = idx;
      else if (norm.includes('machame') || norm.includes('idcha') || norm.includes('cha') || norm.includes('parent')) colMap.parent_id = idx;
      else if (norm.includes('tenchame') || norm.includes('tencha') || norm.includes('parentname')) colMap.parent_name = idx;
      else if (norm.includes('vochong') || norm.includes('phoingau') || norm.includes('spouse')) colMap.spouse = idx;
      else if (norm.includes('matduonglich') || norm.includes('matdl') || norm==='deathdatesolar') colMap.death_date_solar = idx;
      else if (norm.includes('huongtho') || norm==='lifespanoverride') colMap.lifespan_override = idx;
      else if (norm.includes('ngaysinh') || norm.includes('namsinh') || norm.includes('sinh')) colMap.birth_date = idx;
      else if (norm.includes('ngaymat') || norm.includes('nammat') || norm.includes('gioal') || norm.includes('mat')) colMap.death_date = idx;
      else if (norm.includes('trangthai') || norm.includes('tinhtrang')) colMap.status = idx;
      else if (norm.includes('vaitro') || norm.includes('danhhieu') || norm.includes('vịtri')) colMap.role = idx;
      else if (norm.includes('ghichu') || norm.includes('thongtin')) colMap.notes = idx;
    });

    const members = [];
    const errors = [];
    const warnings = [];
    const seenIds = new Set();

    for (let r = headerIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.every(c => c === '')) continue;

      const getVal = (field) => {
        const idx = colMap[field];
        return (idx !== undefined && row[idx]) ? row[idx].trim() : '';
      };

      const id = getVal('id') || `P${String(members.length + 1).padStart(3, '0')}`;
      const fullName = getVal('full_name');

      if (!fullName) {
        warnings.push(`Dòng ${r + 1}: Bỏ trống Họ và Tên.`);
        continue;
      }

      if (seenIds.has(id)) {
        errors.push(`Dòng ${r + 1}: Trùng lặp Mã ID "${id}".`);
      }
      seenIds.add(id);

      let christianName = getVal('christian_name');
      let gender = getVal('gender');
      let spouse = getVal('spouse');
      let notes = getVal('notes');

      // Auto deduce gender if missing
      if (!gender) {
        const lower = fullName.toLowerCase();
        if (lower.includes('thị') || ['maria', 'anna', 'têrêxa'].includes(christianName.toLowerCase())) {
          gender = 'Nữ';
        } else {
          gender = 'Nam';
        }
      }

      // Auto deduce branch type
      let branchType = getVal('branch_type');
      if (!branchType) {
        if (fullName.startsWith('Trần Ngọc')) branchType = 'Nội tộc (Trực hệ)';
        else if (fullName.startsWith('Trần Thị')) branchType = 'Nội tộc (Con gái)';
        else if (notes.includes('Cháu ngoại') || !fullName.startsWith('Trần ')) branchType = 'Ngoại tộc (Cháu ngoại)';
        else branchType = 'Nội tộc';
      }

      // Auto deduce status
      let status = getVal('status');
      let deathDate = getVal('death_date');
      if (!status) {
        if (deathDate || notes.toLowerCase().includes('đã chết') || notes.toLowerCase().includes('mất')) {
          status = (notes.toLowerCase().includes('sớm') || notes.toLowerCase().includes('nhỏ')) ? 'Mất sớm' : 'Đã mất';
        } else {
          status = 'Còn sống';
        }
      }

      // Auto role
      let role = getVal('role');
      if (!role) {
        if (notes.includes('ĐÍCH TÔN')) role = 'Đích Tôn';
        else if (id === 'P001' || notes.includes('Thủy Tổ')) role = 'Thủy Tổ';
        else if (notes.includes('Trưởng Chi')) role = 'Trưởng Chi';
        else if (notes.includes('Tu sỹ')) role = 'Tu sỹ';
        else role = 'Thành viên';
      }

      members.push({
        id,
        christian_name: christianName,
        full_name: fullName,
        gender,
        generation: getVal('generation') || '1',
        branch: getVal('branch') || 'Chi 1',
        branch_type: branchType,
        parent_id: getVal('parent_id') || '-',
        parent_name: getVal('parent_name') || '',
        spouse,
        birth_date: getVal('birth_date'),
        death_date: deathDate,
        death_date_solar: getVal('death_date_solar'),
        lifespan_override: getVal('lifespan_override'),
        status,
        role,
        notes
      });
    }

    // Check parent links
    for (const m of members) {
      if (m.parent_id && m.parent_id !== '-' && !seenIds.has(m.parent_id)) {
        warnings.push(`Thành viên "${m.full_name}" (${m.id}) có Mã Cha/Mẹ "${m.parent_id}" không tồn tại trong danh sách.`);
      }
    }

    return {
      success: errors.length === 0,
      members,
      total: members.length,
      errors,
      warnings
    };
  }
}
