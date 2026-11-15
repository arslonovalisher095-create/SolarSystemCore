#!/usr/bin/env python3
"""Сборка офлайн-снимка реальных каталогов для Solar Explorer.

Источники (все открытые):
  * CelesTrak GP (OMM JSON) через автоматическое зеркало github.com/satvisorcom/satvisor-data
    — все группы, включая облака обломков Fengyun-1C, Cosmos-2251, Iridium-33, Cosmos-1408,
      «зону защиты ГСО» (gpz, gpz-plus) и список сходящих с орбиты (decaying).
  * Stellarium data/ssystem_minor.ini (GPL-2.0) — оскулирующие элементы ~480 малых тел.
  * github.com/runningabc/moid MOID_20240916.csv — орбиты 35 792 околоземных астероидов (a, e, i, Ω, ω, MOID).

Запуск:
  python3 scripts/build-catalog.py <satvisor-data dir> <stellarium dir> <moid dir>
Пишет public/data/catalog/{earth,smallbodies,nea}.json
"""
import configparser
import csv
import datetime as dt
import json
import os
import re
import sys

SAT, STEL, MOID = sys.argv[1:4]
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'catalog')
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- Earth orbit
GROUP_TAG = {
    'stations': 'crew', 'starlink': 'starlink', 'oneweb': 'oneweb', 'kuiper': 'kuiper', 'qianfan': 'qianfan',
    'hulianwang': 'guowang', 'iridium-NEXT': 'iridium', 'globalstar': 'globalstar', 'orbcomm': 'orbcomm',
    'planet': 'planet', 'spire': 'spire',
    'gps-ops': 'gnss', 'glo-ops': 'gnss', 'galileo': 'gnss', 'beidou': 'gnss', 'gnss': 'gnss', 'sbas': 'gnss', 'nnss': 'gnss', 'musson': 'gnss',
    'geo': 'geo', 'intelsat': 'geo', 'ses': 'geo', 'eutelsat': 'geo', 'telesat': 'geo', 'x-comm': 'comm', 'other-comm': 'comm',
    'weather': 'weather', 'goes': 'weather', 'resource': 'earthobs', 'sarsat': 'sar', 'dmc': 'earthobs', 'argos': 'earthobs',
    'science': 'science', 'geodetic': 'science', 'engineering': 'tech', 'education': 'tech', 'cubesat': 'cubesat',
    'amateur': 'amateur', 'satnogs': 'amateur', 'military': 'military', 'radar': 'military', 'tdrss': 'relay',
    'visual': 'visual', 'last-30-days': 'new', 'analyst': 'analyst',
    'fengyun-1c-debris': 'evt:fy1c', 'cosmos-2251-debris': 'evt:c2251', 'iridium-33-debris': 'evt:i33', 'cosmos-1408-debris': 'evt:c1408',
}
SPECIAL_TAG = {'gpz': 'gpz', 'gpz-plus': 'gpz', 'decaying': 'decay'}

objs: dict[int, dict] = {}
tags: dict[int, set] = {}
active: set[int] = set()
groups_count = {}


def take(rows, tag=None, is_active=False):
    for r in rows:
        nid = int(r['NORAD_CAT_ID'])
        prev = objs.get(nid)
        if prev is None or r['EPOCH'] > prev['EPOCH']:
            objs[nid] = r
        if tag:
            tags.setdefault(nid, set()).add(tag)
        if is_active:
            active.add(nid)


def load(path):
    try:
        with open(path) as f:
            d = json.load(f)
        return d if isinstance(d, list) else []
    except Exception:
        return []


jdir = os.path.join(SAT, 'celestrak', 'json')
for fn in sorted(os.listdir(jdir)):
    g = fn[:-5]
    rows = load(os.path.join(jdir, fn))
    groups_count[g] = len(rows)
    take(rows, GROUP_TAG.get(g), is_active=(g == 'active'))
sdir = os.path.join(SAT, 'celestrak', 'special', 'json')
for fn in sorted(os.listdir(sdir)):
    g = fn[:-5]
    rows = load(os.path.join(sdir, fn))
    groups_count[g] = len(rows)
    take(rows, SPECIAL_TAG.get(g))

manifest = load_manifest = {}
try:
    with open(os.path.join(SAT, 'manifest.json')) as f:
        manifest = json.load(f)
except Exception:
    pass

# Класс объекта: 0 действующий аппарат, 1 обломок, 2 ступень ракеты, 3 неактивный аппарат, 4 неопознанный
def classify(nid, name, tg):
    n = name.upper()
    if ' DEB' in n or n.endswith('DEB') or any(t.startswith('evt:') for t in tg) and ('DEB' in n):
        return 1
    if 'R/B' in n or 'AKM' in n or 'PKM' in n or 'ROCKET' in n:
        return 2
    if nid in active:
        return 0
    if 'analyst' in tg or n.startswith('UNKNOWN') or n.startswith('OBJECT '):
        return 4
    if any(t.startswith('evt:') for t in tg):
        return 3  # родительский объект облака обломков (сам разрушенный спутник)
    return 3


