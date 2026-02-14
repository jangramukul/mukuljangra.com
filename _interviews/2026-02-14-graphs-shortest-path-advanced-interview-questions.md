---
title: "Graphs — Shortest Path & Advanced"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 7
---

## Graphs — Shortest Path & Advanced

Shortest path algorithms and advanced graph techniques like MST and Union-Find show up frequently in coding rounds at top companies. You need to know when to pick Dijkstra over Bellman-Ford and how Union-Find powers Kruskal's algorithm.

### Core Questions (Beginner → Intermediate)

#### Q1: What is Dijkstra's algorithm and when do you use it?

Dijkstra's finds the shortest path from a single source to all other vertices in a weighted graph with non-negative edge weights. It uses a greedy approach — always process the unvisited vertex with the smallest known distance. You use it when all edge weights are zero or positive.

```kotlin
fun dijkstra(graph: Map<Int, List<Pair<Int, Int>>>, source: Int): IntArray {
    val n = graph.size
    val dist = IntArray(n) { Int.MAX_VALUE }
    dist[source] = 0
    // Min-heap: (distance, node)
    val pq = PriorityQueue<Pair<Int, Int>>(compareBy { it.first })
    pq.add(0 to source)

    while (pq.isNotEmpty()) {
        val (d, u) = pq.poll()
        if (d > dist[u]) continue
        for ((v, w) in graph[u] ?: emptyList()) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w
                pq.add(dist[v] to v)
            }
        }
    }
    return dist
}
```

Time: O((V + E) log V) with a binary heap. Space: O(V + E).

#### Q2: Why does Dijkstra's algorithm fail with negative edge weights?

Dijkstra assumes that once a node is processed (popped from the priority queue), its shortest distance is final. With negative edges, a longer path through an unprocessed node could later become shorter after adding a negative weight. The greedy assumption breaks — you'd skip a node thinking its distance is settled, but a cheaper route could still appear through a negative edge.

#### Q3: What is the Bellman-Ford algorithm?

Bellman-Ford computes shortest paths from a single source and handles negative edge weights. It relaxes every edge V-1 times. After V-1 iterations, if any edge can still be relaxed, the graph contains a negative-weight cycle.

```kotlin
fun bellmanFord(edges: List<Triple<Int, Int, Int>>, n: Int, source: Int): IntArray? {
    val dist = IntArray(n) { Int.MAX_VALUE }
    dist[source] = 0

    repeat(n - 1) {
        for ((u, v, w) in edges) {
            if (dist[u] != Int.MAX_VALUE && dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w
            }
        }
    }
    // Check for negative-weight cycles
    for ((u, v, w) in edges) {
        if (dist[u] != Int.MAX_VALUE && dist[u] + w < dist[v]) return null
    }
    return dist
}
```

Time: O(V * E). Space: O(V).

#### Q4: When would you choose Bellman-Ford over Dijkstra?

Use Bellman-Ford when the graph has negative edge weights or when you need to detect negative-weight cycles. Also use it for problems with a constraint on the number of edges in the path (like cheapest flights within K stops) because you can control the number of relaxation rounds. If all weights are non-negative, Dijkstra is faster.

#### Q5: What is the Floyd-Warshall algorithm?

Floyd-Warshall finds shortest paths between all pairs of vertices. It uses dynamic programming — for each intermediate vertex k, it checks whether going through k improves the shortest path between every pair (i, j). It works with negative weights but not negative cycles.

```kotlin
fun floydWarshall(dist: Array<IntArray>): Array<IntArray> {
    val n = dist.size
    for (k in 0 until n) {
        for (i in 0 until n) {
            for (j in 0 until n) {
                if (dist[i][k] != Int.MAX_VALUE && dist[k][j] != Int.MAX_VALUE) {
                    dist[i][j] = minOf(dist[i][j], dist[i][k] + dist[k][j])
                }
            }
        }
    }
    return dist
}
```

Time: O(V^3). Space: O(V^2). Use it when V is small (a few hundred nodes) and you need all-pairs shortest paths.

#### Q6: How do you decide which shortest path algorithm to use?

It depends on the problem constraints:
- **Single source, non-negative weights** — Dijkstra (fastest option).
- **Single source, negative weights or edge count limit** — Bellman-Ford.
- **All pairs, small V** — Floyd-Warshall.
- **Unweighted graph** — plain BFS gives shortest paths in O(V + E).
- **DAG** — topological sort + relaxation in O(V + E), faster than Dijkstra.

#### Q7: What is a Minimum Spanning Tree?

A minimum spanning tree (MST) of a connected, undirected, weighted graph is a subset of edges that connects all vertices with the minimum total edge weight and no cycles. For V vertices, the MST has exactly V-1 edges. The two classic algorithms are Prim's and Kruskal's.

