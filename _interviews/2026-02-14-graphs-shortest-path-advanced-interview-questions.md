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

So you know how to traverse a graph with BFS and DFS. But wait -- what happens when edges have weights, and you need to find the *cheapest* route from A to B? That's where shortest path algorithms come in. And once you throw in Minimum Spanning Trees and Union-Find, you've got the full toolkit that top companies love to test.

#### What is Dijkstra's algorithm and when do you use it?

Think of Dijkstra like a cautious traveler who always picks the cheapest next step. It finds the shortest path from a single source in a weighted graph with non-negative edge weights. It works greedily -- always process the vertex with the smallest known distance, lock it in, and move on. Like always taking the cheapest flight available right now, trusting that no future discount will beat it.

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

Here's the thing -- Dijkstra's greedy assumption is that once a node is processed, its shortest distance is final. Negative edges break that promise. A longer path through an unprocessed node could suddenly become shorter after adding a negative weight. It's like locking in a hotel price and then finding out another route gives you a cashback that makes it cheaper -- but you already committed.

#### What is Union-Find (Disjoint Set Union)?

Union-Find is like a club membership system. You can ask "which club does this person belong to?" (`find`) and "merge these two clubs" (`union`). Path compression flattens the internal trees during find so future lookups are faster. Union by rank attaches shorter trees under taller ones. Together they give amortized O(alpha(n)) per operation -- that's practically constant.

> **🧠 Think about it:** If Dijkstra can't handle negative weights, what algorithm would you reach for instead -- and why?

#### How do you solve Cheapest Flights Within K Stops?

Modified Bellman-Ford. Run exactly K+1 relaxation rounds. But here's the trick -- use a copy of the distance array from the previous iteration to avoid propagating updates within the same round. Without the copy, you'd accidentally use paths with more stops than allowed.

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

Bellman-Ford is the brute-force cousin of Dijkstra. Instead of being clever about which node to process next, it just relaxes *every* edge, V-1 times. It's slower, but it handles negative edge weights -- and it has a neat bonus: if any edge can still be relaxed after V-1 passes, you've found a negative-weight cycle.

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

This is the one you need to have on autopilot:

- **Single source, non-negative weights** -- Dijkstra
- **Single source, negative weights or edge count limit** -- Bellman-Ford
- **All pairs, small V** -- Floyd-Warshall
- **Unweighted graph** -- plain BFS in O(V + E)
- **DAG** -- topological sort + relaxation in O(V + E)

The key is the constraints. See "non-negative"? Dijkstra. See "at most K edges"? Bellman-Ford. See "all pairs" with V under 500? Floyd-Warshall.

#### What is a Minimum Spanning Tree?

Imagine you're laying cable to connect every house in a neighborhood. You want to connect all of them with the least total cable. That's an MST -- a subset of edges in a connected, undirected, weighted graph that connects all vertices with minimum total weight and no cycles. For V vertices, it has exactly V-1 edges. Two classic algorithms: Prim's and Kruskal's.

#### Explain Kruskal's algorithm and how it uses Union-Find.

Kruskal's is beautifully simple. Sort all edges by weight. Go through them one by one -- add an edge if it connects two different components, skip it if it would create a cycle. Union-Find makes that cycle check nearly instant. Stop after you've added V-1 edges.

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

> **🧠 Think about it:** Kruskal's sorts edges and picks the cheapest ones. Prim's grows from a single vertex. When would one beat the other?

#### Explain Prim's algorithm for MST.

Prim's works like growing a tree from a seed. Start from any vertex, and at each step, pick the cheapest edge that connects your current tree to a new vertex. It's like building a road network by always extending to the nearest unconnected town. A priority queue keeps this efficient.

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

This is Dijkstra in disguise. Run Dijkstra from the source node, then look at the maximum distance across all nodes. That's how long it takes for the signal to reach the farthest node. If any node is unreachable, return -1.

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

Anytime you're grouping things and asking "are these two in the same group?" -- that's Union-Find territory:

- **Connected components** -- union nodes sharing edges, count distinct roots
- **Cycle detection in undirected graphs** -- same root before union means cycle
- **Kruskal's MST**
- **Accounts merge** -- group accounts sharing an email
- **Redundant connection** -- find the edge creating a cycle

#### What is the Floyd-Warshall algorithm?

Floyd-Warshall answers the question "what's the shortest path between *every* pair of nodes?" It uses DP -- for each intermediate vertex k, check if routing through k improves the path between every pair (i, j). It's like asking "would a layover in city k make *any* trip cheaper?" for every possible layover city. Time O(V^3), so it only works for small graphs.

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

> **🧠 Think about it:** Floyd-Warshall runs in O(V^3). For a graph with 10,000 nodes, that's a trillion operations. At what graph size does it stop being practical?

#### When would you use Prim's vs Kruskal's?

Prim's works better on dense graphs because it operates on adjacency lists with a priority queue. Kruskal's wins on sparse graphs since sorting E edges is cheap when E is small. And if edges are already given as a list, Kruskal's has another advantage -- it doesn't need you to build an adjacency representation at all.

#### How do you find the shortest path with 0 and 1 edge weights?

Use 0-1 BFS with a deque. The idea is clever -- weight-0 edges go to the front of the deque, weight-1 edges go to the back. This preserves the BFS property that closer nodes are processed first. O(V + E) -- faster than Dijkstra for this special case.

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

Run Bellman-Ford for V-1 iterations, then do one more pass over all edges. If any distance can still be reduced, a negative cycle exists reachable from the source. It's like a loop in your budget where you keep finding "discounts" that never stop -- the total cost keeps dropping forever.

### Common Follow-ups

- How do you reconstruct the actual shortest path in Dijkstra's?
- Can you make negative edges work by adding a constant to all weights?
- What is the difference between a shortest path tree and an MST?
- How does A* improve on Dijkstra's?
- How do you handle disconnected graphs in MST algorithms?
- What is the time complexity of Dijkstra's with a Fibonacci heap?
- What is the cut property in MST algorithms?
