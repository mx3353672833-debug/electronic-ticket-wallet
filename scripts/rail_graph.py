"""Compact, memory-mapped rail graph; no external packages required."""
import json, mmap, os, pickle, struct, sys
from array import array


class Rows:
    def __init__(self, count, read):
        self.count, self.read, self.extra, self.changed = count, read, [], {}
    def __len__(self): return self.count+len(self.extra)
    def __getitem__(self, i):
        if i < 0 or i >= len(self): raise IndexError(i)
        if i >= self.count: return self.extra[i-self.count]
        return self.changed[i] if i in self.changed else self.read(i)
    def __setitem__(self, i, value):
        if i >= self.count: self.extra[i-self.count] = value
        else: self.changed[i] = value
    def append(self, value): self.extra.append(value)


def load_graph(filename):
    if not filename.endswith('.rgraph'):
        with open(filename, 'rb') as source: return pickle.load(source)
    with open(filename, 'rb') as source: mapping = mmap.mmap(source.fileno(), 0, access=mmap.ACCESS_READ)
    size = struct.unpack('<Q', mapping[:8])[0]; header = json.loads(mapping[8:8+size]); base = 8+size
    if header['version'] != 1 or header['byteorder'] != sys.byteorder: raise ValueError('Unsupported rail graph')
    views = {name: memoryview(mapping)[base+part['offset']:base+part['offset']+part['bytes']].cast(part['type']) for name, part in header['parts'].items()}
    nodes, edges, lengths, coords, starts, adjacency = [views[k] for k in ('nodes', 'edges', 'lengths', 'coords', 'starts', 'adjacency')]
    names, osm = header['names'], header['osm']
    def edge(i):
        a, b, name, identifier, start, end = edges[i*6:i*6+6]
        return a, b, lengths[i], names[name], osm[identifier], coords[start:end]
    return {'nodes': Rows(len(nodes)//2, lambda i: (nodes[i*2], nodes[i*2+1])),
            'edges': Rows(len(lengths), edge),
            'adj': Rows(len(starts)-1, lambda i: [(adjacency[j], adjacency[j+1]) for j in range(starts[i], starts[i+1], 2)]),
            'stations': header['stations'], 'metadata': header['metadata'], '_mapping': mapping}


def compact(source, destination):
    if os.path.exists(destination): raise FileExistsError('Output exists; choose a new filename')
    with open(source, 'rb') as stream: network = pickle.load(stream)
    names = []; name_ids = {}; osm = []; osm_ids = {}
    def intern(value, values, index):
        if value not in index: index[value] = len(values); values.append(value)
        return index[value]
    nodes = array('d', (v for xy in network['nodes'] for v in xy)); edges = array('I'); lengths = array('d'); coords = array('d')
    for a, b, length, name, identifier, packed in network['edges']:
        start = len(coords); coords.extend(packed)
        edges.extend((a, b, intern(name, names, name_ids), intern(identifier, osm, osm_ids), start, len(coords))); lengths.append(length)
    starts = array('I', [0]); adjacency = array('I')
    for row in network['adj']:
        adjacency.extend(v for pair in row for v in pair); starts.append(len(adjacency))
    parts = {}; offset = 0
    buffers = dict(nodes=nodes, edges=edges, lengths=lengths, coords=coords, starts=starts, adjacency=adjacency)
    for name, values in buffers.items():
        parts[name] = {'offset': offset, 'bytes': len(values)*values.itemsize, 'type': values.typecode}; offset += len(values)*values.itemsize
    header = json.dumps({'version': 1, 'byteorder': sys.byteorder, 'parts': parts, 'names': names, 'osm': osm, 'stations': network['stations'], 'metadata': network['metadata']}, ensure_ascii=False).encode()
    with open(destination, 'xb') as stream:
        os.chmod(destination, 0o600); stream.write(struct.pack('<Q', len(header))); stream.write(header)
        for values in buffers.values(): values.tofile(stream)


if __name__ == '__main__': compact(sys.argv[1], sys.argv[2])