#### Q8: Explain Prim's algorithm for MST.

Prim's grows the MST from a starting vertex. It maintains a set of vertices already in the tree and a priority queue of edges crossing the cut (connecting tree vertices to non-tree vertices). At each step, pick the cheapest crossing edge and add the new vertex to the tree.

```kotlin
fun primMST(graph: Map<Int, List<Pair<Int, Int>>>, n: Int): Int {
    val visited = BooleanArray(n)
    // Min-heap: (weight, node)
    val pq = PriorityQueue<Pair<Int, Int>>(compareBy { it.first })
    pq.add(0 to 0)
    var totalWeight = 0

    while (pq.isNotEmpty()) {
        val (w, u) = pq.poll()
        if (visited[u]) continue
        visited[u] = true
        totalWeight += w
        for ((v, weight) in graph[u] ?: emptyList()) {
            if (!visited[v]) pq.add(weight to v)
        }
    }
    return totalWeight
}
```

Time: O((V + E) log V) with a binary heap. Space: O(V + E).

### Deep Dive Questions (Advanced → Expert)

#### Q9: Explain Kruskal's algorithm and how it uses Union-Find.

Kruskal's sorts all edges by weight and adds them one by one to the MST, skipping edges that would create a cycle. Cycle detection is done using Union-Find — if both endpoints of an edge are in the same connected component, adding it creates a cycle. The algorithm stops once V-1 edges are added.

```kotlin
fun kruskalMST(edges: List<Triple<Int, Int, Int>>, n: Int): Int {
    val sorted = edges.sortedBy { it.third }
    val parent = IntArray(n) { it }
    val rank = IntArray(n)
    var totalWeight = 0
    var edgeCount = 0

    fun find(x: Int): Int {
        if (parent[x] != x) parent[x] = find(parent[x])
        return parent[x]
    }

    fun union(x: Int, y: Int): Boolean {
        val px = find(x); val py = find(y)
        if (px == py) return false
        if (rank[px] < rank[py]) parent[px] = py
        else if (rank[px] > rank[py]) parent[py] = px
        else { parent[py] = px; rank[px]++ }
        return true
    }

    for ((u, v, w) in sorted) {
        if (union(u, v)) {
            totalWeight += w
            if (++edgeCount == n - 1) break
        }
    }
    return totalWeight
}
```

Time: O(E log E) for sorting + O(E * α(V)) for union-find operations, where α is the inverse Ackermann function (nearly constant). Space: O(V + E).

#### Q10: What is Union-Find (Disjoint Set Union)? Explain path compression and union by rank.

Union-Find tracks a collection of disjoint sets and supports two operations — `find` (which set does an element belong to?) and `union` (merge two sets). Without optimizations, trees can become skewed and operations degrade to O(n).

**Path compression** — during `find`, make every node along the path point directly to the root. This flattens the tree so future lookups are nearly O(1).

**Union by rank** — when merging two sets, attach the shorter tree under the root of the taller tree. This prevents the tree from growing unnecessarily tall.

Together, they give amortized O(α(n)) per operation, where α is the inverse Ackermann function — practically constant for any realistic input size.

#### Q11: What are some common problems where Union-Find is the right tool?

Union-Find works well for problems involving connectivity and grouping:
- **Number of connected components** — union nodes that share edges, count distinct roots.
- **Detecting cycles in undirected graphs** — if both endpoints of an edge share the same root before union, there's a cycle.
- **Kruskal's MST** — as described above.
- **Accounts merge** — group accounts that share an email.
- **Redundant connection** — find the edge that creates a cycle.
- **Earliest moment when everyone becomes friends** — process edges in time order, check when all nodes belong to one set.

#### Q12: How do you solve the Network Delay Time problem?

This is a direct application of Dijkstra's. You have n nodes and weighted directed edges representing network links. Given a source node, find the time it takes for a signal to reach all nodes — that's the maximum shortest path distance from the source. If any node is unreachable, return -1.

```kotlin
fun networkDelayTime(times: Array<IntArray>, n: Int, k: Int): Int {
    val graph = mutableMapOf<Int, MutableList<Pair<Int, Int>>>()
    for ((u, v, w) in times) {
        graph.getOrPut(u) { mutableListOf() }.add(v to w)
    }
    val dist = IntArray(n + 1) { Int.MAX_VALUE }
    dist[k] = 0
    val pq = PriorityQueue<Pair<Int, Int>>(compareBy { it.first })
    pq.add(0 to k)

    while (pq.isNotEmpty()) {
        val (d, u) = pq.poll()
        if (d > dist[u]) continue
        for ((v, w) in graph[u] ?: emptyList()) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w
                pq.add(dist[v] to v)
            }
        }
    }
    val result = dist.drop(1).max()
    return if (result == Int.MAX_VALUE) -1 else result
}
```

