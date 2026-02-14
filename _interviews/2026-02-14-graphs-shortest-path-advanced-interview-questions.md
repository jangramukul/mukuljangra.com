---
title: "Graphs — Shortest Path & Advanced"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 7
sequence: 47
description: "Shortest path algorithms and advanced graph techniques like MST and Union-Find show up frequently in coding rounds at top companies."
---

## Graphs — Shortest Path & Advanced

Shortest path algorithms and advanced graph techniques like MST and Union-Find show up frequently in coding rounds at top companies. You need to know when to pick Dijkstra over Bellman-Ford and how Union-Find powers Kruskal's algorithm.

#### What is Dijkstra's algorithm and when do you use it?

Dijkstra finds shortest paths from a single source in a weighted graph with non-negative edge weights. Uses a greedy approach — always process the vertex with the smallest known distance.

```kotlin
fun dijkstra(graph: Map<Int, List<Pair<Int, Int>>>, source: Int, n: Int): IntArray {
    val dist = IntArray(n) { Int.MAX_VALUE }
    dist[source] = 0
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

Time O((V + E) log V) with a binary heap.

#### Why does Dijkstra fail with negative edge weights?

Dijkstra assumes that once a node is processed, its shortest distance is final. With negative edges, a longer path through an unprocessed node could become shorter after adding a negative weight. The greedy assumption breaks.

#### What is Union-Find (Disjoint Set Union)?

Union-Find tracks disjoint sets with two operations — `find` (which set does an element belong to?) and `union` (merge two sets). Path compression flattens trees during find. Union by rank attaches shorter trees under taller ones. Together they give amortized O(alpha(n)) per operation — practically constant.

#### How do you solve Cheapest Flights Within K Stops?

Modified Bellman-Ford. Run exactly K+1 relaxation rounds. Use a copy of the distance array from the previous iteration to avoid propagating updates within the same round.

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

Time O(K * E), space O(V).

#### What is the Bellman-Ford algorithm?

Bellman-Ford computes shortest paths from a single source and handles negative edge weights. Relaxes every edge V-1 times. If any edge can still be relaxed after that, a negative-weight cycle exists.

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
    for ((u, v, w) in edges) {
        if (dist[u] != Int.MAX_VALUE && dist[u] + w < dist[v]) return null
    }
    return dist
}
```

Time O(V * E).

#### How do you decide which shortest path algorithm to use?

- **Single source, non-negative weights** — Dijkstra
- **Single source, negative weights or edge count limit** — Bellman-Ford
- **All pairs, small V** — Floyd-Warshall
- **Unweighted graph** — plain BFS in O(V + E)
- **DAG** — topological sort + relaxation in O(V + E)

#### What is a Minimum Spanning Tree?

An MST of a connected, undirected, weighted graph connects all vertices with minimum total edge weight and no cycles. For V vertices, it has exactly V-1 edges. Two classic algorithms: Prim's and Kruskal's.

#### Explain Kruskal's algorithm and how it uses Union-Find.

Sort all edges by weight. Add them one by one, skipping edges that would create a cycle (checked via Union-Find). Stop after V-1 edges.

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

Time O(E log E) for sorting.

#### Explain Prim's algorithm for MST.

Grows the MST from a starting vertex. Uses a priority queue of crossing edges. At each step, pick the cheapest edge that adds a new vertex.

```kotlin
fun primMST(graph: Map<Int, List<Pair<Int, Int>>>, n: Int): Int {
    val visited = BooleanArray(n)
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

Time O((V + E) log V).

#### How do you solve the Network Delay Time problem?

Direct Dijkstra application. Find the maximum shortest path distance from the source. If any node is unreachable, return -1.

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

#### What are common problems where Union-Find is the right tool?

- **Connected components** — union nodes sharing edges, count distinct roots
- **Cycle detection in undirected graphs** — same root before union means cycle
- **Kruskal's MST**
- **Accounts merge** — group accounts sharing an email
- **Redundant connection** — find the edge creating a cycle

#### What is the Floyd-Warshall algorithm?

All-pairs shortest paths using DP. For each intermediate vertex k, check if going through k improves the path between every pair (i, j). Time O(V^3).

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

#### When would you use Prim's vs Kruskal's?

Prim's works better on dense graphs (adjacency list + priority queue). Kruskal's works better on sparse graphs (sorting E edges is cheap when E is small). If edges are already given as a list, Kruskal's avoids building adjacency representation.

#### How do you find the shortest path with 0 and 1 edge weights?

Use 0-1 BFS with a deque. Weight 0 edges go to the front, weight 1 edges go to the back. O(V + E) — faster than Dijkstra.

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

#### How do you detect a negative-weight cycle?

Run Bellman-Ford for V-1 iterations, then one more pass. If any distance can still be reduced, a negative cycle exists reachable from the source.

### Common Follow-ups

- How do you reconstruct the actual shortest path in Dijkstra's?
- Can you make negative edges work by adding a constant to all weights?
- What is the difference between a shortest path tree and an MST?
- How does A* improve on Dijkstra's?
- How do you handle disconnected graphs in MST algorithms?
- What is the time complexity of Dijkstra's with a Fibonacci heap?
- What is the cut property in MST algorithms?
