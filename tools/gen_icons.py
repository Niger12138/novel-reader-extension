import zlib, struct, os

def png(path, w, h, rgba_rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rgba_rows)
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n'
    data += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9))
    data += chunk(b'IEND', b'')
    open(path, 'wb').write(data)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def in_round_rect(x, y, w, h, r):
    if x < 0 or y < 0 or x > w or y > h: return False
    cx = min(max(x, r), w - r); cy = min(max(y, r), h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def in_poly(x, y, pts):
    inside = False
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-9) + x1):
            inside = not inside
    return inside

def render(size):
    SS = 4
    W = size * SS
    c1, c2 = (222, 145, 97), (176, 96, 54)
    rows = []
    for yy in range(size):
        row = []
        for xx in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    x = xx * SS + sx + .5
                    y = yy * SS + sy + .5
                    r = 0; g = 0; b = 0; a = 0
                    if in_round_rect(x, y, W, W, W * 0.235):
                        t = (y / W) * .55 + (x / W) * .35
                        c = lerp(c1, c2, max(0.0, min(1.0, t)))
                        r, g, b = c
                        # 书本：左右两页
                        lx = W * .20; rx = W * .80; top = W * .33; bot = W * .70
                        spine_t = W * .47; spine_b = W * .50
                        left = [(lx, W * .40), (spine_t, W * .34), (spine_t, W * .62), (lx, W * .68)]
                        right = [(rx, W * .40), (spine_b, W * .34), (spine_b, W * .62), (rx, W * .68)]
                        if in_poly(x, y, left) or in_poly(x, y, right):
                            r, g, b = 255, 250, 243
                        # 书脊
                        if spine_t <= x <= spine_b and W * .34 <= y <= W * .62:
                            r, g, b = 246, 233, 216
                        a = 255
                    acc[0] += r; acc[1] += g; acc[2] += b; acc[3] += a
            n = SS * SS
            row.append(acc[0] // n); row.append(acc[1] // n); row.append(acc[2] // n); row.append(acc[3] // n)
        rows.append(row)
    return rows

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(out, exist_ok=True)
for s in (16, 48, 128):
    png(os.path.join(out, 'icon%d.png' % s), s, s, render(s))
    print('wrote icon%d.png' % s)