Time: O((V + E) log V). Space: O(V + E).

#### Q13: How do you solve Cheapest Flights Within K Stops?

This is a modified Bellman-Ford problem. You need the cheapest price from source to destination using at most K stops (K+1 edges). Run Bellman-Ford for exactly K+1 iterations instead of V-1. Use a copy of the distance array from the previous iteration to avoid propagating updates within the same round.

```kotlin
fun findCheapestPrice(
    n: Int, flights: Array<IntArray>,
    src: Int, dst: Int, k: Int
): Int {
    var dist = IntArray(n) { Int.MAX_VALUE }
    dist[src] = 0

    repeat(k + 1) {
        val temp = dist.copyOf()
        for ((u, v, w) in flights) {
            if (dist[u] != Int.MAX_VALUE && dist[u] + w < temp[v]) {
                temp[v] = dist[u] + w
            }
        }
        dist = temp
    }
    return if (dist[dst] == Int.MAX_VALUE) -1 else dist[dst]
}
```

Time: O(K * E). Space: O(V). The key detail is using the previous round's distances (`dist[u]`) to update the current round (`temp[v]`), so you don't count more edges than allowed.

#### Q14: When would you use Prim's vs Kruskal's for MST?

Prim's works better on dense graphs (many edges relative to vertices) because it operates on the adjacency list and uses a priority queue. Kruskal's works better on sparse graphs because sorting E edges is cheap when E is small. If the edges are already sorted or given as a list, Kruskal's avoids building an adjacency representation. For very dense graphs where E approaches V^2, Prim's with an adjacency matrix runs in O(V^2), which beats Kruskal's O(E log E).

#### Q15: Can Dijkstra's algorithm handle graphs with zero-weight edges? What about with a mix of zero and positive weights?

Yes. Dijkstra only fails with negative weights. Zero-weight edges are fine — they don't violate the greedy assumption. A zero-weight edge just means moving to a neighbor at no cost, and the algorithm handles this correctly because the relaxation condition `dist[u] + 0 < dist[v]` works as expected.

#### Q16: How would you find the shortest path in a graph where edges have weights 0 or 1 only?

Use a 0-1 BFS with a deque instead of a priority queue. When traversing an edge with weight 0, add the neighbor to the front of the deque. When traversing an edge with weight 1, add it to the back. This maintains the invariant that the deque is sorted by distance, giving you O(V + E) time — faster than Dijkstra's O((V + E) log V).

```kotlin
fun bfs01(graph: Map<Int, List<Pair<Int, Int>>>, source: Int, n: Int): IntArray {
    val dist = IntArray(n) { Int.MAX_VALUE }
    dist[source] = 0
    val deque = ArrayDeque<Int>()
    deque.addFirst(source)

    while (deque.isNotEmpty()) {
        val u = deque.removeFirst()
        for ((v, w) in graph[u] ?: emptyList()) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w
                if (w == 0) deque.addFirst(v) else deque.addLast(v)
            }
        }
    }
    return dist
}
```

Time: O(V + E). Space: O(V + E).

#### Q17: What is the cut property in MST algorithms and why does it matter?

The cut property states that for any cut of the graph (a partition of vertices into two sets), the minimum-weight edge crossing the cut must be in some MST. Both Prim's and Kruskal's rely on this property. Prim's directly picks the minimum crossing edge at each step. Kruskal's picks the globally smallest edge, and since it only adds edges that connect two different components, every added edge is a minimum crossing edge for that particular cut. Understanding this property helps you reason about correctness proofs and edge cases.

#### Q18: How do you detect a negative-weight cycle in a graph?

Run Bellman-Ford for V-1 iterations, then do one more pass over all edges. If any distance can still be reduced in this V-th iteration, a negative cycle exists. Bellman-Ford guarantees that after V-1 iterations, all shortest paths without negative cycles are finalized. Any further improvement means a path keeps getting shorter indefinitely through a cycle.

For directed graphs, this only detects cycles reachable from the source. To check the entire graph, either run Bellman-Ford from every vertex or add a virtual source connected to all vertices with zero-weight edges.

### Common Follow-ups

- How would you reconstruct the actual shortest path, not just the distance, in Dijkstra's?
- Can you run Dijkstra's on a graph with negative edges if you add a constant to all edge weights to make them positive?
- What is the difference between a shortest path tree and a minimum spanning tree?
- How does the A* algorithm improve on Dijkstra's? When is the heuristic admissible?
- How would you find the MST if one edge weight changes after the initial MST is computed?
- What is Boruvka's algorithm and how does it compare to Prim's and Kruskal's?
- How do you handle disconnected graphs in MST algorithms?
- What is the time complexity of Dijkstra's with a Fibonacci heap vs a binary heap?
