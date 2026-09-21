import copy, importlib.util, unittest, tempfile, pickle, os
from rail_graph import compact, load_graph

spec = importlib.util.spec_from_file_location('rail_itinerary', 'scripts/rail-itinerary.py')
rail = importlib.util.module_from_spec(spec); spec.loader.exec_module(rail)


def network():
    nodes = [(110, 30), (110.01, 30.01), (110.01, 29.99), (110.02, 30)]
    edges = []; adj = [[] for _ in nodes]
    for a, b in [(0, 1), (1, 3), (0, 2), (2, 3)]:
        eid = len(edges); edges.append((a, b, rail.distance(nodes[a], nodes[b]), '铁路', eid, [*nodes[a], *nodes[b]]))
        adj[a].append((b, eid)); adj[b].append((a, eid))
    stations = {name: [(i, 0, {'lng': nodes[i][0], 'lat': nodes[i][1]})] for i, name in enumerate(['甲', '北', '南', '乙'])}
    return {'nodes': nodes, 'edges': edges, 'adj': adj, 'stations': stations}


class OrderedRailTests(unittest.TestCase):
    def test_compact_graph_preserves_geometry(self):
        with tempfile.TemporaryDirectory() as directory:
            source = os.path.join(directory, 'source.pickle'); target = os.path.join(directory, 'rail.rgraph')
            graph = network(); graph['metadata'] = {}
            with open(source, 'wb') as stream: pickle.dump(graph, stream)
            compact(source, target)
            self.assertEqual(rail.RailRouter(load_graph(target), {}).route(['甲', '北', '乙'], 'G1'), rail.RailRouter(network(), {}).route(['甲', '北', '乙'], 'G1'))
    def test_same_endpoints_different_ordered_stops(self):
        north = rail.RailRouter(network(), {}).route(['甲', '北', '乙'], 'G1')
        south = rail.RailRouter(network(), {}).route(['甲', '南', '乙'], 'G2')
        self.assertNotEqual(north['segments'], south['segments'])
        self.assertIn((110.01, 30.01), north['segments'][0])
        self.assertEqual(south['segments'][0][0], north['segments'][0][0])

    def test_missing_stop_or_disconnected_graph_is_not_skipped(self):
        self.assertIsNone(rail.RailRouter(network(), {}).route(['甲', '不存在', '乙'], 'G1'))
        broken = network(); broken['adj'][0] = []
        self.assertIsNone(rail.RailRouter(broken, {}).route(['甲', '乙'], 'G1'))

    def test_station_inside_edge_splits_existing_geometry(self):
        graph = network(); graph['edges'][0] = (0, 1, 2000, '铁路', 0, [110, 30, 110.005, 30.005, 110.01, 30.01])
        route = rail.RailRouter(graph, {}, {'中': [110.005, 30.005]}).route(['甲', '中', '北'], 'G1')
        self.assertEqual(route['segments'][0], [(110, 30), (110.005, 30.005), (110.01, 30.01)])

    def test_provider_position_resolves_duplicate_station_name(self):
        places = {'中': [{'lng': 110.01, 'lat': 30.01}, {'lng': 120, 'lat': 40}]}
        router = rail.RailRouter(network(), copy.deepcopy(places), {'中': [110.01, 30.01]})
        self.assertIsNotNone(router.route(['甲', '中', '乙'], 'G1'))


if __name__ == '__main__': unittest.main()
