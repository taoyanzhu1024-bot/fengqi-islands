// ============================================================
// 轻量物理查询：地面高度（岛屿高度场 + 平台盒）与水平碰撞体
// ============================================================

// 有朝向的矩形平台（站台、观景台、栈道）
export class BoxSurface {
  constructor(cx, cz, top, halfL, halfW, angle = 0, thickness = 3) {
    Object.assign(this, { cx, cz, top, halfL, halfW, thickness });
    this.cos = Math.cos(angle); this.sin = Math.sin(angle);
    this.r = Math.hypot(halfL, halfW);
  }
  contains2(x, z) { return Math.abs(x - this.cx) < this.r && Math.abs(z - this.cz) < this.r; }
  heightAt(x, z) {
    const dx = x - this.cx, dz = z - this.cz;
    const lx = dx * this.cos + dz * this.sin;   // 沿 angle 方向
    const lz = -dx * this.sin + dz * this.cos;
    return Math.abs(lx) <= this.halfL && Math.abs(lz) <= this.halfW ? this.top : null;
  }
}

export class Physics {
  constructor() { this.surfaces = []; this.colliders = []; }

  addSurface(s) { this.surfaces.push(s); return s; }
  addCircle(x, z, r, y0 = -1e9, y1 = 1e9) { this.colliders.push({ type: 'c', x, z, r, y0, y1 }); }
  addBox(x, z, hx, hz, angle = 0, y0 = -1e9, y1 = 1e9) {
    this.colliders.push({ type: 'b', x, z, hx, hz, cos: Math.cos(angle), sin: Math.sin(angle), y0, y1 });
  }

  /** 脚下可站立的最高表面（不高于 y+step） */
  groundAt(x, z, y, step = 1.0) {
    let best = -Infinity;
    for (const s of this.surfaces) {
      if (!s.contains2(x, z)) continue;
      const h = s.heightAt(x, z);
      if (h !== null && h <= y + step && h > best) best = h;
    }
    return best;
  }

  /** 脚下表面对象（用于脚步声材质判断） */
  surfaceAt(x, z, y, step = 0.5) {
    let best = null, bh = -Infinity;
    for (const s of this.surfaces) {
      if (!s.contains2(x, z)) continue;
      const h = s.heightAt(x, z);
      if (h !== null && h <= y + step && h > bh) { bh = h; best = s; }
    }
    return best;
  }

  /** 该点最高表面（相机避免钻地） */
  topAt(x, z) {
    let best = -Infinity;
    for (const s of this.surfaces) {
      if (!s.contains2(x, z)) continue;
      const h = s.heightAt(x, z);
      if (h !== null && h > best) best = h;
    }
    return best;
  }

  /** 前方是否为过高的墙/坡 */
  blocked(x, z, y, step = 1.0) {
    for (const s of this.surfaces) {
      if (!s.contains2(x, z)) continue;
      const h = s.heightAt(x, z);
      if (h !== null && h > y + step && h - s.thickness < y + 1.6) return true;
    }
    return false;
  }

  /** 把角色推出碰撞体 */
  resolve(p, radius = 0.4) {
    for (const c of this.colliders) {
      if (p.y < c.y0 || p.y > c.y1) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      if (c.type === 'c') {
        const d = Math.hypot(dx, dz), m = c.r + radius;
        if (d < m && d > 1e-5) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
      } else {
        const lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
        const ex = c.hx + radius, ez = c.hz + radius;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
          let nx = lx, nz = lz;
          if (ex - Math.abs(lx) < ez - Math.abs(lz)) nx = Math.sign(lx || 1) * ex; else nz = Math.sign(lz || 1) * ez;
          p.x = c.x + nx * c.cos - nz * c.sin;
          p.z = c.z + nx * c.sin + nz * c.cos;
        }
      }
    }
  }
}
