---
title: "Graphs — BFS, DFS & Traversals"
date: 2026-02-14
layout: interview
tags: [DSA Round]
order: 6
sequence: 46
description: "Graph problems are among the most common in coding interviews."
---

## Graphs — BFS, DFS & Traversals

Graph problems are among the most common in coding interviews. BFS and DFS form the foundation — once you understand traversal patterns, problems like number of islands, course schedule, and word ladder become variations of the same core ideas.

#### How do you solve the Number of Islands problem?

Treat the grid as a graph where each '1' cell connects to its four neighbors. When you find a '1', increment count and DFS/BFS to mark all connected '1's as visited.

```kotlin
fun numIslands(grid: Array<CharArray>): Int {
    val rows = grid.size
    val cols = grid[0].size
    var count = 0

    fun dfs(r: Int, c: Int) {
        if (r !in 0 until rows || c !in 0 until cols || grid[r][c] == '0') return
        grid[r][c] = '0'
        dfs(r + 1, c); dfs(r - 1, c); dfs(r, c + 1); dfs(r, c - 1)
    }

    for (r in 0 until rows) for (c in 0 until cols) {
        if (grid[r][c] == '1') { count++; dfs(r, c) }
    }
    return count
}
```

Time O(m * n), space O(m * n) worst case for recursion stack.

#### How does BFS work and when do you use it?

BFS explores nodes level by level using a queue. It guarantees the shortest path in unweighted graphs because it visits nodes in order of distance from the source.

```kotlin
fun bfs(graph: Map<Int, List<Int>>, start: Int): List<Int> {
    val visited = mutableSetOf(start)
    val queue: Queue<Int> = LinkedList()
    queue.add(start)
    val order = mutableListOf<Int>()
    while (queue.isNotEmpty()) {
        val node = queue.poll()
        order.add(node)
        for (neighbor in graph[node].orEmpty()) {
            if (neighbor !in visited) {
                visited.add(neighbor)
                queue.add(neighbor)
            }
        }
    }
    return order
}
```

Time O(V + E), space O(V). Use BFS for shortest path in unweighted graphs and level-order traversal.

#### How does DFS work and when do you use it?

DFS goes as deep as possible along each branch before backtracking. Uses recursion or an explicit stack. Go-to for path finding, cycle detection, connected components, and topological sort.

```kotlin
fun dfs(graph: Map<Int, List<Int>>, start: Int): List<Int> {
    val visited = mutableSetOf<Int>()
    val order = mutableListOf<Int>()
    fun explore(node: Int) {
        visited.add(node)
        order.add(node)
        for (neighbor in graph[node].orEmpty()) {
            if (neighbor !in visited) explore(neighbor)
        }
    }
    explore(start)
    return order
}
```

Time O(V + E), space O(V).

#### How do you solve the Course Schedule problem?

Direct application of cycle detection in a directed graph. Courses are nodes, prerequisites are edges. If there's a cycle, you can't finish all courses. Use Kahn's algorithm.

```kotlin
fun canFinish(numCourses: Int, prerequisites: Array<IntArray>): Boolean {
    val graph = HashMap<Int, MutableList<Int>>()
    val inDegree = IntArray(numCourses)
    for ((course, prereq) in prerequisites) {
        graph.getOrPut(prereq) { mutableListOf() }.add(course)
        inDegree[course]++
    }
    val queue: Queue<Int> = LinkedList()
    for (i in 0 until numCourses) if (inDegree[i] == 0) queue.add(i)
    var completed = 0
    while (queue.isNotEmpty()) {
        val course = queue.poll()
        completed++
        for (next in graph[course].orEmpty()) {
            inDegree[next]--
            if (inDegree[next] == 0) queue.add(next)
        }
    }
    return completed == numCourses
}
```

Time O(V + E).

#### What is the difference between BFS and DFS?

BFS finds shortest path in unweighted graphs — DFS does not. BFS uses more memory (stores an entire level in queue). DFS only stores the current path.

Use BFS for shortest path and level-order problems. Use DFS for topological sort, cycle detection, connected components, and backtracking.

#### What is topological sort and when is it used?

Topological sort produces a linear ordering of vertices in a DAG such that for every edge u -> v, u comes before v. Used for dependency resolution — build systems, course prerequisites, task scheduling.

#### How do you implement topological sort using Kahn's algorithm?

Start with all nodes that have in-degree 0. Process each, decrement neighbors' in-degrees. When a neighbor hits 0, add it to the queue.

```kotlin
fun topologicalSort(n: Int, edges: List<IntArray>): List<Int> {
    val graph = HashMap<Int, MutableList<Int>>()
    val inDegree = IntArray(n)
    for ((u, v) in edges) {
        graph.getOrPut(u) { mutableListOf() }.add(v)
        inDegree[v]++
    }
    val queue: Queue<Int> = LinkedList()
    for (i in 0 until n) if (inDegree[i] == 0) queue.add(i)
    val result = mutableListOf<Int>()
    while (queue.isNotEmpty()) {
        val node = queue.poll()
        result.add(node)
        for (neighbor in graph[node].orEmpty()) {
            inDegree[neighbor]--
            if (inDegree[neighbor] == 0) queue.add(neighbor)
        }
    }
    return if (result.size == n) result else emptyList()
}
```

If the result has fewer than V nodes, the graph has a cycle.

#### How do you detect a cycle in a directed graph?

