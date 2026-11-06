// auto-layout.js - Hierarchical Genealogy Layout Engine supporting Subtree/Branch Filtering
export class AutoLayout {
  constructor(options = {}) {
    this.nodeWidth = options.nodeWidth || 230;
    this.nodeHeight = options.nodeHeight || 140;
    this.siblingGap = options.siblingGap || 35;
    this.generationGap = options.generationGap || 130;
    this.orientation = options.orientation || 'VERTICAL'; // 'VERTICAL' (Top->Down) or 'HORIZONTAL' (Left->Right)
  }

  calculateLayout(dataStore, filterOption = 'ALL', maxDepth = 0) {
    const allMembers = dataStore.getAllMembers();
    if (allMembers.length === 0) {
      return { positions: new Map(), links: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
    }

    let visibleMembers = allMembers;
    let baseGenShift = 0;

    // 1. Subtree of a specific member
    if (typeof filterOption === 'string' && filterOption.startsWith('SUBTREE:')) {
      const rootId = filterOption.split(':')[1];
      const rootMember = dataStore.getMember(rootId);
      if (rootMember) {
        const descendants = dataStore.getDescendants(rootId);
        descendants.add(rootId);
        visibleMembers = allMembers.filter(m => descendants.has(m.id));
        baseGenShift = (parseInt(rootMember.generation, 10) || 1) - 1;
      }
    } else if (typeof filterOption === 'object' && filterOption && filterOption.type === 'SUBTREE') {
      const rootId = filterOption.rootId;
      const rootMember = dataStore.getMember(rootId);
      if (rootMember) {
        const descendants = dataStore.getDescendants(rootId);
        descendants.add(rootId);
        visibleMembers = allMembers.filter(m => descendants.has(m.id));
        baseGenShift = (parseInt(rootMember.generation, 10) || 1) - 1;
      }
    } else if (filterOption === 'Chi 1') {
      visibleMembers = allMembers.filter(m => m.branch === 'Chi 1' || m.branch === 'Ngành II');
    } else if (filterOption === 'Chi 2') {
      visibleMembers = allMembers.filter(m => m.branch === 'Chi 2' || m.branch === 'Ngành II');
    } else if (filterOption === 'PATERNAL_ONLY') {
      visibleMembers = allMembers.filter(m => m.branch_type && m.branch_type.includes('Nội tộc'));
    } else if (filterOption === 'MATERNAL_ONLY') {
      visibleMembers = allMembers.filter(m => m.branch_type && m.branch_type.includes('Ngoại tộc'));
    }

    // 2. Apply depth filter (maxDepth generations from the minimum generation)
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

    const memberMap = new Map();
    for (const m of visibleMembers) {
      memberMap.set(m.id, m);
    }

    // Build children mapping for visible set
    const childrenMap = new Map();
    for (const m of visibleMembers) {
      childrenMap.set(m.id, []);
    }

    const rootList = [];
    for (const m of visibleMembers) {
      if (!m.parent_id || m.parent_id === '-' || !memberMap.has(m.parent_id)) {
        rootList.push(m);
      } else {
        const parentChildren = childrenMap.get(m.parent_id);
        if (parentChildren) {
          parentChildren.push(m);
        }
      }
    }

    rootList.sort((a, b) => (parseInt(a.generation, 10) || 1) - (parseInt(b.generation, 10) || 1));
    for (const children of childrenMap.values()) {
      children.sort((a, b) => a.id.localeCompare(b.id));
    }

    const positions = new Map();

    // Bottom-up subtree width calculation
    const subtreeWidths = new Map();
    const computeSubtreeWidth = (id) => {
      const children = childrenMap.get(id) || [];
      if (children.length === 0) {
        subtreeWidths.set(id, this.nodeWidth);
        return this.nodeWidth;
      }
      let totalWidth = 0;
      for (let i = 0; i < children.length; i++) {
        if (i > 0) totalWidth += this.siblingGap;
        totalWidth += computeSubtreeWidth(children[i].id);
      }
      const width = Math.max(this.nodeWidth, totalWidth);
      subtreeWidths.set(id, width);
      return width;
    };

    for (const root of rootList) {
      computeSubtreeWidth(root.id);
    }

    // Top-down positioning
    let currentRootX = 50;
    const baseY = 80;

    const positionNode = (id, startX, level) => {
      const m = memberMap.get(id);
      const children = childrenMap.get(id) || [];
      const subtreeW = subtreeWidths.get(id) || this.nodeWidth;

      let nodeX, nodeY;

      if (this.orientation === 'VERTICAL') {
        const actualGen = parseInt(m.generation, 10) || (level + 1);
        const relGen = Math.max(1, actualGen - baseGenShift);
        nodeY = baseY + (relGen - 1) * (this.nodeHeight + this.generationGap);

        if (children.length === 0) {
          nodeX = startX + (subtreeW - this.nodeWidth) / 2;
        } else {
          let childX = startX;
          const childCenters = [];
          for (const child of children) {
            const childW = subtreeWidths.get(child.id) || this.nodeWidth;
            positionNode(child.id, childX, level + 1);
            const childPos = positions.get(child.id);
            childCenters.push(childPos.x + this.nodeWidth / 2);
            childX += childW + this.siblingGap;
          }
          const firstChildCenter = childCenters[0];
          const lastChildCenter = childCenters[childCenters.length - 1];
          nodeX = (firstChildCenter + lastChildCenter) / 2 - this.nodeWidth / 2;
        }
      } else {
        // HORIZONTAL orientation
        const actualGen = parseInt(m.generation, 10) || (level + 1);
        const relGen = Math.max(1, actualGen - baseGenShift);
        nodeX = baseY + (relGen - 1) * (this.nodeWidth + this.generationGap);

        if (children.length === 0) {
          nodeY = startX + (subtreeW - this.nodeHeight) / 2;
        } else {
          let childY = startX;
          const childCenters = [];
          for (const child of children) {
            const childW = subtreeWidths.get(child.id) || this.nodeHeight;
            positionNode(child.id, childY, level + 1);
            const childPos = positions.get(child.id);
            childCenters.push(childPos.y + this.nodeHeight / 2);
            childY += childW + this.siblingGap;
          }
          const firstChildCenter = childCenters[0];
          const lastChildCenter = childCenters[childCenters.length - 1];
          nodeY = (firstChildCenter + lastChildCenter) / 2 - this.nodeHeight / 2;
        }
      }

      positions.set(id, { x: nodeX, y: nodeY, member: m });
    };

    for (const root of rootList) {
      const rootW = subtreeWidths.get(root.id) || this.nodeWidth;
      positionNode(root.id, currentRootX, 0);
      currentRootX += rootW + this.siblingGap * 2;
    }

    // Build links
    const links = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const [id, pos] of positions.entries()) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + this.nodeWidth);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y + this.nodeHeight);

      const m = pos.member;
      if (m.parent_id && positions.has(m.parent_id)) {
        const parentPos = positions.get(m.parent_id);
        links.push({
          sourceId: m.parent_id,
          targetId: id,
          source: parentPos,
          target: pos,
          branch: m.branch
        });
      }
    }

    if (minX === Infinity) {
      minX = 0; maxX = 1000; minY = 0; maxY = 800;
    }

    return {
      positions,
      links,
      bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
      filterOption,
      totalNodes: positions.size
    };
  }

  generatePath(link) {
    const isVert = this.orientation === 'VERTICAL';
    const s = link.source;
    const t = link.target;

    if (isVert) {
      const sx = s.x + this.nodeWidth / 2;
      const sy = s.y + this.nodeHeight;
      const tx = t.x + this.nodeWidth / 2;
      const ty = t.y;

      const midY = (sy + ty) / 2;
      return {
        path: `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`,
        startPoint: { x: sx, y: sy },
        endPoint: { x: tx, y: ty }
      };
    } else {
      const sx = s.x + this.nodeWidth;
      const sy = s.y + this.nodeHeight / 2;
      const tx = t.x;
      const ty = t.y + this.nodeHeight / 2;

      const midX = (sx + tx) / 2;
      return {
        path: `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`,
        startPoint: { x: sx, y: sy },
        endPoint: { x: tx, y: ty }
      };
    }
  }
}