def ms(epoch):
    t = dt.datetime.fromisoformat(epoch).replace(tzinfo=dt.timezone.utc)
    return int(t.timestamp() * 1000)


rows = []
cls_count = [0] * 5
for nid, r in sorted(objs.items()):
    tg = sorted(tags.get(nid, set()))
    c = classify(nid, r['OBJECT_NAME'], tg)
    cls_count[c] += 1
    rows.append([
        nid, r['OBJECT_NAME'].strip(), r.get('OBJECT_ID', ''), ms(r['EPOCH']),
        round(float(r['MEAN_MOTION']), 8), round(float(r['ECCENTRICITY']), 7), round(float(r['INCLINATION']), 4),
        round(float(r['RA_OF_ASC_NODE']), 4), round(float(r['ARG_OF_PERICENTER']), 4), round(float(r['MEAN_ANOMALY']), 4),
        float(r.get('BSTAR', 0) or 0), float(r.get('MEAN_MOTION_DOT', 0) or 0), float(r.get('MEAN_MOTION_DDOT', 0) or 0),
        c, ','.join(tg),
    ])

earth = {
    'source': 'CelesTrak GP data (USSPACECOM SSN), via github.com/satvisorcom/satvisor-data mirror',
    'generated': manifest.get('generatedAt') or dt.datetime.now(dt.timezone.utc).isoformat(),
    'columns': ['norad', 'name', 'cospar', 'epochMs', 'meanMotionRevDay', 'ecc', 'inclDeg', 'raanDeg', 'argpDeg', 'meanAnomDeg', 'bstar', 'ndot', 'nddot', 'cls', 'tags'],
    'classes': ['active', 'debris', 'rocket', 'inactive', 'unknown'],
    'groupCounts': groups_count,
    'classCounts': cls_count,
    'objects': rows,
}
with open(os.path.join(OUT, 'earth.json'), 'w') as f:
    json.dump(earth, f, separators=(',', ':'), ensure_ascii=False)
print('earth objects', len(rows), 'classes', cls_count)

# ---------------------------------------------------------------- Small bodies
cp = configparser.ConfigParser(strict=False, interpolation=None)
cp.read(os.path.join(STEL, 'data', 'ssystem_minor.ini'), encoding='utf-8')
sb = []
for s in cp.sections():
    o = cp[s]
    typ = o.get('type', '')
    if typ in ('artificial',):
        continue
    def f(k, d=None):
        v = o.get(k)
        try:
            return float(v) if v is not None else d
        except ValueError:
            return d
    e = f('orbit_eccentricity')
    i = f('orbit_inclination'); node = f('orbit_ascendingnode'); peri = f('orbit_argofpericenter')
    if None in (e, i, node, peri):
        continue
    a = f('orbit_semimajoraxis'); M = f('orbit_meananomaly'); ep = f('orbit_epoch')
    q = f('orbit_pericenterdistance'); tp = f('orbit_timeatpericenter')
    num = o.get('minor_planet_number')
    name = o.get('name') or o.get('iau_designation') or s
    if num and not name.startswith('('):
        name = f'({num}) {name}'
    if a is not None and M is not None and ep is not None:
        elem = ['a', a, M, ep]
    elif q is not None and tp is not None:
        elem = ['q', q, tp, ep or tp]
    else:
        continue
    sb.append({'n': name, 't': typ, 'e': e, 'i': i, 'O': node, 'w': peri, 'k': elem[0], 'x': elem[1], 'm': elem[2], 'ep': elem[3],
               'H': f('absolute_magnitude'), 'd': o.get('discoverer'), 'dd': o.get('discovery')})
with open(os.path.join(OUT, 'smallbodies.json'), 'w') as f:
    json.dump({'source': 'Stellarium data/ssystem_minor.ini (MPC/JPL elements, GPL-2.0)', 'bodies': sb}, f, separators=(',', ':'), ensure_ascii=False)
print('small bodies', len(sb))

# ---------------------------------------------------------------- NEA orbits (shape only)
cols = {k: [] for k in ('n', 'a', 'e', 'i', 'O', 'w', 'moid')}
with open(os.path.join(MOID, 'MOID_20240916.csv')) as f:
    rd = csv.reader(f)
    next(rd)
    for r in rd:
        try:
            vals = [float(x) for x in r[1:7]]
        except ValueError:
            continue
        cols['n'].append(r[0].strip())
        for k, v in zip(('a', 'e', 'i', 'O', 'w', 'moid'), vals):
            cols[k].append(round(v, 5))
with open(os.path.join(OUT, 'nea.json'), 'w') as f:
    json.dump({'source': 'Wang et al., MOID evolution dataset (github.com/runningabc/moid), elements as of 2024-09-16; orbit shapes only, no mean anomaly',
               'count': len(cols['n']), **cols}, f, separators=(',', ':'), ensure_ascii=False)
print('nea orbits', len(cols['n']))