Use DFS with three states: unvisited, visiting (current path), visited. If you hit a "visiting" node, that's a cycle.

```kotlin
fun hasCycleDirected(n: Int, edges: List<IntArray>): Boolean {
    val graph = HashMap<Int, MutableList<Int>>()
    for ((u, v) in edges) graph.getOrPut(u) { mutableListOf() }.add(v)
    val state = IntArray(n) // 0=unvisited, 1=visiting, 2=visited

    fun dfs(node: Int): Boolean {
        state[node] = 1
        for (neighbor in graph[node].orEmpty()) {
            if (state[neighbor] == 1) return true
            if (state[neighbor] == 0 && dfs(neighbor)) return true
        }
        state[node] = 2
        return false
    }

    for (i in 0 until n) if (state[i] == 0 && dfs(i)) return true
    return false
}
```

#### How do you detect a cycle in an undirected graph?

A cycle exists if DFS encounters a visited node that isn't the parent of the current node.

```kotlin
fun hasCycleUndirected(n: Int, edges: List<IntArray>): Boolean {
    val graph = HashMap<Int, MutableList<Int>>()
    for ((u, v) in edges) {
        graph.getOrPut(u) { mutableListOf() }.add(v)
        graph.getOrPut(v) { mutableListOf() }.add(u)
    }
    val visited = BooleanArray(n)

    fun dfs(node: Int, parent: Int): Boolean {
        visited[node] = true
        for (neighbor in graph[node].orEmpty()) {
            if (!visited[neighbor]) {
                if (dfs(neighbor, node)) return true
            } else if (neighbor != parent) return true
        }
        return false
    }

    for (i in 0 until n) if (!visited[i] && dfs(i, -1)) return true
    return false
}
```

#### What are the main ways to represent a graph?

- **Adjacency List** — Each node stores its neighbors. Most common in interviews. O(V + E) space
- **Adjacency Matrix** — 2D array, `matrix[i][j] = 1` means edge exists. O(V^2) space. Good for dense graphs
- **Edge List** — List of pairs. O(E) space. Useful for Kruskal's

```kotlin
val graph = HashMap<Int, MutableList<Int>>()
fun addEdge(u: Int, v: Int) {
    graph.getOrPut(u) { mutableListOf() }.add(v)
    graph.getOrPut(v) { mutableListOf() }.add(u)
}
```

#### How do you solve the Word Ladder problem?

BFS shortest-path problem. Each word is a node, two words connect if they differ by one character. BFS from begin word to end word.

```kotlin
fun ladderLength(beginWord: String, endWord: String, wordList: List<String>): Int {
    val wordSet = wordList.toMutableSet()
    if (endWord !in wordSet) return 0
    val queue: Queue<String> = LinkedList()
    queue.add(beginWord)
    var steps = 1
    while (queue.isNotEmpty()) {
        repeat(queue.size) {
            val word = queue.poll()
            if (word == endWord) return steps
            val chars = word.toCharArray()
            for (i in chars.indices) {
                val original = chars[i]
                for (c in 'a'..'z') {
                    chars[i] = c
                    val newWord = String(chars)
                    if (newWord in wordSet) {
                        queue.add(newWord)
                        wordSet.remove(newWord)
                    }
                }
                chars[i] = original
            }
        }
        steps++
    }
    return 0
}
```

#### How do you clone a graph?

Use a HashMap mapping original nodes to clones. DFS or BFS — create clones on first visit, connect neighbors.

```kotlin
class GraphNode(var value: Int, var neighbors: MutableList<GraphNode> = mutableListOf())

fun cloneGraph(node: GraphNode?): GraphNode? {
    if (node == null) return null
    val clones = HashMap<GraphNode, GraphNode>()

    fun dfs(original: GraphNode): GraphNode {
        clones[original]?.let { return it }
        val copy = GraphNode(original.value)
        clones[original] = copy
        for (neighbor in original.neighbors) {
            copy.neighbors.add(dfs(neighbor))
        }
        return copy
    }
    return dfs(node)
}
```

#### How do you check if a graph is bipartite?

Assign colors using BFS/DFS. If a neighbor has the same color as the current node, it's not bipartite.

```kotlin
fun isBipartite(graph: Array<IntArray>): Boolean {
    val n = graph.size
    val color = IntArray(n) { -1 }
    for (i in 0 until n) {
        if (color[i] != -1) continue
        val queue: Queue<Int> = LinkedList()
        queue.add(i)
        color[i] = 0
        while (queue.isNotEmpty()) {
            val node = queue.poll()
            for (neighbor in graph[node]) {
                if (color[neighbor] == -1) {
                    color[neighbor] = 1 - color[node]
                    queue.add(neighbor)
                } else if (color[neighbor] == color[node]) {
                    return false
                }
            }
        }
    }
    return true
}
```

#### How do you find connected components in an undirected graph?

Iterate through all nodes. For each unvisited node, run BFS/DFS to mark all reachable nodes. Each new traversal is a new component.

### Common Follow-ups

- What's the difference between BFS and Dijkstra's algorithm?
- How would you find the shortest path in a graph with 0 and 1 edge weights?
- How do you find all paths between two nodes?
- How does bidirectional BFS work for Word Ladder?
- What is the difference between Kahn's and DFS-based topological sort?
- How would you find the shortest cycle in an undirected graph?
- Can you detect a cycle using BFS in a directed graph?
