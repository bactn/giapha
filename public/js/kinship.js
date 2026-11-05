// kinship.js - Vietnamese Family Tree Kinship Calculator (Tính danh xưng xưng hô dòng họ)
import { escapeHTML } from './html.js';
export class KinshipCalculator {
  static getAncestorsWithDistance(dataStore, memberId) {
    const ancestors = new Map(); // id -> distance (0 = self)
    ancestors.set(memberId, 0);

    let current = memberId;
    let dist = 0;
    while (current && current !== '-') {
      const m = dataStore.getMember(current);
      if (!m || !m.parent_id || m.parent_id === '-') break;
      dist++;
      ancestors.set(m.parent_id, dist);
      current = m.parent_id;
    }
    return ancestors;
  }

  static findLCA(dataStore, idA, idB) {
    const ancestorsA = this.getAncestorsWithDistance(dataStore, idA);
    const ancestorsB = this.getAncestorsWithDistance(dataStore, idB);

    let lca = null;
    let minSumDist = Infinity;

    for (const [id, distA] of ancestorsA.entries()) {
      if (ancestorsB.has(id)) {
        const distB = ancestorsB.get(id);
        const sumDist = distA + distB;
        if (sumDist < minSumDist) {
          minSumDist = sumDist;
          lca = { id, distA, distB };
        }
      }
    }
    return lca;
  }

  static calculateRelationship(dataStore, idA, idB) {
    if (!idA || !idB) return 'Vui lòng chọn đủ 2 người.';
    if (idA === idB) return 'Cả hai người được chọn là cùng một người.';

    const a = dataStore.getMember(idA);
    const b = dataStore.getMember(idB);
    if (!a || !b) return 'Không tìm thấy thông tin thành viên.';

    const lca = this.findLCA(dataStore, idA, idB);
    if (!lca) {
      return `Không tìm thấy tổ tiên chung giữa <strong>${escapeHTML(a.full_name)}</strong> và <strong>${escapeHTML(b.full_name)}</strong> (có thể thuộc 2 nhánh độc lập hoặc người nhập ngoại tộc).`;
    }

    const { distA, distB } = lca;
    const lcaMember = dataStore.getMember(lca.id);
    const isMaleA = a.gender === 'Nam';
    const isMaleB = b.gender === 'Nam';

    // 1. Direct Ancestor / Descendant
    if (distA === 0) {
      // A is ancestor of B
      if (distB === 1) return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>${isMaleA ? 'Cha' : 'Mẹ'}</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distB === 2) return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>${isMaleA ? 'Ông' : 'Bà'}</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distB === 3) return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>${isMaleA ? 'Cụ Ông' : 'Cụ Bà'}</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distB === 4) return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>${isMaleA ? 'Kỵ Ông' : 'Kỵ Bà'}</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
      return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>Tổ tiên Đời ${escapeHTML(a.generation)}</strong> của <strong>${escapeHTML(b.full_name)}</strong> (cách ${distB} thế hệ).`;
    }

    if (distB === 0) {
      // B is ancestor of A -> A is descendant of B
      if (distA === 1) return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>${isMaleA ? 'Con trai' : 'Con gái'}</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distA === 2) return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>${isMaleA ? 'Cháu nội/ngoại' : 'Cháu gái'}</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distA === 3) return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>Chắt</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distA === 4) return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>Chút</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
      return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>Con cháu Đời ${escapeHTML(a.generation)}</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
    }

    // 2. Siblings (distA = 1, distB = 1)
    if (distA === 1 && distB === 1) {
      const genA = parseInt(a.birth_date, 10) || 0;
      const genB = parseInt(b.birth_date, 10) || 0;
      if (genA && genB) {
        if (genA < genB) {
          return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>${isMaleA ? 'Anh ruột' : 'Chị ruột'}</strong> của <strong>${escapeHTML(b.full_name)}</strong> (Cùng cha/mẹ là ${escapeHTML(lcaMember.full_name)}).`;
        } else {
          return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>${isMaleA ? 'Em trai ruột' : 'Em gái ruột'}</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
        }
      }
      return `<strong>${escapeHTML(a.full_name)}</strong> và <strong>${escapeHTML(b.full_name)}</strong> là <strong>Anh/Chị/Em ruột</strong> (Cùng cha/mẹ là ${escapeHTML(lcaMember.full_name)}).`;
    }

    // 3. Same generation cousins (distA = distB >= 2)
    if (distA === distB) {
      const degree = distA;
      if (degree === 2) {
        return `<strong>${escapeHTML(a.full_name)}</strong> và <strong>${escapeHTML(b.full_name)}</strong> là <strong>Anh/Chị/Em họ (Con chú, con bác, con cô cậu)</strong>. Cùng có ông/bà chung là <strong>${escapeHTML(lcaMember.full_name)}</strong>.`;
      }
      return `<strong>${escapeHTML(a.full_name)}</strong> và <strong>${escapeHTML(b.full_name)}</strong> là <strong>Anh/Chị/Em họ cùng Thế Hệ Đời ${escapeHTML(a.generation)}</strong>. Cụ tổ chung là <strong>${escapeHTML(lcaMember.full_name)}</strong>.`;
    }

    // 4. One generation difference
    if (distB - distA === 1) {
      // A is one generation higher than B
      const role = isMaleA ? 'Bác / Chú họ' : 'Cô / Dì họ';
      return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>${role}</strong> của <strong>${escapeHTML(b.full_name)}</strong>.<br><span class="text-slate-500 font-normal">→ <strong>${escapeHTML(b.full_name)}</strong> gọi <strong>${escapeHTML(a.full_name)}</strong> là ${isMaleA ? 'Bác hoặc Chú' : 'Cô/Dì'}, và xưng là Cháu.</span>`;
    }

    if (distA - distB === 1) {
      // B is one generation higher than A -> A is nephew/niece
      return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>Cháu họ</strong> của <strong>${escapeHTML(b.full_name)}</strong>.<br><span class="text-slate-500 font-normal">→ <strong>${escapeHTML(a.full_name)}</strong> gọi <strong>${escapeHTML(b.full_name)}</strong> là ${b.gender === 'Nam' ? 'Bác/Chú' : 'Cô/Dì'}, và xưng là Cháu.</span>`;
    }

    // 5. Two or more generations difference
    if (distB - distA >= 2) {
      const genDiff = distB - distA;
      const grandRole = isMaleA ? 'Ông họ' : 'Bà họ';
      return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>${grandRole}</strong> (${genDiff} đời) của <strong>${escapeHTML(b.full_name)}</strong>. Tổ tiên chung là <strong>${escapeHTML(lcaMember.full_name)}</strong>.`;
    }

    if (distA - distB >= 2) {
      return `<strong>${escapeHTML(a.full_name)}</strong> là <strong>Cháu họ cành dưới</strong> của <strong>${escapeHTML(b.full_name)}</strong>.`;
    }

    return `Quan hệ phả hệ qua Cụ tổ <strong>${escapeHTML(lcaMember.full_name)}</strong>.`;
  }
}
