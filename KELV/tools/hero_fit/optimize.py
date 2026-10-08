import json, sys, copy, time
from tune import *

# (path, kind, step, lo, hi)  kind: 'mul' multiplicative step, 'add' additive step
PARAMS = [
    (('emission',), 'mul', 1.4, 0.05, 3), (('bounce',), 'mul', 1.6, 0, 20), (('ambient',), 'mul', 1.6, 0.05, 40),
    (('rim',), 'mul', 1.6, 0, 20), (('top',), 'mul', 1.6, 0, 60), (('fills', 0, 'intensity'), 'mul', 1.6, 0, 60),
    (('fills', 0, 'size'), 'mul', 1.5, 0.05, 2), (('fills', 0, 'position', 0), 'add', 0.15, -1, 1),
    (('fills', 0, 'position', 1), 'add', 0.15, -1, 1), (('fills', 0, 'position', 2), 'add', 0.15, -0.5, 1.5),
    (('exposure',), 'add', 0.25, -2, 2), (('grade', 'contrast'), 'add', 0.08, 0.6, 1.4),
    (('roughness',), 'mul', 1.3, 0.3, 4), (('bloom', 'strength'), 'mul', 1.6, 0, 0.12),
    (('cap', 'reflectivity'), 'mul', 1.5, 0, 3),
    (('lift', 'K2_CALM_Serum'), 'mul', 1.8, 0, 2),  (('bloom', 'radius'), 'mul', 1.4, 0.3, 4), (('cap', 'roughness'), 'mul', 1.8, 0.01, 0.6), (('lift', 'K3_SEAL_Cream'), 'mul', 1.8, 0, 2),
    (('fills', 0, 'target', 0), 'add', 0.1, -0.5, 0.5), (('fills', 0, 'target', 1), 'add', 0.1, -0.5, 0.5),
    (('glowLights', 'K3_SEAL_Cream'), 'mul', 1.4, 0, 3), (('glowLights', 'K2_CALM_Serum'), 'mul', 1.4, 0, 3), (('fills', 1, 'intensity'), 'mul', 1.8, 0, 200), (('fills', 1, 'size'), 'mul', 1.5, 0.01, 0.3),
    (('fills', 1, 'position', 0), 'add', 0.04, -0.3, 0.4), (('fills', 1, 'position', 1), 'add', 0.04, -0.3, 0.4), (('fills', 1, 'position', 2), 'add', 0.04, -0.2, 0.4),
]

def get(d, path):
    for k in path: d = d[k]
    return d

def put(d, path, v):
    for k in path[:-1]: d = d[k]
    d[path[-1]] = v

def score(m):
    return (m['serum'][0] + m['foam'][0] + m['cream'][0] + m['cap'][0] + m['halo'][0]) / 5

page = Page()
try:
    f = Fitter(page)
    look = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else page.js("JSON.parse(JSON.stringify(window.__LOOK))")
    if 'emission' not in look: look['emission'] = 1
    if 'roughness' not in look: look['roughness'] = 1
    look['lift'] = look.get('lift', {'K2_CALM_Serum': 0, 'K3_SEAL_Cream': 0})
    look['cap'].update(glow=0.02, tint='#e6e8ff', edge=3, edgePower=4)
    look.setdefault('glowLights', {'K2_CALM_Serum': 0.03, 'K3_SEAL_Cream': 0.2})
    if look['fills'][1]['intensity'] == 0: look['fills'][1]['intensity'] = 0.3
    if 'fill' in look:
        look['fills'] = [look.pop('fill'), {'intensity': 0, 'position': [0.14, 0.09, 0.1], 'target': [0.044, -0.013, -0.009], 'size': 0.06}]
    look['bloom']['strength'] = min(look['bloom']['strength'], 0.12)
    def evaluate(l):
        page.look(l); return f.measure()
    m = evaluate(look); best = score(m); print('start', round(best, 2), m, flush=True)
    steps = {p[0]: p[2] for p in PARAMS}
    for rnd in range(4):
        improved_any = False
        for path, kind, _, lo, hi in PARAMS:
            st = steps[path]
            for direction in (1, -1):
                while True:
                    cur = get(look, path)
                    if kind == 'mul':
                        nv = (cur * st if direction > 0 else cur / st) if cur > 0 else (0.05 if direction > 0 else 0)
                    else:
                        nv = cur + direction * st
                    nv = min(hi, max(lo, nv))
                    if nv == cur: break
                    trial = copy.deepcopy(look); put(trial, path, round(nv, 4))
                    tm = evaluate(trial); ts = score(tm)
                    if ts < best - 0.02:
                        look, best, m = trial, ts, tm; improved_any = True
                        print(rnd, '.'.join(map(str, path)), round(nv, 4), round(best, 2), {k: v[0] for k, v in m.items() if k != 'total'}, flush=True)
                    else:
                        break
            steps[path] = (st ** 0.6) if kind == 'mul' else st * 0.6
        json.dump(look, open('look_best.json', 'w'), indent=1)
        if not improved_any: break
    page.look(look); print('final', f.measure(save='tune_best.png'))
    print(json.dumps(look))
finally:
    page.close()
